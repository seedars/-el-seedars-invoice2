import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, sendPasswordResetEmail, signOut
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const authScreen = document.getElementById('authScreen');
const authForm = document.getElementById('authForm');
const authIntro = document.getElementById('authIntro');
const authStatus = document.getElementById('authStatus');
const emailInput = document.getElementById('authEmail');
const passwordInput = document.getElementById('authPassword');
const submitButton = document.getElementById('authSubmit');
const toggleButton = document.getElementById('authToggle');
const resetButton = document.getElementById('authReset');
const accountBar = document.getElementById('accountBar');
const syncStatus = document.getElementById('syncStatus');
const ownerKey = 'el-seedars-cloud-owner';
const priorUseKey = 'el-seedars-cloud-ever-used';
const dataKey = key => key.startsWith('el-seedars-') && key !== ownerKey && key !== priorUseKey || key.startsWith('elSeedarsInvoiceSerial-');
const captureSavedData = () => Object.fromEntries(Object.keys(localStorage).filter(dataKey).map(key => [key, localStorage.getItem(key)]));
function clearSavedData() { Object.keys(localStorage).filter(dataKey).forEach(key => localStorage.removeItem(key)); }
function restoreSavedData(saved) {
  if (!saved || typeof saved !== 'object') return;
  Object.entries(saved).forEach(([key, value]) => {
    if (dataKey(key) && typeof value === 'string') localStorage.setItem(key, value);
  });
}
function showMessage(message, error = false) {
  authStatus.textContent = message;
  authStatus.classList.toggle('error', error);
}
function readableError(error) {
  if (error?.code === 'auth/email-already-in-use') return 'This email has an account. Choose Log in.';
  if (error?.code === 'auth/weak-password') return 'Choose a stronger password.';
  if (error?.code === 'auth/invalid-email') return 'Enter a valid email address.';
  if (error?.code === 'auth/invalid-credential') return 'Email or password is incorrect.';
  if (error?.code === 'permission-denied') return 'Cloud access was denied. Check your Firestore rules in SETUP.md.';
  return error?.message || 'Please try again.';
}

if (!['apiKey', 'authDomain', 'projectId', 'appId'].every(key => firebaseConfig[key])) {
  authIntro.textContent = 'Account setup is needed before this version can open.';
  showMessage('Add your Firebase web app settings in firebase-config.js. Follow SETUP.md.', true);
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const legacyData = localStorage.getItem(priorUseKey) ? null : captureSavedData();
  let creatingAccount = false;
  let accountMode = 'login';
  let activeUser = null;
  let invoiceLoaded = false;
  let syncTimer = null;
  let syncChain = Promise.resolve();
  let transition = 0;

  function showAuth() {
    document.body.classList.add('auth-locked');
    accountBar.hidden = true;
    authScreen.hidden = false;
    authForm.hidden = false;
    toggleButton.hidden = false;
    resetButton.hidden = false;
    authIntro.textContent = accountMode === 'signup' ? 'Create an account to keep your invoices on your devices.' : 'Log in to your invoice workspace.';
    submitButton.textContent = accountMode === 'signup' ? 'Sign up' : 'Log in';
    toggleButton.textContent = accountMode === 'signup' ? 'Already have an account? Log in' : 'Create an account';
    passwordInput.autocomplete = accountMode === 'signup' ? 'new-password' : 'current-password';
  }
  toggleButton.addEventListener('click', () => {
    accountMode = accountMode === 'login' ? 'signup' : 'login';
    showMessage('');
    showAuth();
  });
  authForm.addEventListener('submit', async event => {
    event.preventDefault();
    submitButton.disabled = true;
    showMessage('Connecting…');
    creatingAccount = accountMode === 'signup';
    try {
      if (creatingAccount) await createUserWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
      else await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
      passwordInput.value = '';
    } catch (error) {
      creatingAccount = false;
      showMessage(readableError(error), true);
    } finally {
      submitButton.disabled = false;
    }
  });
  resetButton.addEventListener('click', async () => {
    if (!emailInput.reportValidity() || !emailInput.value.trim()) {
      showMessage('Enter your email address first.', true);
      emailInput.focus();
      return;
    }
    try {
      await sendPasswordResetEmail(auth, emailInput.value.trim());
      showMessage('If this email has an account, a password reset message will arrive.');
    } catch (error) { showMessage(readableError(error), true); }
  });

  function queueSync() {
    if (!activeUser) return;
    syncStatus.textContent = 'Saving…';
    clearTimeout(syncTimer);
    syncTimer = setTimeout(flushSync, 900);
  }
  async function flushSync() {
    if (!activeUser) return;
    clearTimeout(syncTimer);
    syncTimer = null;
    const uid = activeUser.uid;
    const storage = captureSavedData();
    // Firestore documents are limited in size; an oversized signature stays on this device.
    if ((storage['el-seedars-signature'] || '').length > 400000) {
      delete storage['el-seedars-signature'];
      syncStatus.textContent = 'Signature too large to sync; use a smaller image.';
    }
    syncChain = syncChain.catch(() => {}).then(() => setDoc(doc(db, 'invoiceUsers', uid), {
      storage, updatedAt: serverTimestamp()
    }));
    try { await syncChain; syncStatus.textContent = 'Saved'; return true; }
    catch (error) { syncStatus.textContent = `Save failed: ${readableError(error)}`; return false; }
  }
  document.getElementById('signOutButton').addEventListener('click', async () => {
    if (!await flushSync()) return;
    window.elSeedarsSync = undefined;
    activeUser = null;
    clearSavedData();
    localStorage.removeItem(ownerKey);
    localStorage.setItem(priorUseKey, 'true');
    await signOut(auth);
    location.reload();
  });

  onAuthStateChanged(auth, async user => {
    const currentTransition = ++transition;
    if (!user) { showAuth(); return; }
    authIntro.textContent = 'Opening your invoices…';
    authForm.hidden = true;
    toggleButton.hidden = true;
    resetButton.hidden = true;
    showMessage('Loading your saved entries…');
    try {
      const ref = doc(db, 'invoiceUsers', user.uid);
      const remote = await getDoc(ref);
      if (currentTransition !== transition) return;
      const importLegacy = !remote.exists() && creatingAccount && legacyData && Object.keys(legacyData).length;
      clearSavedData();
      if (remote.exists()) restoreSavedData(remote.data().storage);
      else if (importLegacy) {
        restoreSavedData(legacyData);
        await setDoc(ref, { storage: captureSavedData(), updatedAt: serverTimestamp() });
      }
      localStorage.setItem(ownerKey, user.uid);
      localStorage.setItem(priorUseKey, 'true');
      activeUser = user;
      creatingAccount = false;
      if (!invoiceLoaded) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = './Script.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Could not load the invoice. Refresh the page.'));
          document.body.appendChild(script);
        });
        invoiceLoaded = true;
      }
      window.elSeedarsSync = queueSync;
      document.getElementById('accountEmail').textContent = user.email || 'Signed in';
      accountBar.hidden = false;
      authScreen.hidden = true;
      document.body.classList.remove('auth-locked');
      syncStatus.textContent = 'Saved';
      queueSync();
    } catch (error) { showMessage(readableError(error), true); }
  });
}
