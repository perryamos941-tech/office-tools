'use strict';

const officeAssetRoot = new URL('./', document.currentScript.src);
const officeAssets = new Map();
let officeReady;

function loadOfficeAsset(file, stylesheet = false) {
  if (officeAssets.has(file)) return officeAssets.get(file);
  const pending = new Promise((resolve, reject) => {
    const element = document.createElement(stylesheet ? 'link' : 'script');
    const url = new URL(file + '?v=4.22', officeAssetRoot).href;
    if (stylesheet) { element.rel = 'stylesheet'; element.href = url; }
    else element.src = url;
    element.onload = resolve;
    element.onerror = () => {
      element.remove();
      reject(new Error('無法載入處理元件，請重試。'));
    };
    document.head.append(element);
  }).catch((error) => {
    officeAssets.delete(file);
    throw error;
  });
  officeAssets.set(file, pending);
  return pending;
}

function ensureOfficeEngines() {
  if (officeReady) return officeReady;
  const banner = document.getElementById('boot');
  banner.textContent = '正在下載本機處理元件…';
  banner.hidden = false;
  officeReady = Promise.all([loadOfficeAsset('office-engines.js'), loadOfficeAsset('office-font.css', true)])
    .then(() => initBundles())
    .then(() => {
      engines = true;
      banner.hidden = true;
      pdfControls();
      imgLock(false);
    })
    .catch((error) => {
      officeReady = undefined;
      banner.hidden = true;
      throw error;
    });
  return officeReady;
}

function ensureOfficeOcrAssets() {
  return loadOfficeAsset('office-ocr.js');
}

function officeImageTarget() {
  const input = document.getElementById('office-image-target');
  if (!input.validity.valid) throw new Error('圖片目標大小須介乎 1–40960 KB。');
  return Number(input.value) * 1024;
}

async function officeImageBlob(canvas, settings, item) {
  const { target, type, quality } = settings;
  item.targetWarning = '';
  let output = await canvasBlob(canvas, type, quality);
  if (!target || output.size <= target) return output;
  if (type !== 'image/png' && quality > .1) {
    const smallest = await canvasBlob(canvas, type, .1);
    if (smallest.size < output.size) output = smallest;
    if (smallest.size <= target) {
      let lower = .1;
      let upper = quality;
      for (let attempt = 0; attempt < 7 && !imgCancel; attempt++) {
        const candidate = (lower + upper) / 2;
        const blob = await canvasBlob(canvas, type, candidate);
        if (blob.size <= target) { output = blob; lower = candidate; }
        else upper = candidate;
      }
    }
  }
  if (output.size > target) {
    item.targetWarning = '超出目標 ' + bytes(target);
  }
  return output;
}

function readOfficeTable(text, separator) {
  const rows = [];
  let row = [], cell = '', quoted = false, closing = false;
  const field = () => { row.push(cell); cell = ''; closing = false; };
  const record = () => { field(); rows.push(row); row = []; };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') { quoted = false; closing = true; }
      else cell += char;
    } else if (char === separator) field();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      record();
    } else if (char === '"' && !cell && !closing) quoted = true;
    else if (closing) {
      if (char !== ' ') throw new Error('引號後有無效字元。');
    } else cell += char;
  }
  if (quoted) throw new Error('有未閉合的引號。');
  if (row.length || cell || closing) record();
  return rows;
}

document.addEventListener('DOMContentLoaded', () => {
  const input = $('code-input');
  const upload = $('office-code-file');
  const review = $('office-code-review');
  const issues = $('office-code-issues');
  const list = $('office-code-issues-list');
  const refresh = () => {
    const seen = new Set();
    const notes = [];
    let count = 0;
    const type = $('code-type').value;
    const width = Number($('label-w').value);
    input.value.split(/\r?\n/).forEach((line, index) => {
      if (!line.trim()) return;
      count++;
      if (count > 200) return;
      const prefix = '第 ' + (index + 1) + ' 列：';
      try {
        const { code } = parseCodeLine(line);
        if (line.length > 2000 || (type === 'code128' && (!/^[\x20-\x7e]+$/.test(code) || code.length > 200))) {
          throw new Error('編碼過長或包含該格式不支援的字元。');
        }
        if (seen.has(code)) notes.push(prefix + '編碼重複。');
        seen.add(code);
        if (type === 'code128' && width > 0 && (code.length * 11 + 55) * .25 > width) {
          notes.push(prefix + '標籤可能太密，建議加闊及試掃。');
        }
      } catch (error) {
        notes.push(prefix + error.message);
      }
    });
    if (count > 200) notes.push('最多支援 200 列。');
    list.replaceChildren(...notes.map((message) => node('li', message)));
    issues.hidden = !notes.length;
    review.textContent = count ? `已檢查 ${count} 列，${notes.length} 項提示。重複編碼會保留。`
      : '可直接從 Excel 複製「編碼」或「編碼、描述」兩欄貼入。';
  };
  const normalize = (text, separator, omitHeader) => {
    const rows = readOfficeTable(text.replace(/^\uFEFF/, ''), separator);
    if (omitHeader) rows.shift();
    const nonempty = rows.filter((row) => row.some((value) => value.trim()));
    if (nonempty.some((row) => row.length > 2 || row.some((value) => /[\r\n]/.test(value)))) {
      throw new Error('每列只可有編碼及描述兩欄，儲存格不可包含換行。');
    }
    if (!nonempty.length) throw new Error('找不到可匯入的資料。');
    return nonempty.map((row) => row.map((value) => '"' + value.replace(/"/g, '""') + '"').join(',')).join('\n');
  };
  for (const control of [input, $('code-type'), $('label-w')]) control.addEventListener('input', refresh);
  upload.onchange = async () => {
    const file = upload.files[0];
    if (!file) return;
    const before = input.value;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('CSV／TSV 檔最多 2 MB。');
      const text = await file.text();
      if (codeBusy || input.value !== before) throw new Error('輸入已變更，請重新匯入檔案。');
      input.value = normalize(text, /\.tsv$/i.test(file.name) ? '\t' : ',', $('office-code-header').checked);
      input.dispatchEvent(new Event('input'));
    } catch (error) { review.textContent = error.message; }
    finally { upload.value = ''; }
  };
  input.addEventListener('paste', (event) => {
    const content = event.clipboardData?.getData('text/plain');
    if (!content?.includes('\t')) return;
    event.preventDefault();
    try {
      input.setRangeText(normalize(content, '\t', false), input.selectionStart, input.selectionEnd, 'end');
      input.dispatchEvent(new Event('input'));
    } catch (error) { review.textContent = error.message; }
  });
  refresh();
});
