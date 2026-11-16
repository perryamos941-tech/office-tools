'use strict';

const coreURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js';
const wasmURL = coreURL.replace(/\.js$/, '.wasm');
const outputName = '/output.mp4';

self.onmessage = async ({ data }) => {
  const logs = [];
  const stage = (message) => self.postMessage({ type: 'stage', message });
  try {
    stage('正在載入轉檔引擎…');
    importScripts(coreURL);
    const ffmpeg = await self.createFFmpegCore({
      mainScriptUrlOrBlob: coreURL + '#' + btoa(JSON.stringify({ wasmURL }))
    });
    ffmpeg.setLogger(({ message }) => {
      logs.push(message);
      if (logs.length > 32) logs.shift();
    });
    const extension = /^\.[a-z0-9]{1,8}$/i.test(data.extension) ? data.extension.toLowerCase() : '';
    const inputName = '/input' + extension;
    ffmpeg.FS.writeFile(inputName, new Uint8Array(data.bytes), { canOwn: true });
    const compress = data.mode === 'compress';
    const [maxWidth, maxHeight] = compress ? [1280, 720] : [1920, 1080];
    // Fit within the selected bounds, preserving aspect ratio and even dimensions.
    const fit = `scale=w='min(iw,${maxWidth})':h='min(ih,${maxHeight})':force_original_aspect_ratio=decrease:force_divisible_by=2`;
    stage('正在製作 Windows 相容 MP4…');
    const code = ffmpeg.exec(
      '-fflags', '+genpts', '-i', inputName, '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', fit, '-fpsmax', '30', '-fps_mode', 'cfr', '-c:v', 'libx264',
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
    const message = logs.length ? error.message : '無法啟動轉檔。請檢查網絡及瀏覽器後重試。';
    self.postMessage({ type: 'error', message, log: [...logs, error.message].join('\n') });
  }
};
