const tablesContainer = document.getElementById('tablesContainer');
const vatRateInput = document.getElementById('vatRate');
const amountPaidInput = document.getElementById('amountPaid');
const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 });
const itemAmount = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function writeSavedValue(key, value) {
  localStorage.setItem(key, value);
  window.elSeedarsSync?.();
}

function safeNumber(value) {
  const parsed = Number.parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumberField(input) {
  const before = input.value.slice(0, input.selectionStart ?? input.value.length);
  const position = (before.match(/[\d.]/g) || []).length;
  const cleaned = input.value.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  const raw = dot < 0 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
  const parts = raw.split('.');
  const whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = whole + (parts.length > 1 ? '.' + parts[1] : '');
  input.value = formatted;
  if (document.activeElement === input) {
    let cursor = formatted.length;
    let seen = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (/[\d.]/.test(formatted[i])) seen++;
      if (seen === position) { cursor = i + 1; break; }
    }
    if (position === 0) cursor = 0;
    input.setSelectionRange(cursor, cursor);
  }
}

function keepDigitsOnly(field) {
  const cursor = field.selectionStart ?? field.value.length;
  const digitsBeforeCursor = field.value.slice(0, cursor).replace(/\D/g, '').length;
  field.value = field.value.replace(/\D/g, '');
  field.setSelectionRange(digitsBeforeCursor, digitsBeforeCursor);
}

function keepDecimalOnly(field) {
  const clean = value => {
    const digitsAndDots = value.replace(/[^\d.]/g, '');
    const dot = digitsAndDots.indexOf('.');
    return dot < 0 ? digitsAndDots :
      digitsAndDots.slice(0, dot + 1) + digitsAndDots.slice(dot + 1).replace(/\./g, '');
  };
  const cursor = field.selectionStart ?? field.value.length;
  const cursorAfterCleaning = clean(field.value.slice(0, cursor)).length;
  field.value = clean(field.value);
  field.setSelectionRange(cursorAfterCleaning, cursorAfterCleaning);
}

function capitalizeEntry(field) {
  const start = field.selectionStart;
  const end = field.selectionEnd;
  const capitalized = field.value.replace(/(^|[^\p{L}\p{N}])(\p{Ll})/gu,
    (_, separator, letter) => separator + letter.toUpperCase());
  if (field.value === capitalized) return;
  field.value = capitalized;
  field.setSelectionRange(start, end);
}

const officeFieldIds = ['officeStreet', 'officeCity', 'officeCountry', 'officePhone', 'officeEmail'];
const socialFieldIds = ['whatsappNumber', 'facebookName', 'instagramName'];
function updateSocialContacts() {
  const saved = {};
  socialFieldIds.forEach(id => {
    const field = document.getElementById(id);
    const value = field.value.trim();
    field.closest('.social-row').classList.toggle('is-empty', !value);
    field.closest('.social-row').querySelector('.social-value').textContent = value;
    saved[id] = field.value;
  });
  writeSavedValue('el-seedars-social-contacts', JSON.stringify(saved));
}
try {
  const saved = JSON.parse(localStorage.getItem('el-seedars-social-contacts') || '{}');
  socialFieldIds.forEach(id => {
    if (typeof saved[id] === 'string') document.getElementById(id).value = saved[id];
  });
} catch (_) { /* Start with empty social contacts. */ }
socialFieldIds.forEach(id => document.getElementById(id).addEventListener('input', event => {
  if (id === 'whatsappNumber') keepDigitsOnly(event.target);
  updateSocialContacts();
}));
updateSocialContacts();
const positionSelect = document.getElementById('documentPosition');
const headerInfo = document.querySelector('.header-info');
function updateHeaderPosition() {
  headerInfo.dataset.position = positionSelect.value;
  writeSavedValue('el-seedars-title-position', positionSelect.value);
}
positionSelect.addEventListener('change', updateHeaderPosition);
const savedPosition = localStorage.getItem('el-seedars-title-position');
if (['left', 'center', 'right'].includes(savedPosition)) positionSelect.value = savedPosition;
updateHeaderPosition();

function fitOfficeAddress() {
  const office = document.querySelector('.header-info .company-details');
  const fields = [...office.querySelectorAll('input')].filter(field => field.id !== 'invoiceDate');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const widest = Math.max(...fields.map(field => {
    context.font = getComputedStyle(field).font;
    return context.measureText(field.value || field.placeholder || '').width;
  }), 0);
  office.style.width = `${Math.max(160, Math.ceil(widest + 14))}px`;
}
officeFieldIds.forEach(id => document.getElementById(id).addEventListener('input', fitOfficeAddress));
window.addEventListener('resize', fitOfficeAddress);
function saveOfficeDetails() {
  const details = Object.fromEntries(officeFieldIds.map(id => [id, document.getElementById(id).value]));
  writeSavedValue('el-seedars-office-details', JSON.stringify(details));
}
function loadOfficeDetails() {
  try {
    const saved = JSON.parse(localStorage.getItem('el-seedars-office-details') || '{}');
    officeFieldIds.forEach(id => {
      if (typeof saved[id] === 'string') document.getElementById(id).value = saved[id];
    });
  } catch (_) { /* Keep the supplied address when no saved details exist. */ }
}

function invoiceNumberFor(serial, dateValue) {
  const d = dateValue ? new Date(dateValue + 'T00:00:00') : new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `#${mm}${yy}${String(serial).padStart(4, '0')}`;
}

function currentYearSerial() {
  const year = new Date().getFullYear();
  const key = `elSeedarsInvoiceSerial-${year}`;
  return Number(localStorage.getItem(key) || '1');
}

function nextInvoiceNumber() {
  return invoiceNumberFor(currentYearSerial(), document.getElementById('invoiceDate')?.value);
}

function commitPrintedInvoiceNumber() {
  const dateValue = document.getElementById('invoiceDate')?.value;
  const d = dateValue ? new Date(dateValue + 'T00:00:00') : new Date();
  const year = d.getFullYear();
  const key = `elSeedarsInvoiceSerial-${year}`;
  const serial = Number(localStorage.getItem(key) || '1');
  writeSavedValue(key, String(serial + 1));
  return serial + 1;
}

function updateFormattedDate() {
  const field = document.getElementById('invoiceDate');
  const output = document.getElementById('formattedDate');
  const printed = document.getElementById('printFormattedDate');
  if (!field.value) { output.textContent = ''; printed.textContent = ''; return; }
  const [year, month, day] = field.value.split('-').map(Number);
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long' }).format(new Date(year, month - 1, day));
  output.textContent = `${day}, ${monthName} ${year}`;
  printed.textContent = output.textContent;
}
function setDates() {
  const today = new Date();
  document.getElementById('invoiceDate').value =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  updateFormattedDate();
}

function addTable(title = '') {
  const section = document.createElement('section');
  section.className = 'item-section';
  section.innerHTML = `
    <div class="section-heading">
      <input class="table-title" type="text" placeholder="Table heading (optional)" aria-label="Table heading">
      <button type="button" class="remove-table no-print" aria-label="Remove table">Remove Table</button>
    </div>
    <div class="table-wrap">
      <table class="items-table">
        <thead><tr><th class="sn">S/N</th><th>Description</th><th class="qty"><input class="measure-heading" type="text" list="measureNames" value="Qty" aria-label="Quantity column heading" title="Change to Depth, Weight, Length, etc."></th><th class="unit">Unit</th><th class="rate">Rate</th><th class="amount">Amount</th><th class="remove-col no-print">Remove</th></tr></thead>
        <tbody class="item-rows"></tbody>
        <tfoot><tr><td colspan="5" class="table-subtotal-label">Sub-Total</td><td class="table-subtotal">0.00</td><td class="remove-col no-print"></td></tr></tfoot>
      </table>
    </div>
    <button type="button" class="btn btn-light add-row no-print">＋ Add Item</button>`;
  section.querySelector('.table-title').value = title;
  section.querySelector('.add-row').addEventListener('click', () => addRow(section));
  section.querySelector('.remove-table').addEventListener('click', () => {
    if (tablesContainer.children.length < 2) return;
    section.remove();
    calculate();
  });
  tablesContainer.appendChild(section);
  addRow(section);
  updateTableControls();
  return section;
}

function updateTableControls() {
  const onlyOne = tablesContainer.children.length === 1;
  tablesContainer.querySelectorAll('.remove-table').forEach(button => { button.disabled = onlyOne; });
}

function addRow(section, description = '', quantity = '', unit = '', rate = '') {
  const row = document.createElement('tr');
  row.innerHTML = `
    <td class="row-number"></td>
    <td><input class="description" type="text" placeholder="Item or service description" aria-label="Description"></td>
    <td><input class="quantity formatted-number" type="text" inputmode="decimal" placeholder="" aria-label="Quantity"></td>
    <td><input class="unit-input" type="text" list="units" title="Optional: m, kg, pcs, etc." aria-label="Unit"></td>
    <td><input class="rate-input formatted-number" type="text" inputmode="decimal" placeholder="00" aria-label="Rate in naira"></td>
    <td class="line-total">${itemAmount.format(0)}</td>
    <td class="remove-col no-print"><button type="button" class="remove-row" aria-label="Remove item">✕</button></td>`;
  row.querySelector('.description').value = description;
  row.querySelector('.quantity').value = quantity;
  row.querySelector('.unit-input').value = unit;
  row.querySelector('.rate-input').value = rate;
  row.querySelectorAll('input').forEach(input => input.addEventListener('input', () => {
    if (input.classList.contains('formatted-number')) formatNumberField(input);
    calculate();
  }));
  row.querySelector('.remove-row').addEventListener('click', () => {
    row.remove();
    if (!section.querySelector('.item-rows').children.length) addRow(section);
    calculate();
  });
  section.querySelector('.item-rows').appendChild(row);
  calculate();
}

function calculate() {
  let subtotal = 0;
  tablesContainer.querySelectorAll('.item-section').forEach(section => {
    let sectionTotal = 0;
    section.querySelectorAll('.item-rows tr').forEach((row, index) => {
      row.querySelector('.row-number').textContent = index + 1;
      const lineTotal = safeNumber(row.querySelector('.quantity').value) * safeNumber(row.querySelector('.rate-input').value);
      sectionTotal += lineTotal;
      row.querySelector('.line-total').textContent = itemAmount.format(lineTotal);
    });
    section.querySelector('.table-subtotal').textContent = itemAmount.format(sectionTotal);
    subtotal += sectionTotal;
  });
  const vatAmount = subtotal * safeNumber(vatRateInput.value) / 100;
  const total = subtotal + vatAmount;
  document.getElementById('vatAmount').textContent = money.format(vatAmount);
  document.getElementById('total').textContent = money.format(total);
  document.getElementById('balance').textContent = money.format(total - safeNumber(amountPaidInput.value));
  updateDocumentType();
}

function updateDocumentType() {
  const paid = safeNumber(amountPaidInput.value);
  const type = document.getElementById('documentType');
  type.querySelector('option[value="receipt"]').disabled = paid <= 0;
  document.getElementById('documentHint').hidden = paid > 0;
  if (paid <= 0 && type.value === 'receipt') type.value = 'invoice';
  const isReceipt = type.value === 'receipt' && paid > 0;
  const isQuotation = type.value === 'quotation';
  document.body.classList.toggle('receipt-document', isReceipt);
  document.body.classList.toggle('quotation-document', isQuotation);
  document.getElementById('documentTitle').textContent = isReceipt ? 'RECEIPT' : isQuotation ? 'QUOTATION' : 'INVOICE';
  const numberInput = document.getElementById('invoiceNumber');
  const invoiceNumber = numberInput.dataset.invoiceNumber || numberInput.value;
  numberInput.value = isReceipt ? invoiceNumber.replace(/^#/, 'R#') : isQuotation ? invoiceNumber.replace(/^#/, 'Q#') : invoiceNumber;
  document.getElementById('receiptAmount').textContent = money.format(paid);
  document.getElementById('receiptReference').textContent = `Invoice reference: ${invoiceNumber}`;
}

function updatePrintVisibility() {
  updateDocumentType();
  updateSocialContacts();
  const isQuotation = document.getElementById('documentType').value === 'quotation';
  document.querySelector('.vat-line').classList.toggle('print-hide-empty', !vatRateInput.value.trim());
  document.querySelector('.paid-line').classList.toggle('print-hide-empty', isQuotation || !amountPaidInput.value.trim());
  document.querySelector('.balance').classList.toggle('print-hide-empty', isQuotation);
  const renderDetail = (targetId, fieldIds) => {
    const target = document.getElementById(targetId);
    const lines = target.querySelector('.print-lines');
    lines.replaceChildren();
    fieldIds.forEach(id => {
      const value = document.getElementById(id).value.trim();
      if (id === 'accountNumber' && value.length !== 10) return;
      if (!value) return;
      const line = document.createElement('div');
      line.className = 'print-line';
      line.textContent = value;
      lines.appendChild(line);
    });
    target.classList.toggle('print-hide-empty', !lines.children.length);
  };
  renderDetail('printCustomer', ['customerName', 'customerAddress', 'customerPhone']);
  const customerName = document.getElementById('customerName').value.trim();
  const prefix = document.getElementById('customerPrefix').value;
  if (prefix && customerName) document.querySelector('#printCustomer .print-line').textContent = `${prefix} ${customerName}`;
  renderDetail('printProject', ['projectName', 'projectLocation']);
  document.getElementById('printProject').classList.toggle('print-hide-empty',
    !document.querySelector('#printProject .print-lines').children.length &&
    !document.getElementById('printFormattedDate').textContent);
  renderDetail('printPayment', ['accountName', 'accountNumber', 'bankName']);
  if (document.body.classList.contains('receipt-document')) {
    document.getElementById('printPayment').classList.add('print-hide-empty');
  }
  document.querySelector('.print-details').classList.toggle('print-hide-empty',
    ['printCustomer', 'printProject'].every(id => document.getElementById(id).classList.contains('print-hide-empty')));
  const noteValue = document.getElementById('notes').value.trim();
  document.getElementById('printNotes').textContent = noteValue;
  document.querySelector('.notes').classList.toggle('print-hide-notes', !noteValue);
  tablesContainer.querySelectorAll('.item-section').forEach(section => {
    const title = section.querySelector('.table-title');
    title.classList.toggle('print-hide-empty', !title.value.trim());
    section.classList.toggle('no-units', ![...section.querySelectorAll('.unit-input')].some(input => input.value.trim()));
  });
}

function clearInvoice() {
  document.querySelectorAll('#customerPrefix, #customerName, #customerAddress, #customerPhone, #projectName, #projectLocation, #notes, #accountName, #accountNumber, #bankName').forEach(field => { field.value = ''; });
  vatRateInput.value = '0.0';
  amountPaidInput.value = '';
  document.getElementById('documentType').value = 'invoice';
  tablesContainer.innerHTML = '';
  const numberInput = document.getElementById('invoiceNumber');
  numberInput.dataset.manualNumber = '';
  numberInput.value = nextInvoiceNumber();
  numberInput.dataset.invoiceNumber = numberInput.value;
  setDates();
  addTable();
}

document.getElementById('addTable').addEventListener('click', () => addTable());
document.querySelectorAll('#customerName, #customerAddress, #projectName, #projectLocation, #accountName, #bankName, #officeStreet, #officeCity, #officeCountry')
  .forEach(field => field.addEventListener('input', event => {
    if (!event.isComposing) capitalizeEntry(field);
  }));
document.querySelectorAll('#customerPhone, #accountNumber, #officePhone')
  .forEach(field => field.addEventListener('input', () => keepDigitsOnly(field)));
const accountNumberInput = document.getElementById('accountNumber');
function validateAccountNumber() {
  const value = accountNumberInput.value;
  const invalid = !!value && value.length !== 10;
  accountNumberInput.setCustomValidity(invalid ? 'Account number must have exactly 10 digits.' : '');
  document.getElementById('accountNumberHint').hidden = !invalid;
  return !invalid;
}
accountNumberInput.addEventListener('input', () => {
  accountNumberInput.value = accountNumberInput.value.slice(0, 10);
  validateAccountNumber();
});
officeFieldIds.forEach(id => document.getElementById(id).addEventListener('input', saveOfficeDetails));
tablesContainer.addEventListener('input', event => {
  if (!event.isComposing &&
      (event.target.classList.contains('table-title') ||
       event.target.classList.contains('measure-heading'))) {
    capitalizeEntry(event.target);
  }
});
document.getElementById('invoiceNumber').addEventListener('input', event => {
  let value = event.target.value.trim();
  if (value && !value.startsWith('#')) value = '#' + value.replace(/^#+/, '');
  event.target.value = value;
  event.target.dataset.invoiceNumber = value || nextInvoiceNumber();
  event.target.dataset.manualNumber = 'true';
});
document.getElementById('invoiceDate').addEventListener('change', () => {
  updateFormattedDate();
  const n = document.getElementById('invoiceNumber');
  if (!n.dataset.manualNumber) {
    n.value = nextInvoiceNumber();
    n.dataset.invoiceNumber = n.value;
  }
});
document.getElementById('documentType').addEventListener('change', updateDocumentType);
tablesContainer.addEventListener('focusin', event => {
  if (event.target.classList.contains('measure-heading')) event.target.select();
});
vatRateInput.addEventListener('focus', () => vatRateInput.select());
vatRateInput.addEventListener('input', () => {
  keepDecimalOnly(vatRateInput);
  calculate();
});
amountPaidInput.addEventListener('input', calculate);
amountPaidInput.addEventListener('input', () => formatNumberField(amountPaidInput));

const signatureFile = document.getElementById('signatureFile');
const signatureImage = document.getElementById('signatureImage');
const signatureColor = document.getElementById('signatureColor');
const signatureColorControl = document.getElementById('signatureColorControl');
const signerName = document.getElementById('signerName');
const signatureScript = document.getElementById('signatureScript');
let signatureBase = null;
function renderSignatureColor() {
  if (!signatureBase) return;
  const { width, height, pixels } = signatureBase;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const tinted = imageData.data;
  const rgb = signatureColor.value.slice(1).match(/.{2}/g).map(part => parseInt(part, 16));
  for (let i = 0; i < pixels.length; i += 4) {
    const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    tinted[i] = rgb[0];
    tinted[i + 1] = rgb[1];
    tinted[i + 2] = rgb[2];
    tinted[i + 3] = Math.round(pixels[i + 3] * Math.min(1, Math.max(0, (230 - brightness) / 170)));
  }
  ctx.putImageData(imageData, 0, 0);
  signatureImage.src = canvas.toDataURL('image/png');
}
signatureColor.addEventListener('input', renderSignatureColor);
function updateSignatureName() {
  const words = signerName.value.trim().split(/\s+/).filter(Boolean);
  signatureScript.textContent = words.length > 1 ? `${words[0]} ${words[words.length - 1]}` : (words[0] || '');
  signatureScript.hidden = !signatureImage.hidden || !signatureScript.textContent;
}
function loadSignatureSource(dataUrl, persist = false) {
  const source = new Image();
  source.onload = () => {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 900 / source.naturalWidth, 400 / source.naturalHeight);
    canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const max = Math.max(d[i], d[i+1], d[i+2]);
      const min = Math.min(d[i], d[i+1], d[i+2]);
      const brightness = (d[i] + d[i+1] + d[i+2]) / 3;
      if (brightness > 235 && max - min < 28) d[i+3] = 0;
      else if (brightness > 205 && max - min < 35) d[i+3] = Math.min(d[i+3], Math.max(0, 255 - (brightness - 205) * 5));
    }
    if (persist) {
      ctx.putImageData(imageData, 0, 0);
      try { writeSavedValue('el-seedars-signature', canvas.toDataURL('image/png')); }
      catch (_) { /* Large images can exceed browser storage; the current upload still works. */ }
    }
    signatureBase = { width: canvas.width, height: canvas.height, pixels: new Uint8ClampedArray(d) };
    renderSignatureColor();
    signatureImage.hidden = false;
    signatureColorControl.hidden = false;
    document.querySelector('.signature').classList.remove('has-no-upload');
    updateSignatureName();
  };
  source.src = dataUrl;
}
function makeSignatureBackgroundTransparent(file) {
  const reader = new FileReader();
  reader.onload = event => loadSignatureSource(event.target.result, true);
  reader.readAsDataURL(file);
}
signatureFile.addEventListener('change', () => {
  const file = signatureFile.files && signatureFile.files[0];
  if (file) makeSignatureBackgroundTransparent(file);
});
signerName.addEventListener('input', event => {
  if (!event.isComposing) capitalizeEntry(signerName);
  updateSignatureName();
});
signerName.addEventListener('focus', () => {
  if (signerName.value === 'John Doe') {
    signerName.value = '';
    updateSignatureName();
    saveDraft();
  }
});
updateSignatureName();
try {
  const savedSignature = localStorage.getItem('el-seedars-signature');
  if (savedSignature) loadSignatureSource(savedSignature);
} catch (_) { /* The upload button remains available. */ }

const draftFieldIds = [
  'projectName', 'projectLocation', 'notes', 'accountName', 'accountNumber', 'bankName',
  'vatRate', 'amountPaid', 'invoiceDate', 'invoiceNumber', 'documentType', 'signerName', 'signatureColor'
];
function saveDraft() {
  const fields = Object.fromEntries(draftFieldIds.map(id => [id, document.getElementById(id).value]));
  const tables = [...tablesContainer.querySelectorAll('.item-section')].map(section => ({
    title: section.querySelector('.table-title').value,
    measure: section.querySelector('.measure-heading').value,
    rows: [...section.querySelectorAll('.item-rows tr')].map(row => ({
      description: row.querySelector('.description').value,
      quantity: row.querySelector('.quantity').value,
      unit: row.querySelector('.unit-input').value,
      rate: row.querySelector('.rate-input').value
    }))
  }));
  try {
    writeSavedValue('el-seedars-current-draft', JSON.stringify({
      fields, tables, companyName: document.querySelector('.brand h1').textContent,
      manualNumber: !!document.getElementById('invoiceNumber').dataset.manualNumber
    }));
  } catch (_) { /* Editing continues when local storage is full or unavailable. */ }
}
function restoreDraft() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem('el-seedars-current-draft') || 'null'); }
  catch (_) { return; }
  if (!saved || !saved.fields) return;
  draftFieldIds.forEach(id => {
    if (typeof saved.fields[id] === 'string') document.getElementById(id).value = saved.fields[id];
  });
  if (typeof saved.companyName === 'string') document.querySelector('.brand h1').textContent = saved.companyName;
  const number = document.getElementById('invoiceNumber');
  number.dataset.invoiceNumber = number.value;
  number.dataset.manualNumber = saved.manualNumber ? 'true' : '';
  if (Array.isArray(saved.tables) && saved.tables.length) {
    tablesContainer.replaceChildren();
    saved.tables.forEach(table => {
      const section = addTable(table.title || '');
      section.querySelector('.measure-heading').value = table.measure || 'Qty';
      (table.rows || []).forEach((item, index) => {
        const row = index === 0 ? section.querySelector('.item-rows tr') : (addRow(section), section.querySelector('.item-rows tr:last-child'));
        row.querySelector('.description').value = item.description || '';
        row.querySelector('.quantity').value = item.quantity || '';
        row.querySelector('.unit-input').value = item.unit || '';
        row.querySelector('.rate-input').value = item.rate || '';
      });
    });
  }
  updateFormattedDate();
  validateAccountNumber();
  updateSignatureName();
  calculate();
}

window.addEventListener('beforeprint', updatePrintVisibility);
document.getElementById('printInvoice').addEventListener('click', () => {
  if (!validateAccountNumber()) { accountNumberInput.reportValidity(); return; }
  updatePrintVisibility();
  document.body.classList.add('preview');
  window.scrollTo(0, 0);
});
document.getElementById('confirmPrint').addEventListener('click', () => {
  updatePrintVisibility();
  const printedValue = document.getElementById('invoiceNumber').value;
  window.print();
  if (!document.getElementById('invoiceNumber').dataset.manualNumber) {
    commitPrintedInvoiceNumber();
    document.getElementById('invoiceNumber').value = nextInvoiceNumber();
    document.getElementById('invoiceNumber').dataset.invoiceNumber = document.getElementById('invoiceNumber').value;
    saveDraft();
  }
});
document.getElementById('editInvoice').addEventListener('click', () => {
  document.body.classList.remove('preview');
});
document.getElementById('newInvoice').addEventListener('click', () => {
  if (confirm('Start a new invoice? The current entries will be cleared.')) { clearInvoice(); saveDraft(); }
});

const numberInput = document.getElementById('invoiceNumber');
loadOfficeDetails();
fitOfficeAddress();
numberInput.value = numberInput.value || nextInvoiceNumber();
numberInput.dataset.invoiceNumber = numberInput.value;
setDates();
addTable();
restoreDraft();
document.querySelectorAll('#customerPrefix, #customerName, #customerAddress, #customerPhone').forEach(field => {
  field.value = '';
  field.autocomplete = 'off';
});
document.getElementById('invoice').addEventListener('input', event => {
  if (!event.target.closest('#billToCard')) saveDraft();
});
document.getElementById('invoice').addEventListener('change', saveDraft);
document.getElementById('invoice').addEventListener('click', event => {
  if (event.target.closest('#addTable, .add-row, .remove-row, .remove-table')) saveDraft();
});
