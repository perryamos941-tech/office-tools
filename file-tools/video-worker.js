'use strict';

// These hashes come from the integrity-checked upstream npm tarball.
const coreBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/';
const coreScript = {
  name: 'ffmpeg-core.js',
  integrity: 'sha384-sKfkiFtvUk+vexk+0EUhEh366190/4WpgUAsUvaxEfyg7+E1Zt5Y5hrsU808g8Q9'
};
const coreWasm = {
  name: 'ffmpeg-core.wasm',
  integrity: 'sha384-U1VDhkPYrM3wTCT4/vjSpSsKqG/UjljYrYCI4hBSJ02svbCkxuCi6U6u/peg5vpW'
};
const outputName = '/output.mp4';
const fonts = new Map([
  ['mono', 'stamp-font.ttf'],
  ['sans', 'stamp-sans-bold.ttf'],
  ['serif', 'stamp-serif.ttf']
]);
const stampPath = '/stamp.txt';
const loadedFonts = new Set();
let engine;

async function verifiedCoreAsset({ name, integrity }) {
  const response = await fetch(coreBase + name, {
    integrity, mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer'
  });
  if (!response.ok) throw new Error('無法下載已驗證的轉檔元件：' + name);
  return response.arrayBuffer();
}

async function loadEngine() {
  let script, wasmBinary;
  try {
    [script, wasmBinary] = await Promise.all([verifiedCoreAsset(coreScript), verifiedCoreAsset(coreWasm)]);
  } catch {
    throw new Error('無法下載或驗證轉檔元件，已停止處理。請稍後重試。');
  }
  const url = URL.createObjectURL(new Blob([script], { type: 'application/javascript' }));
  try {
    importScripts(url);
    // Supply the verified bytes directly. The auxiliary locator never points at the CDN.
    const localLocator = btoa(JSON.stringify({ wasmURL: 'verified-inline.wasm' }));
    return await self.createFFmpegCore({ wasmBinary, mainScriptUrlOrBlob: url + '#' + localLocator });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seconds(value) {
  return value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

async function stampFilter(ffmpeg, stamp) {
  const file = fonts.get(stamp.font) || fonts.get('mono');
  const fontPath = '/' + file;
  if (!loadedFonts.has(file)) {
    const url = new URL(file, self.location.href);
    const response = await fetch(url);
    if (!response.ok) throw new Error('無法載入日期時間字型，請重試。');
    ffmpeg.FS.writeFile(fontPath, new Uint8Array(await response.arrayBuffer()));
    loadedFonts.add(file);
  }
  const { position, mode, wall, offset } = stamp;
  const date = new Date(wall * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const zone = stamp.showZone === false ? '' : ' UTC+' + String(offset).padStart(2, '0') + ':00';
  const rolling = mode === 'clock';
  const text = rolling ? `%{pts:gmtime:${wall}:%Y-%m-%d %H\\:%M\\:%S}${zone}` : date + zone;
  ffmpeg.FS.writeFile(stampPath, new TextEncoder().encode(text));
  const x = position.endsWith('left') ? 'max(12,w*0.025)' : 'w-tw-max(12,w*0.025)';
  const y = position.startsWith('top') ? 'max(10,h*0.035)' : 'h-th-max(10,h*0.035)';
  const scale = Number.isFinite(stamp.size) ? Math.min(140, Math.max(70, stamp.size)) / 100 : 1;
  const opacity = Number.isFinite(stamp.opacity) ? Math.min(100, Math.max(0, stamp.opacity)) / 100 : .7;
  const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value) ? '0x' + value.slice(1) : fallback;
  const textColor = color(stamp.color, 'white');
  const background = color(stamp.background, 'black');
  return `drawtext=fontfile=${fontPath}:textfile=${stampPath}:` +
    `expansion=${rolling ? 'normal' : 'none'}:x='${x}':y='${y}':fontsize='max(6,min(w/27,h/21)*${scale})':` +
    `fontcolor=${textColor}:box=${opacity > 0 ? 1 : 0}:boxcolor=${background}@${opacity}:boxborderw=3:` +
    `borderw=${stamp.outline ? 1 : 0}:bordercolor=black`;
}

self.onmessage = async ({ data }) => {
  const logs = [];
  const stage = (message) => self.postMessage({ type: 'stage', message });
  let ffmpeg;
  let duration;
  let progressAt = -Infinity;
  const extension = /^\.[a-z0-9]{1,8}$/i.test(data.extension) ? data.extension.toLowerCase() : '';
  const inputName = '/input' + extension;
  try {
    if (!engine) {
      stage('正在載入轉檔引擎…');
      engine = await loadEngine();
    }
    ffmpeg = engine;
    ffmpeg.setLogger(({ message }) => {
      logs.push(message);
      if (logs.length > 32) logs.shift();
      const length = /Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/.exec(message);
      if (length) duration = seconds(length[1]);
      const time = /\btime=\s*(\d+:\d+:\d+(?:\.\d+)?)/.exec(message);
      const now = performance.now();
      if (time && now - progressAt >= 300) {
        progressAt = now;
        self.postMessage({ type: 'progress', seconds: seconds(time[1]), duration });
      }
    });
    const compress = data.mode === 'compress';
    const [maxWidth, maxHeight] = compress ? [1280, 720] : [1920, 1080];
    // Fit within the selected bounds, preserving aspect ratio and even dimensions.
    const fit = `scale=w='min(iw,${maxWidth})':h='min(ih,${maxHeight})':force_original_aspect_ratio=decrease:force_divisible_by=2`;
    const filter = data.stamp ? fit + ',' + await stampFilter(ffmpeg, data.stamp) : fit;
    ffmpeg.FS.writeFile(inputName, new Uint8Array(data.bytes), { canOwn: true });
    stage('正在製作 Windows 相容 MP4…');
    const code = ffmpeg.exec(
      '-fflags', '+genpts', '-i', inputName, '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', filter, '-fpsmax', '30', '-fps_mode', 'cfr', '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level:v', '4.1', '-tag:v', 'avc1',
      '-preset', 'veryfast', '-crf', compress ? '28' : '20',
      '-maxrate', '12M', '-bufsize', '24M',
      '-c:a', 'aac', '-profile:a', 'aac_low', '-ar', '48000', '-ac', '2',
      '-b:a', compress ? '96k' : '128k',
      '-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', outputName
    );
    if (code !== 0) {
      throw new Error('影片無法轉檔。請查看詳情，或從原廠播放器重新匯出影片。');
    }
    const output = ffmpeg.FS.readFile(outputName);
    if (!output.length) throw new Error('轉檔結果為空。請檢查來源影片。');
    self.postMessage({ type: 'done', output, log: logs.join('\n') }, [output.buffer]);
  } catch (error) {
    const message = error.message || '無法啟動轉檔。請檢查網絡及瀏覽器後重試。';
    self.postMessage({ type: 'error', message, log: [...logs, error.message].join('\n') });
  } finally {
    if (ffmpeg) {
      for (const path of [inputName, outputName, stampPath]) {
        if (ffmpeg.FS.analyzePath(path).exists) ffmpeg.FS.unlink(path);
      }
      ffmpeg.reset();
    }
  }
};
