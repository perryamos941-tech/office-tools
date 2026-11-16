// SPDX-License-Identifier: MIT OR AGPL-3.0-or-later
'use strict';

const outputName = '/output.mp4';
const stampPath = '/stamp.ass';
const fontDir = '/stamp-fonts';
const families = new Map([
  ['mono', 'DejaVu Sans Mono'], ['sans', 'DejaVu Sans'], ['serif', 'DejaVu Serif']
]);
const demuxerLimits = ['-format_whitelist', 'mov,matroska,avi,dhav', '-protocol_whitelist', 'file'];
const nestedBoxes = new Set(['moov', 'moof', 'trak', 'traf', 'mdia', 'minf', 'stbl',
  'udta', 'edts', 'dinf', 'mvex', 'mfra', 'sinf', 'schi', 'wave']);
let engine;

async function loadEngine({ js, wasm, fonts }) {
  const url = URL.createObjectURL(new Blob([js], { type: 'application/javascript' }));
  try {
    importScripts(url);
    const compiled = await WebAssembly.compile(wasm);
    const core = await self.createFFmpegCore({
      instantiateWasm(imports, receive) {
        const instance = new WebAssembly.Instance(compiled, imports);
        receive(instance);
        return instance.exports;
      }
    });
    core.FS.mkdir(fontDir);
    for (const [name, bytes] of Object.entries(fonts)) core.FS.writeFile(fontDir + '/' + name, new Uint8Array(bytes));
    return core;
  } finally { URL.revokeObjectURL(url); }
}

const send = (data, transfer = []) => self.postMessage(data, transfer);

// The tool accepts clear media only. Reject ISO BMFF encryption headers before demuxing.
function rejectEncryptedBoxes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scan = (start, end, depth) => {
    if (depth >= 32) throw new Error('影片容器的層級過深，已停止處理。');
    while (start + 8 <= end) {
      const type = String.fromCharCode(...bytes.subarray(start + 4, start + 8));
      let size = view.getUint32(start);
      let header = 8;
      if (size === 1) {
        if (start + 16 > end) return;
        size = Number(view.getBigUint64(start + 8));
        header = 16;
      } else if (size === 0) size = end - start;
      if (size < header || size > end - start) return;
      if (type === 'pssh') throw new Error('影片包含加密保護資料，請使用未加密的原檔。');
      if (nestedBoxes.has(type)) scan(start + header, start + size, depth + 1);
      start += size;
    }
  };
  scan(0, bytes.length, 0);
}

async function probeVideo(core, inputName) {
  const lines = [];
  core.setLogger(({ message }) => lines.push(message));
  const status = await core.ffprobe('-v', 'error', ...demuxerLimits, '-select_streams', 'v:0', '-show_entries',
    'format=duration:stream=width,height,duration:stream_side_data=rotation', '-of', 'json', inputName);
  core.reset();
  if (status !== 0) throw new Error('無法讀取影片資料以加上時間戳。');
  const raw = lines.join('\n');
  const result = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  const video = result.streams?.[0];
  if (!(video?.width > 0 && video?.height > 0)) throw new Error('無法讀取影片尺寸。');
  const flip = video.side_data_list?.some(({ rotation }) => Math.abs(rotation) % 180 === 90);
  return { width: flip ? video.height : video.width, height: flip ? video.width : video.height,
    duration: Number(result.format?.duration || video.duration) };
}

function assColor(hex, fallback, opacity = 1) {
  const rgb = (/^#[a-f0-9]{6}$/i.test(hex) ? hex : fallback).slice(1);
  const alpha = Math.round((1 - opacity) * 255).toString(16).padStart(2, '0');
  return '&H' + alpha + rgb.slice(4, 6) + rgb.slice(2, 4) + rgb.slice(0, 2);
}

function assTime(total) {
  return Math.floor(total / 3600) + ':' + [Math.floor(total / 60) % 60, total % 60]
    .map((value) => String(value).padStart(2, '0')).join(':') + '.00';
}

async function stampFilter(core, stamp, inputName, maxWidth, maxHeight) {
  const video = await probeVideo(core, inputName);
  const factor = Math.min(1, maxWidth / video.width, maxHeight / video.height);
  const width = Math.max(2, Math.floor(video.width * factor / 2) * 2);
  const height = Math.max(2, Math.floor(video.height * factor / 2) * 2);
  const scale = Number.isFinite(stamp.size) ? Math.min(140, Math.max(70, stamp.size)) / 100 : 1;
  const opacity = Number.isFinite(stamp.opacity) ? Math.min(100, Math.max(0, stamp.opacity)) / 100 : .7;
  const alignment = ({ 'top-left': 7, 'top-right': 9, 'bottom-left': 1, 'bottom-right': 3 })[stamp.position] || 9;
  const family = families.get(stamp.font) || families.get('mono');
  const style = [family, Math.max(6, Math.round(Math.min(width / 27, height / 21) * scale)),
    assColor(stamp.color, '#ffffff'), '&H00000000', '&H00000000',
    assColor(stamp.background, '#000000', opacity), stamp.font === 'sans' ? -1 : 0,
    0, 0, 0, 100, 100, 0, 0, opacity ? 4 : 1, stamp.outline ? 1 : 0, opacity ? 3 : 0,
    alignment, Math.max(12, Math.round(width * .025)), Math.max(12, Math.round(width * .025)),
    Math.max(10, Math.round(height * .035)), 1];
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Stamp,${style.join(',')}
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const zone = stamp.showZone === false ? '' : ' UTC+' + String(stamp.offset).padStart(2, '0') + ':00';
  const event = (from, to, second) => {
    const text = new Date((stamp.wall + second) * 1000).toISOString().slice(0, 19).replace('T', ' ');
    return `Dialogue: 0,${assTime(from)},${assTime(to)},Stamp,,0,0,0,,${text}${zone}\n`;
  };
  let body;
  if (stamp.mode === 'clock') {
    const length = Math.ceil(video.duration);
    if (!Number.isFinite(length) || length <= 0 || length > 43200) {
      throw new Error('無法確認影片片長，或片長超過 12 小時。請選固定時間戳。');
    }
    body = Array.from({ length }, (_, index) => event(index, index + 1, index)).join('');
  } else {
    body = event(0, Math.max(86400, Math.ceil(video.duration || 0)), 0);
  }
  core.FS.writeFile(stampPath, new TextEncoder().encode(header + body));
  return `ass=filename=${stampPath}:fontsdir=${fontDir}`;
}

function seconds(value) {
  return value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

self.onmessage = async ({ data }) => {
  if (data.type === 'initialize') {
    if (engine) return;
    try {
      engine = await loadEngine(data.assets);
      send({ type: 'ready' });
    } catch {
      send({ type: 'worker-error', message: '無法初始化已驗證的轉檔核心。' });
    }
    return;
  }
  const logs = [];
  const stage = (message) => self.postMessage({ type: 'stage', message });
  let ffmpeg;
  let duration;
  let progressAt = -Infinity;
  const extension = /^\.[a-z0-9]{1,8}$/i.test(data.extension) ? data.extension.toLowerCase() : '';
  const inputName = '/input' + extension;
  try {
    if (!engine) throw new Error('隔離轉檔核心尚未準備完成。');
    ffmpeg = engine;
    const compress = data.mode === 'compress';
    const [maxWidth, maxHeight] = compress ? [1280, 720] : [1920, 1080];
    const input = new Uint8Array(data.bytes);
    rejectEncryptedBoxes(input);
    ffmpeg.FS.writeFile(inputName, input, { canOwn: true });
    const stamp = data.stamp ? await stampFilter(ffmpeg, data.stamp, inputName, maxWidth, maxHeight) : '';
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
    // Fit within the selected bounds, preserving aspect ratio and even dimensions.
    const fit = `scale=w='min(iw,${maxWidth})':h='min(ih,${maxHeight})':force_original_aspect_ratio=decrease:force_divisible_by=2`;
    const filter = [fit, 'sidedata=mode=delete:type=DYNAMIC_HDR_PLUS', stamp].filter(Boolean).join(',');
    stage('正在製作 Windows 相容 MP4…');
    const code = await ffmpeg.exec(
      '-fflags', '+genpts', ...demuxerLimits, '-i', inputName, '-map', '0:v:0', '-map', '0:a:0?',
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
