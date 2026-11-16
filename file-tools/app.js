(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const videoWorkerURL = new URL('video-worker.js?v=4.20', document.currentScript.src);
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
  const renameOffset = byId('rename-offset');
  const renameOverride = byId('rename-override');
  const renameSequence = byId('rename-sequence');
  const renameFilter = byId('rename-filter');
  const savePreset = byId('rename-save-preset');
  const loadPreset = byId('rename-load-preset');
  const renameStatus = byId('rename-status');
  const renameExport = byId('rename-export');
  const renameResults = byId('rename-results');
  const renameReviewOptions = byId('rename-review-options');
  const renamePreview = byId('rename-preview');
  let scan = 0;
  let scannedFiles = [];
  let exportPlan = [];
  let fileStatus = renameStatus.textContent;

  const modificationSource = '檔案修改時間';
  const presetControls = [renameFormat, renameName, renameDate, renameClock, renameSource,
    renameOffset, renameOverride, renameSequence, customDate, customTime];
  const presetKey = 'office-tools.rename-preset';
  const collator = new Intl.Collator('zh-HK', { numeric: true });

  function offsetParts(parts, minutes) {
    if (!minutes || !parts) return parts;
    const [year, month, day, hour, minute, second] = parts.map(Number);
    // UTC arithmetic preserves the camera's recorded wall-clock time.
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute + minutes, second);
    return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
      date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
      .map((part, index) => String(part).padStart(index ? 2 : 4, '0'));
  }

  function renderRenamePreview() {
    const custom = renameSource.value === 'custom';
    const needsDate = renameDate.value !== 'none';
    const needsTime = renameClock.value !== 'none';
    const override = custom ? 'none' : renameOverride.value;
    const setDate = (custom || override === 'date') && needsDate;
    const setClock = (custom || override === 'clock') && needsTime;
    customFields.hidden = !(setDate || setClock);
    customDate.disabled = !setDate;
    customTime.disabled = !setClock;
    renameOverride.disabled = renameOffset.disabled = custom;
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(customDate.value)?.slice(1);
    const time = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(customTime.value)?.slice(1);
    const offset = Number(renameOffset.value);
    const valid = (!setDate || date) && (!setClock || time) && (custom || renameOffset.validity.valid);
    const placeholder = ['0000', '00', '00', '00', '00', '00'];
    const used = new Set();
    const rows = document.createDocumentFragment();
    const ordered = [...scannedFiles];
    if (renameSequence.value === 'name') ordered.sort((a,b) => collator.compare(a.file.name,b.file.name));
    const selectedCount = ordered.filter((entry) => !entry.excluded).length;
    const digits = Math.max(3, String(selectedCount).length);
    let sequence = 0;
    exportPlan = [];

    for (const entry of ordered) {
      const { file, source, excluded, manual } = entry;
      const chosen = manual ? manual.split(/[-T:]/) : null;
      if (chosen?.length === 5) chosen.push('00');
      const parts = chosen || [...(offsetParts(entry.parts, custom ? 0 : offset) || placeholder)];
      if (!chosen && setDate && date) parts.splice(0, 3, ...date);
      if (!chosen && setClock && time) parts.splice(3, 3, time[0], time[1], time[2] || '00');
      const [original, extension] = splitName(file.name);
      const label = Array.from(safeName(renameName.value.trim() || original)).slice(0, 65).join('');
      let base = makeName(parts, label, renameFormat.value);
      if (!excluded && renameSequence.value !== 'none') base += '_' + String(++sequence).padStart(digits, '0');
      const ext = extension ? Array.from(safeName(extension)).slice(0, 20).join('') : '';
      const output = !excluded && (valid || chosen) ? uniqueFilename(base, ext, used) : '—';
      if (output !== '—') exportPlan.push({ file, output });
      if (renameFilter.checked && source !== modificationSource) continue;

      const row = document.createElement('tr');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !excluded;
      check.setAttribute('aria-label', '匯出 ' + file.name);
      check.onchange = () => { entry.excluded = !check.checked; renderRenamePreview(); };
      row.insertCell().append(check);
      const stamp = [needsDate ? parts.slice(0,3).join('-') : '', needsTime ? parts.slice(3).join(':') : ''].filter(Boolean).join(' ');
      const timeSource = chosen ? '逐檔指定' : custom ? '全批自訂' :
        [source, offset ? '已偏移' : '', override !== 'none' ? '已覆蓋' : ''].filter(Boolean).join(' · ');
      for (const value of [file.name, output, valid || chosen ? stamp || '—' : '—', timeSource]) row.insertCell().textContent = value;
      const input = document.createElement('input');
      input.type = 'datetime-local';
      input.step = '1';
      input.value = manual || '';
      input.setAttribute('aria-label', '指定 ' + file.name + ' 的日期時間');
      input.onchange = () => { entry.manual = input.value; renderRenamePreview(); };
      row.insertCell().append(input);
      rows.append(row);
    }
    const shown = rows.childElementCount;
    renamePreview.replaceChildren(rows);
    renameResults.hidden = !shown;
    renameReviewOptions.hidden = !ordered.length;
    renameExport.disabled = !exportPlan.length || selectedCount !== exportPlan.length;
    renameStatus.textContent = !ordered.length ? fileStatus
      : selectedCount !== exportPlan.length ? '請填寫所需的日期、時間及有效的偏移分鐘。'
      : `顯示 ${shown}／${ordered.length} 個檔案，將匯出 ${exportPlan.length} 個。`;
  }

  savePreset.onclick = () => {
    try {
      localStorage.setItem(presetKey, JSON.stringify(presetControls.map((control) => control.value)));
      renameStatus.textContent = '已儲存到此瀏覽器。';
    } catch { renameStatus.textContent = '此瀏覽器無法儲存預設。'; }
  };

  loadPreset.onclick = async () => {
    try {
      const values = JSON.parse(localStorage.getItem(presetKey));
      if (!Array.isArray(values) || values.length !== presetControls.length) {
        renameStatus.textContent = '此瀏覽器未有已儲存的預設。';
        return;
      }
      const source = renameSource.value;
      presetControls.forEach((control, index) => { control.value = values[index]; });
      if (source !== renameSource.value) await scanRenameFiles(true);
      else renderRenamePreview();
    } catch { renameStatus.textContent = '無法載入命名預設。'; }
  };

  renameFormat.onchange = () => {
    renameDate.value = renameFormat.value === 'name-first' ? 'short' : 'compact';
    renameClock.value = renameFormat.value === 'date-first' ? 'h m s' : 'hms';
    renderRenamePreview();
  };
  renameName.oninput = customDate.oninput = customTime.oninput = renderRenamePreview;
  renameDate.onchange = renameClock.onchange = renameOverride.onchange =
    renameSequence.onchange = renameFilter.onchange = renderRenamePreview;
  renameOffset.oninput = renderRenamePreview;

  renameFiles.onchange = () => scanRenameFiles(false);
  renameSource.onchange = () => scanRenameFiles(true);

  async function scanRenameFiles(preserve) {
    const previous = preserve ? new Map(scannedFiles.map((entry) => [entry.file, entry])) : new Map();
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
        const time = await fileTime(file, renameSource.value);
        if (current !== scan) return;
        results.push({ ...previous.get(file), file, ...time });
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
  }

  renameExport.onclick = async () => {
    const plan = exportPlan;
    const controls = [renameFiles, ...presetControls, renameFilter, savePreset, loadPreset, renameExport, ...renamePreview.querySelectorAll('input')];
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
  const videoResume = byId('video-resume');
  const videoRetry = byId('video-retry');
  const videoCancel = byId('video-cancel');
  const videoZip = byId('video-zip');
  const videoClear = byId('video-clear');
  const videoStatus = byId('video-status');
  const videoQueue = byId('video-queue');
  const stampMode = byId('video-stamp-mode');
  const stampOptions = byId('video-stamp-options');
  const stampZone = byId('video-stamp-zone');
  const stampConfirmAll = byId('video-stamp-confirm-all');
  const stampReview = byId('video-stamp-review');
  const stampPosition = byId('video-stamp-position');
  const stampStyle = {
    font: byId('video-stamp-font'), color: byId('video-stamp-color'),
    background: byId('video-stamp-background'), size: byId('video-stamp-size'),
    opacity: byId('video-stamp-opacity'), outline: byId('video-stamp-outline')
  };
  const stampStyleReset = byId('video-stamp-style-reset');
  const stampPreview = byId('video-stamp-preview');
  const stampPlayer = byId('video-stamp-player');
  const stampOverlay = byId('video-stamp-overlay');
  const stampCaption = byId('video-stamp-caption');
  let previewItem;
  let previewURL;
  const videoOutputLimit = 256 * mib;
  let batch;
  let queue = [];
  let results = [];
  let pending;
  let volume = 1;
  let zipping = false;
  let videoStarted = false;

  function stampISO(seconds) {
    return new Date(seconds * 1000).toISOString().slice(0, 19);
  }

  function parseStamp(value) {
    value = value.replace(/\.0+$/, '');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return null;
    const full = value.length === 16 ? value + ':00' : value;
    const wall = Date.parse(full + 'Z') / 1000;
    return Number.isFinite(wall) && stampISO(wall) === full ? wall : null;
  }

  function filenameStamp(name) {
    const match = /(?:^|[^0-9])(\d{4})(\d{2})(\d{2})[_ -](\d{2})(\d{2})(\d{2})(?=\D|$)/.exec(name);
    if (!match) return '';
    const value = match.slice(1, 4).join('-') + 'T' + match.slice(4).join(':');
    return parseStamp(value) === null ? '' : value;
  }

  // Read the ISO BMFF movie header using bounded slices, including moov-at-end files.
  async function movieCreationTime(file) {
    async function locate(start, end, type) {
      for (let index = 0; index < 4096 && start + 8 <= end; index++) {
        const data = new DataView(await file.slice(start, Math.min(end, start + 16)).arrayBuffer());
        const kind = String.fromCharCode(...new Uint8Array(data.buffer, 4, 4));
        let size = data.getUint32(0);
        let header = 8;
        if (size === 1) {
          if (data.byteLength < 16) return null;
          size = Number(data.getBigUint64(8));
          header = 16;
        } else if (size === 0) size = end - start;
        if (!Number.isSafeInteger(size) || size < header || size > end - start) return null;
        if (kind === type) return [start + header, start + size];
        start += size;
      }
      return null;
    }
    if (!/\.(mp4|mov|m4v|3gp)$/i.test(file.name)) return null;
    const moov = await locate(0, file.size, 'moov');
    const mvhd = moov && await locate(...moov, 'mvhd');
    if (!mvhd || mvhd[1] - mvhd[0] < 8) return null;
    const data = new DataView(await file.slice(mvhd[0], Math.min(mvhd[0] + 12, mvhd[1])).arrayBuffer());
    const version = data.getUint8(0);
    const created = version === 0 ? data.getUint32(4)
      : version === 1 && data.byteLength >= 12 ? Number(data.getBigUint64(4)) : 0;
    const unix = created - 2082844800;
    return Number.isSafeInteger(unix) && unix >= 0 && unix < 253402214400 ? unix : null;
  }

  function stampOffset() {
    return stampZone.value === 'hidden' ? 8 : Number(stampZone.value);
  }

  function isStampPending(item) {
    return item.state !== 'done' && pending?.item !== item;
  }

  function showStampReview() {
    const clips = queue.filter(isStampPending);
    const checked = clips.filter((item) => item.checked.checked).length;
    stampConfirmAll.disabled = Boolean(batch || zipping) || !clips.some((item) =>
      item.scanned && !item.checked.checked && parseStamp(item.time.value) !== null &&
      (!item.conflict || item.manual));
    stampReview.textContent = clips.length
      ? `已確認 ${checked}／${clips.length} 段。時間有衝突或缺漏的影片須逐段核對。`
      : '時間來源有衝突或缺少日期的影片須逐段核對。';
  }

  stampConfirmAll.onclick = () => {
    if (batch || zipping || stampMode.value === 'off') return;
    for (const item of queue) {
      if (isStampPending(item) && item.scanned && parseStamp(item.time.value) !== null &&
          (!item.conflict || item.manual)) item.checked.checked = true;
    }
    showStampReview();
  };

  function showStampSource(item) {
    const offset = stampOffset();
    const internal = item.created === null ? '' : stampISO(item.created + offset * 3600);
    if (!item.manual) item.time.value = internal || item.filenameTime;
    let description = internal ? 'MP4／MOV 內嵌建立時間' : item.filenameTime ? '原始檔名' : '未找到時間，請填寫';
    item.conflict = Boolean(internal && item.filenameTime &&
      Math.abs(parseStamp(internal) - parseStamp(item.filenameTime)) > 2);
    if (internal && item.filenameTime) {
      description += !item.conflict
        ? ' · 與檔名一致' : ' · 與檔名 ' + item.filenameTime.replace('T', ' ') + ' 不同，請核對';
    }
    item.source.textContent = item.manual ? '手動設定 · 自動建議：' + description : description;
  }

  function getStamp(item) {
    return {
      mode: stampMode.value, position: stampPosition.value, offset: stampOffset(), showZone: stampZone.value !== 'hidden',
      wall: parseStamp(item.time.value),
      font: stampStyle.font.value, color: stampStyle.color.value, background: stampStyle.background.value,
      size: Number(stampStyle.size.value), opacity: Number(stampStyle.opacity.value), outline: stampStyle.outline.checked
    };
  }

  function showStampPreview() {
    byId('video-stamp-size-value').value = stampStyle.size.value + '%';
    byId('video-stamp-opacity-value').value = stampStyle.opacity.value + '%';
    if (!previewItem || stampMode.value === 'off') {
      stampPreview.hidden = true;
      return;
    }
    const stamp = getStamp(previewItem);
    stampOverlay.dataset.position = stamp.position;
    stampOverlay.dataset.font = stamp.font;
    stampOverlay.dataset.outline = String(stamp.outline);
    stampOverlay.style.setProperty('--stamp-color', stamp.color);
    stampOverlay.style.setProperty('--stamp-background', stamp.background);
    stampOverlay.style.setProperty('--stamp-opacity', stamp.opacity + '%');
    stampOverlay.style.setProperty('--stamp-scale', String(stamp.size / 100));
    stampOverlay.textContent = stamp.wall === null ? '請先填寫日期及時間'
      : stampISO(stamp.wall).replace('T', ' ') +
        (stamp.showZone ? ' UTC+' + String(stamp.offset).padStart(2, '0') + ':00' : '');
    stampCaption.textContent = '樣式示意 · ' + previewItem.file.name;
    stampPreview.hidden = false;
  }

  function closeStampPreview() {
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = undefined;
    previewItem = undefined;
    stampPlayer.removeAttribute('src');
    stampPlayer.parentElement.style.aspectRatio = '';
    stampPreview.hidden = true;
  }

  async function readStampSources(item) {
    if (item.scanning) return;
    item.scanning = true;
    item.source.textContent = '正在讀取影片時間…';
    try { item.created = await movieCreationTime(item.file); }
    catch { item.created = null; }
    item.scanning = false;
    item.scanned = true;
    if (queue.includes(item)) {
      showStampSource(item);
      showStampPreview();
      showStampReview();
    }
  }

  function updateStampControls() {
    const enabled = stampMode.value !== 'off';
    stampOptions.hidden = !enabled;
    for (const item of queue) {
      item.stampFields.hidden = !enabled;
      if (enabled && !item.scanned) readStampSources(item);
    }
    showStampPreview();
    showStampReview();
  }

  stampPlayer.onloadedmetadata = () => {
    if (stampPlayer.videoWidth && stampPlayer.videoHeight) {
      stampPlayer.parentElement.style.aspectRatio = `${stampPlayer.videoWidth} / ${stampPlayer.videoHeight}`;
    }
  };
  stampMode.onchange = updateStampControls;
  stampPosition.onchange = showStampPreview;
  for (const control of Object.values(stampStyle)) {
    control.oninput = showStampPreview;
    control.onchange = showStampPreview;
  }
  stampStyleReset.onclick = () => {
    stampStyle.font.selectedIndex = 0;
    for (const control of [stampStyle.color, stampStyle.background, stampStyle.size, stampStyle.opacity]) {
      control.value = control.defaultValue;
    }
    stampStyle.outline.checked = stampStyle.outline.defaultChecked;
    showStampPreview();
  };
  let lastStampOffset = stampOffset();
  stampZone.onchange = () => {
    const offset = stampOffset();
    if (offset !== lastStampOffset) {
      for (const item of queue.filter(isStampPending)) {
        item.checked.checked = false;
        if (item.scanned) showStampSource(item);
      }
    }
    lastStampOffset = offset;
    showStampPreview();
    showStampReview();
  };

  function updateVideoControls() {
    const busy = Boolean(batch || zipping);
    const count = videoFile.files.length;
    videoFile.disabled = videoMode.disabled = stampMode.disabled = stampZone.disabled = stampPosition.disabled = busy;
    for (const control of [...Object.values(stampStyle), stampStyleReset]) control.disabled = busy;
    for (const item of queue) {
      item.time.disabled = item.checked.disabled = busy || item.state === 'done' || pending?.item === item;
    }
    videoStart.disabled = busy || !count || count > 20;
    videoCancel.hidden = !batch;
    videoStart.hidden = videoStarted;
    videoResume.hidden = !videoStarted || !queue.some((item) => item.state === 'waiting');
    videoRetry.hidden = !queue.some((item) => item.state === 'failed');
    videoResume.disabled = videoRetry.disabled = busy || Boolean(pending && results.length) ||
      results.reduce((total, { blob }) => total + blob.size, 0) >= videoOutputLimit;
    videoZip.hidden = videoClear.hidden = !results.length;
    videoZip.disabled = busy || results.some((result) => result.blob.size > videoOutputLimit);
    videoClear.disabled = busy;
    showStampReview();
  }

  function clearVideoResults() {
    for (const { url, link } of results) {
      URL.revokeObjectURL(url);
      link.remove();
    }
    results = [];
  }

  function resetQueue() {
    closeStampPreview();
    clearVideoResults();
    queue = [];
    pending = undefined;
    volume = 1;
    videoStarted = false;
    videoQueue.replaceChildren();
  }

  function makeVideoRow(file, used) {
    const row = document.createElement('li');
    const name = document.createElement('strong');
    const status = document.createElement('span');
    name.textContent = file.name;
    status.textContent = '等待轉檔';
    row.append(name, status);
    videoQueue.append(row);
    const base = Array.from(safeName(splitName(file.name)[0])).slice(0, 65).join('');
    const stampFields = document.createElement('div');
    stampFields.className = 'stamp-settings';
    stampFields.hidden = true;
    const dateLabel = document.createElement('label');
    dateLabel.textContent = '拍攝日期時間';
    const time = document.createElement('input');
    time.type = 'datetime-local';
    time.step = '1';
    dateLabel.append(time);
    const source = document.createElement('small');
    const confirmLabel = document.createElement('label');
    const caption = document.createElement('span');
    const checked = document.createElement('input');
    checked.type = 'checkbox';
    caption.append(checked, ' 已核對拍攝時間');
    confirmLabel.append(caption);
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.textContent = '預覽樣式';
    stampFields.append(dateLabel, source, confirmLabel, preview);
    row.append(stampFields);
    const item = { file, row, status, state: 'waiting', name: uniqueFilename(base, '.mp4', used),
      stampFields, time, checked, source, created: null, filenameTime: filenameStamp(file.name) };
    checked.onchange = showStampReview;
    time.oninput = () => {
      item.manual = true;
      checked.checked = false;
      showStampSource(item);
      showStampPreview();
      showStampReview();
    };
    preview.onclick = () => {
      if (previewItem !== item) {
        closeStampPreview();
        previewItem = item;
        if (/\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
          previewURL = URL.createObjectURL(file);
          stampPlayer.src = previewURL;
        }
      }
      showStampPreview();
      stampPreview.scrollIntoView({ block: 'nearest' });
    };
    return item;
  }

  function videoClock(seconds) {
    const total = Math.floor(seconds);
    const parts = [Math.floor(total / 60), total % 60];
    return parts.map((part) => String(part).padStart(2, '0')).join(':');
  }

  async function convertVideo(item, mode, signal, worker, stamp) {
    const bytes = await item.file.arrayBuffer();
    signal.throwIfAborted();
    return await new Promise((resolve, reject) => {
      const abort = () => settle(reject, signal.reason);
      const started = performance.now();
      let message = '正在啟動轉檔…';
      const show = () => {
        item.status.textContent = `${message} · 已用 ${videoClock((performance.now() - started) / 1000)}`;
      };
      const timer = setInterval(show, 1000);
      const settle = (callback, value) => {
        clearInterval(timer);
        signal.removeEventListener('abort', abort);
        worker.onmessage = worker.onerror = null;
        callback(value);
      };
      signal.addEventListener('abort', abort, { once: true });
      worker.onerror = () => {
        const error = new Error('轉檔引擎中斷。');
        error.restart = true;
        settle(reject, error);
      };
      worker.onmessage = ({ data }) => {
        if (data.type === 'stage') message = data.message;
        if (data.type === 'progress') {
          message = `已處理片長 ${videoClock(data.seconds)}`;
          if (data.duration > 0) message += `／約 ${videoClock(data.duration)}`;
        }
        if (data.type === 'done') settle(resolve, data.output);
        else if (data.type === 'error') {
          const error = new Error(data.message);
          error.log = data.log;
          settle(reject, error);
        } else show();
      };
      try {
        worker.postMessage({ bytes, extension: splitName(item.file.name)[1], mode, stamp }, [bytes]);
      } catch (error) {
        settle(reject, error);
      }
    });
  }

  function addVideoResult(item, blob) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = item.name;
    link.textContent = '下載 MP4';
    const result = { name: item.name, blob, url, link, downloadRequested: false };
    link.addEventListener('click', () => { result.downloadRequested = true; });
    results.push(result);
    item.row.append(link);
    item.state = 'done';
    item.status.textContent = `已完成 · ${(blob.size / mib).toFixed(2)} MB` +
      (blob.size > videoOutputLimit ? ' · 請單獨下載' : '');
  }

  videoFile.onchange = () => {
    resetQueue();
    const count = videoFile.files.length;
    if (count <= 20) {
      const used = new Set();
      queue = [...videoFile.files].map((file) => makeVideoRow(file, used));
    }
    videoStatus.textContent = count > 20 ? '一次最多處理 20 段影片。'
      : count ? `已選 ${count} 段影片。` : '請選擇影片。';
    updateStampControls();
    updateVideoControls();
  };

  videoCancel.onclick = () => {
    batch?.abort();
    videoCancel.disabled = true;
    videoStatus.textContent = '正在取消。已完成的影片可繼續下載。';
  };

  videoClear.onclick = () => {
    if (!confirm('清除今卷的下載連結？請先下載需要保留的 MP4 或 ZIP。')) return;
    clearVideoResults();
    volume++;
    videoStatus.textContent = '已清除今卷。可繼續剩餘影片或重試失敗項目。';
    updateVideoControls();
  };

  async function runVideoQueue(state) {
    if (batch || zipping || !queue.length || (pending && results.length)) return;
    const target = queue.filter((item) => item.state === state);
    const stamping = stampMode.value !== 'off';
    const unconfirmed = stamping && target.find((item) =>
      pending?.item !== item && (item.scanning || getStamp(item).wall === null || !item.checked.checked));
    if (unconfirmed) {
      videoStatus.textContent = '請先填寫及核對拍攝時間：' + unconfirmed.file.name;
      (getStamp(unconfirmed).wall === null ? unconfirmed.time : unconfirmed.checked).focus();
      return;
    }
    videoStarted = true;
    batch = new AbortController();
    const { signal } = batch;
    let worker;
    const mode = videoMode.value;
    let outputSize = results.reduce((total, { blob }) => total + blob.size, 0);
    videoCancel.disabled = false;
    updateVideoControls();
    try {
      for (const [index, item] of target.entries()) {
        if (signal.aborted || outputSize >= videoOutputLimit) break;
        item.row.querySelector('details')?.remove();
        videoStatus.textContent = `本輪第 ${index + 1}／${target.length} 段 · 第 ${volume} 卷`;
        item.status.textContent = '正在讀取影片…';
        try {
          let blob;
          if (pending?.item === item) {
            blob = pending.blob;
            pending = undefined;
          } else {
            if (!item.file.size || item.file.size > 128 * mib) throw new Error('影片須大於 0 且不超過 128 MB。');
            worker ??= new Worker(videoWorkerURL);
            const output = await convertVideo(item, mode, signal, worker, stamping ? getStamp(item) : undefined);
            signal.throwIfAborted();
            blob = new Blob([output], { type: 'video/mp4' });
          }
          if (outputSize && outputSize + blob.size > videoOutputLimit) {
            pending = { item, blob };
            item.state = 'waiting';
            item.status.textContent = '轉檔完成，等候下一卷';
            break;
          }
          addVideoResult(item, blob);
          outputSize += blob.size;
        } catch (error) {
          if (signal.aborted) {
            item.status.textContent = item.state === 'failed' ? '已取消重試' : '等候繼續';
            break;
          }
          if (error.restart) {
            worker?.terminate();
            worker = undefined;
          }
          item.state = 'failed';
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
      worker?.terminate();
      const count = (state) => queue.filter((item) => item.state === state).length;
      const paused = pending || (outputSize >= videoOutputLimit && count('waiting') + count('failed'));
      const outcome = signal.aborted ? '已取消' : paused ? '請下載並清除今卷，再繼續處理' : '處理結束';
      videoStatus.textContent = `${outcome}。全批成功 ${count('done')}／${queue.length} 段，失敗 ${count('failed')} 段，待處理 ${count('waiting')} 段。`;
      batch = undefined;
      updateVideoControls();
    }
  }

  videoStart.onclick = () => runVideoQueue('waiting');
  videoResume.onclick = () => runVideoQueue('waiting');
  videoRetry.onclick = () => runVideoQueue('failed');

  videoZip.onclick = async () => {
    zipping = true;
    updateVideoControls();
    try {
      await loadLibrary(zipWriter);
      const zip = new globalThis.JSZip();
      for (const { name, blob } of results) zip.file(name, blob);
      const archive = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const url = URL.createObjectURL(archive);
      const link = document.createElement('a');
      link.href = url;
      link.download = `converted-videos-${String(volume).padStart(2, '0')}.zip`;
      link.click();
      for (const result of results) result.downloadRequested = true;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      videoStatus.textContent = error.message;
    } finally {
      zipping = false;
      updateVideoControls();
    }
  };
  for (const input of [renameFiles, videoFile]) {
    const drop = byId(input.id + '-drop');
    drop.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (!input.disabled) drop.classList.add('drag');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      drop.classList.remove('drag');
      if (input.disabled || !event.dataTransfer?.files.length) return;
      input.files = event.dataTransfer.files;
      input.dispatchEvent(new Event('change'));
    });
  }

  window.addEventListener('beforeunload', (event) => {
    if (!batch && !zipping && !pending && results.every((result) => result.downloadRequested)) return;
    event.preventDefault();
    event.returnValue = '';
  });
})();
