'use strict';

const byId = (id) => document.getElementById(id);
const mib = 1024 * 1024;
const scripts = new Map();

const exifReader = {
  url: 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.umd.js',
  integrity: 'sha384-KrOocIA+lZcNUz2MDavnT/FuX+CbTREJihUi0bp8QUSwhE2AkGTNpv2b7yMbBkx5'
};
const zipWriter = {
  url: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  integrity: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG'
};

function loadLibrary({ url, integrity }) {
  if (!scripts.has(url)) {
    const pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.integrity = integrity;
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        reject(new Error('載入處理元件失敗，請檢查網絡連線後重試。'));
      };
      document.head.append(script);
    });
    scripts.set(url, pending);
    pending.catch(() => scripts.delete(url));
  }
  return scripts.get(url);
}

function dateParts(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, '0'));
}

async function fileTime(file) {
  if (/\.(jpe?g|heic|heif)$/i.test(file.name)) {
    await loadLibrary(exifReader);
    try {
      const tags = await globalThis.exifr.parse(file, { pick: ['DateTimeOriginal'], reviveValues: false });
      const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(tags?.DateTimeOriginal);
      if (match) {
        const [year, month, day, h, m, s] = match.slice(1).map(Number);
        const check = new Date(Date.UTC(year, month - 1, day, h, m, s));
        if (check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 &&
            check.getUTCDate() === day && h < 24 && m < 60 && s < 60) {
          return { parts: match.slice(1), source: 'EXIF 拍攝時間' };
        }
      }
    } catch {
      // An unreadable image may still be renamed using its file timestamp.
    }
  }
  const date = new Date(file.lastModified);
  if (!Number.isFinite(date.getTime())) throw new Error('無法取得檔案修改時間。');
  return { parts: dateParts(date), source: '檔案修改時間' };
}

function splitName(name) {
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 && lastDot < name.length - 1
    ? [name.slice(0, lastDot), name.slice(lastDot)]
    : [name, ''];
}

function safeName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim() || '檔案';
}

function makeName(parts, name, format) {
  const [year, month, day, hour, minute, second] = parts;
  const fullDate = year + month + day;
  const clock = hour + minute + second;
  if (format === 'name-first') return `${name}(${fullDate.slice(2)} ${clock})`;
  if (format === 'sortable') return `${fullDate}_${clock}_${name}`;
  return `${fullDate} ${hour} ${minute} ${second}_${name}`;
}

const renameFiles = byId('rename-files');
const renameFormat = byId('rename-format');
const renameName = byId('rename-name');
const renameStatus = byId('rename-status');
const renameExport = byId('rename-export');
const renameResults = byId('rename-results');
const renamePreview = byId('rename-preview');
let scan = 0;
let scannedFiles = [];
let exportPlan = [];

function renderRenamePreview() {
  const used = new Set();
  const rows = document.createDocumentFragment();
  exportPlan = scannedFiles.map(({ file, parts, source }) => {
    const [original, extension] = splitName(file.name);
    const label = Array.from(safeName(renameName.value.trim() || original)).slice(0, 65).join('');
    const base = makeName(parts, label, renameFormat.value);
    const suffix = Array.from(safeName(extension || '_')).slice(0, 20).join('');
    const ext = extension ? suffix : '';
    let output = base + ext;
    for (let number = 2; used.has(output.normalize('NFC').toLowerCase()); number++) {
      output = base + '_' + String(number).padStart(2, '0') + ext;
    }
    used.add(output.normalize('NFC').toLowerCase());
    const row = document.createElement('tr');
    for (const value of [file.name, output, source]) row.insertCell().textContent = value;
    rows.append(row);
    return { file, output };
  });
  renamePreview.replaceChildren(rows);
  renameResults.hidden = !exportPlan.length;
  renameExport.disabled = !exportPlan.length;
}

renameFormat.onchange = renameName.oninput = renderRenamePreview;
renameFiles.onchange = async () => {
  const current = ++scan;
  const files = [...renameFiles.files];
  scannedFiles = [];
  renderRenamePreview();
  if (!files.length) {
    renameStatus.textContent = '選檔後可預覽新檔名。';
    return;
  }
  if (files.reduce((total, file) => total + file.size, 0) > 250 * mib || files.length > 3000) {
    renameStatus.textContent = '請分批處理，每批最多 250 MB 及 3,000 個檔案。';
    return;
  }
  renameStatus.textContent = '正在讀取檔案時間…';
  try {
    const results = [];
    for (const file of files) {
      const time = await fileTime(file);
      if (current !== scan) return;
      results.push({ file, ...time });
    }
    scannedFiles = results;
    renderRenamePreview();
    const count = results.filter(({ source }) => source === 'EXIF 拍攝時間').length;
    renameStatus.textContent = `已預覽 ${results.length} 個檔案，其中 ${count} 個使用 EXIF 拍攝時間。`;
  } catch (error) {
    if (current === scan) renameStatus.textContent = error.message;
  }
};

renameExport.onclick = async () => {
  const plan = exportPlan;
  const controls = [renameFiles, renameFormat, renameName, renameExport];
  controls.forEach((control) => { control.disabled = true; });
  renameStatus.textContent = '正在建立 ZIP…';
  try {
    await loadLibrary(zipWriter);
    const zip = new globalThis.JSZip();
    for (const { file, output } of plan) zip.file(output, file, { date: new Date(file.lastModified) });
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'renamed-files.zip';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    renameStatus.textContent = `已下載 ${plan.length} 個改名副本。`;
  } catch (error) {
    renameStatus.textContent = error.message;
  } finally {
    controls.forEach((control) => { control.disabled = false; });
  }
};

const videoFile = byId('video-file');
const videoMode = byId('video-mode');
const videoStart = byId('video-start');
const videoCancel = byId('video-cancel');
const videoDownload = byId('video-download');
const videoStatus = byId('video-status');
const videoLog = byId('video-log');
const videoDiagnostics = byId('video-diagnostics');
let activeWorker;
let videoURL;

function resetVideoOutput() {
  if (videoURL) URL.revokeObjectURL(videoURL);
  videoURL = undefined;
  videoDownload.removeAttribute('href');
  videoDownload.hidden = true;
  videoDiagnostics.hidden = true;
  videoLog.textContent = '';
}

function finishVideo() {
  activeWorker?.terminate();
  activeWorker = undefined;
  videoFile.disabled = videoMode.disabled = false;
  videoStart.disabled = !videoFile.files.length;
  videoCancel.hidden = true;
}

videoFile.onchange = () => {
  resetVideoOutput();
  videoStart.disabled = !videoFile.files.length;
  videoStatus.textContent = videoFile.files[0]?.name || '請選擇影片。';
};

videoCancel.onclick = () => {
  finishVideo();
  videoStatus.textContent = '已取消處理。';
};

videoStart.onclick = async () => {
  const file = videoFile.files[0];
  if (!file || activeWorker) return;
  resetVideoOutput();
  if (!file.size || file.size > 128 * mib) {
    videoStatus.textContent = '請選擇大於 0 且不超過 128 MB 的影片。';
    return;
  }
  let worker;
  try {
    worker = new Worker('video-worker.js');
  } catch {
    videoStatus.textContent = '無法啟動轉檔。請透過 HTTPS 網頁在電腦瀏覽器開啟。';
    return;
  }
  activeWorker = worker;
  videoFile.disabled = videoMode.disabled = videoStart.disabled = true;
  videoCancel.hidden = false;
  videoStatus.textContent = '正在讀取影片及啟動轉檔引擎…';
  const fail = (message) => {
    finishVideo();
    videoStatus.textContent = message;
  };
  worker.onerror = () => fail('轉檔引擎中斷。可嘗試用電腦瀏覽器處理較短影片。');
  worker.onmessage = ({ data }) => {
    if (activeWorker !== worker) return;
    if (data.type === 'stage') videoStatus.textContent = data.message;
    if (data.log) {
      videoLog.textContent = data.log;
      videoDiagnostics.hidden = false;
    }
    if (data.type === 'error') fail(data.message);
    if (data.type === 'done') {
      videoURL = URL.createObjectURL(new Blob([data.output], { type: 'video/mp4' }));
      videoDownload.href = videoURL;
      videoDownload.download = splitName(file.name)[0] + '.mp4';
      videoDownload.hidden = false;
      videoStatus.textContent = `已完成。原檔 ${(file.size / mib).toFixed(2)} MB，輸出 ${(data.output.byteLength / mib).toFixed(2)} MB。`;
      finishVideo();
    }
  };
  try {
    const bytes = await file.arrayBuffer();
    if (activeWorker === worker) {
      worker.postMessage({ bytes, extension: splitName(file.name)[1], mode: videoMode.value }, [bytes]);
    }
  } catch {
    if (activeWorker === worker) fail('無法讀取影片。請確認檔案已下載到電腦。');
  }
};
