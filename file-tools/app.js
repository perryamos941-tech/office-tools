(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const videoWorkerURL = new URL('video-worker.js?v=4.15', document.currentScript.src);
  const mib = 1024 * 1024;
  const scripts = new Map();

  const exifReader = {
    url: 'https://cdn.jsdelivr.net/npm/exifreader@4.54.0/dist/exif-reader.js',
    integrity: 'sha384-W9qlT1IDpfJok8mDCTyj4r5xtmRbGHfjuwJqezhTEDLOPpr84MUIgJBHasEjUh83'
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

  async function fileTime(file, source) {
    if (source === 'auto' && /\.(jpe?g|heic|heif)$/i.test(file.name)) {
      await loadLibrary(exifReader);
      try {
        const tags = globalThis.ExifReader.load(await file.arrayBuffer(), { expanded: true });
        const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(tags.exif?.DateTimeOriginal?.value?.[0]);
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
    const dates = {
      compact: year + month + day,
      short: year.slice(2) + month + day,
      iso: [year, month, day].join('-'),
      dot: [year, month, day].join('.'),
      dmy: [day, month, year].join('-')
    };
    const clock = renameClock.value === 'none' ? '' : renameClock.value.replace(/[hms]/g,
      (token) => ({ h: hour, m: minute, s: second })[token]);
    const stamp = [dates[renameDate.value], clock].filter(Boolean).join(format === 'sortable' ? '_' : ' ');
    if (!stamp) return name;
    return format === 'name-first' ? `${name}(${stamp})` : `${stamp}_${name}`;
  }

  function uniqueFilename(base, extension, used) {
    const key = (filename) => filename.normalize('NFC').toLowerCase();
    if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(base)) base = '_' + base;
    let output = base + extension;
    for (let number = 2; used.has(key(output)); number++) {
      output = base + '_' + String(number).padStart(2, '0') + extension;
    }
    used.add(key(output));
    return output;
  }

  const renameFiles = byId('rename-files');
  const renameFormat = byId('rename-format');
  const renameName = byId('rename-name');
  const renameDate = byId('rename-date');
  const renameClock = byId('rename-clock');
  const renameSource = byId('rename-source');
  const customFields = byId('rename-custom');
  const customDate = byId('rename-custom-date');
  const customTime = byId('rename-custom-time');
  const renameStatus = byId('rename-status');
  const renameExport = byId('rename-export');
  const renameResults = byId('rename-results');
  const renamePreview = byId('rename-preview');
  let scan = 0;
  let scannedFiles = [];
  let exportPlan = [];
  let fileStatus = renameStatus.textContent;

  function renderRenamePreview() {
    const custom = renameSource.value === 'custom';
    const needsDate = renameDate.value !== 'none';
    const needsTime = renameClock.value !== 'none';
    customFields.hidden = !custom;
    customDate.disabled = !custom || !needsDate;
    customTime.disabled = !custom || !needsTime;
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(customDate.value);
    const time = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(customTime.value);
    const valid = !custom || ((!needsDate || date) && (!needsTime || time));
    const customParts = [...(date?.slice(1) ?? ['0000', '00', '00']),
      time?.[1] ?? '00', time?.[2] ?? '00', time?.[3] ?? '00'];
    renameStatus.textContent = valid || !scannedFiles.length ? fileStatus : '請填寫自訂日期及時間所需欄位。';
    const used = new Set();
    const rows = document.createDocumentFragment();
    exportPlan = (valid ? scannedFiles : []).map(({ file, parts, source }) => {
      const [original, extension] = splitName(file.name);
      const label = Array.from(safeName(renameName.value.trim() || original)).slice(0, 65).join('');
      const base = makeName(custom ? customParts : parts, label, renameFormat.value);
      const suffix = Array.from(safeName(extension || '_')).slice(0, 20).join('');
      const ext = extension ? suffix : '';
      const output = uniqueFilename(base, ext, used);
      const row = document.createElement('tr');
      const shownSource = needsDate || needsTime ? (custom ? '自訂日期及時間' : source) : '—';
      for (const value of [file.name, output, shownSource]) row.insertCell().textContent = value;
      rows.append(row);
      return { file, output };
    });
    renamePreview.replaceChildren(rows);
    renameResults.hidden = !exportPlan.length;
    renameExport.disabled = !exportPlan.length;
  }

  renameFormat.onchange = () => {
    renameDate.value = renameFormat.value === 'name-first' ? 'short' : 'compact';
    renameClock.value = renameFormat.value === 'date-first' ? 'h m s' : 'hms';
    renderRenamePreview();
  };
  renameName.oninput = customDate.oninput = customTime.oninput = renderRenamePreview;
  renameDate.onchange = renameClock.onchange = renderRenamePreview;

  renameFiles.onchange = renameSource.onchange = async () => {
    const current = ++scan;
    const files = [...renameFiles.files];
    scannedFiles = [];
    fileStatus = '選檔後可預覽新檔名。';
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
        const time = renameSource.value === 'custom' ? {} : await fileTime(file, renameSource.value);
        if (current !== scan) return;
        results.push({ file, ...time });
      }
      scannedFiles = results;
      const count = results.filter(({ source }) => source === 'EXIF 拍攝時間').length;
      fileStatus = renameSource.value === 'auto'
        ? `已預覽 ${results.length} 個檔案，其中 ${count} 個使用 EXIF 拍攝時間。`
        : `已預覽 ${results.length} 個檔案。`;
      renderRenamePreview();
    } catch (error) {
      if (current === scan) renameStatus.textContent = error.message;
    }
  };

  renameExport.onclick = async () => {
    const plan = exportPlan;
    const controls = [renameFiles, renameFormat, renameName, renameDate, renameClock, renameSource, customDate, customTime, renameExport];
    const previous = controls.map((control) => control.disabled);
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
      controls.forEach((control, index) => { control.disabled = previous[index]; });
    }
  };

  const videoFile = byId('video-file');
  const videoMode = byId('video-mode');
  const videoStart = byId('video-start');
  const videoCancel = byId('video-cancel');
  const videoZip = byId('video-zip');
  const videoStatus = byId('video-status');
  const videoQueue = byId('video-queue');
  const videoOutputLimit = 256 * mib;
  let batch;
  let results = [];

  function clearVideoResults() {
    for (const result of results) URL.revokeObjectURL(result.url);
    results = [];
    videoQueue.replaceChildren();
    videoZip.hidden = true;
  }

  function makeVideoRow(file) {
    const row = document.createElement('li');
    const name = document.createElement('strong');
    const status = document.createElement('span');
    name.textContent = file.name;
    status.textContent = '等待轉檔';
    row.append(name, status);
    videoQueue.append(row);
    return { file, row, status };
  }

  async function convertVideo({ file, status }, mode, signal) {
    const bytes = await file.arrayBuffer();
    signal.throwIfAborted();
    const worker = new Worker(videoWorkerURL);
    try {
      return await new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        const settle = (callback, value) => {
          signal.removeEventListener('abort', abort);
          callback(value);
        };
        worker.onerror = () => settle(reject, new Error('轉檔引擎中斷。'));
        worker.onmessage = ({ data }) => {
          if (data.type === 'stage') status.textContent = data.message;
          if (data.type === 'done') settle(resolve, data.output);
          if (data.type === 'error') {
            const error = new Error(data.message);
            error.log = data.log;
            settle(reject, error);
          }
        };
        try {
          worker.postMessage({ bytes, extension: splitName(file.name)[1], mode }, [bytes]);
        } catch (error) {
          settle(reject, error);
        }
      });
    } finally {
      worker.terminate();
    }
  }

  videoFile.onchange = () => {
    clearVideoResults();
    const count = videoFile.files.length;
    videoStart.disabled = !count || count > 20;
    videoStatus.textContent = count > 20 ? '一次最多處理 20 段影片。'
      : count ? `已選 ${count} 段影片。` : '請選擇影片。';
  };

  videoCancel.onclick = () => {
    batch?.abort();
    videoCancel.disabled = true;
    videoStatus.textContent = '正在取消。已完成的影片可繼續下載。';
  };

  videoStart.onclick = async () => {
    const files = [...videoFile.files];
    if (!files.length || files.length > 20 || batch) return;
    clearVideoResults();
    batch = new AbortController();
    const { signal } = batch;
    const queue = files.map(makeVideoRow);
    const used = new Set();
    let outputSize = 0;
    let failures = 0;
    let storageFull = false;
    videoFile.disabled = videoMode.disabled = videoStart.disabled = true;
    videoCancel.hidden = videoCancel.disabled = false;
    try {
      for (const [index, item] of queue.entries()) {
        if (signal.aborted || storageFull) {
          item.status.textContent = signal.aborted ? '已取消' : '未處理，請分批再試';
          continue;
        }
        videoStatus.textContent = `正在處理第 ${index + 1}／${queue.length} 段影片…`;
        item.status.textContent = '正在讀取影片…';
        try {
          if (!item.file.size || item.file.size > 128 * mib) throw new Error('影片須大於 0 且不超過 128 MB。');
          const output = await convertVideo(item, videoMode.value, signal);
          signal.throwIfAborted();
          if (outputSize + output.byteLength > videoOutputLimit) {
            storageFull = true;
            throw new Error('批次輸出超過 256 MB，請分批或改用壓縮模式。');
          }
          const base = Array.from(safeName(splitName(item.file.name)[0])).slice(0, 65).join('');
          const name = uniqueFilename(base, '.mp4', used);
          const blob = new Blob([output], { type: 'video/mp4' });
          const url = URL.createObjectURL(blob);
          results.push({ name, blob, url });
          outputSize += blob.size;
          const link = document.createElement('a');
          link.href = url;
          link.download = name;
          link.textContent = '下載 MP4';
          item.row.append(link);
          item.status.textContent = `已完成 · ${(blob.size / mib).toFixed(2)} MB`;
        } catch (error) {
          if (signal.aborted) {
            item.status.textContent = '已取消';
            continue;
          }
          failures++;
          item.status.textContent = error.message || '無法處理影片。';
          if (error.log) {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            const pre = document.createElement('pre');
            summary.textContent = '轉檔詳情';
            pre.textContent = error.log;
            details.append(summary, pre);
            item.row.append(details);
          }
        }
      }
    } finally {
      const outcome = signal.aborted ? '已取消' : storageFull ? '已達批次輸出上限' : '處理結束';
      videoStatus.textContent = `${outcome}。成功 ${results.length}／${queue.length} 段，失敗 ${failures} 段。`;
      videoZip.hidden = !results.length;
      videoFile.disabled = videoMode.disabled = videoStart.disabled = false;
      videoCancel.hidden = true;
      batch = undefined;
    }
  };

  videoZip.onclick = async () => {
    videoFile.disabled = videoStart.disabled = videoZip.disabled = true;
    try {
      await loadLibrary(zipWriter);
      const zip = new globalThis.JSZip();
      for (const { name, blob } of results) zip.file(name, blob);
      const archive = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const url = URL.createObjectURL(archive);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'converted-videos.zip';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      videoStatus.textContent = error.message;
    } finally {
      videoFile.disabled = videoStart.disabled = videoZip.disabled = false;
    }
  };
})();
