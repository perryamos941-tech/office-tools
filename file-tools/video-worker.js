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
    const input = ['-i', inputName, '-map', '0:v:0', '-map', '0:a:0?'];
    const compatibility = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-c:a', 'aac'];
    const fitEvenDimensions = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
    const run = (options) => {
      const code = ffmpeg.exec(...input, ...options, '-movflags', '+faststart', outputName);
      ffmpeg.reset();
      return code;
    };
    let code;
    if (data.mode === 'copy') {
      stage('正在轉為 MP4…');
      code = run(['-c', 'copy']);
      if (code !== 0) {
        stage('正在嘗試轉換音訊並保留原畫質…');
        code = run(['-c:v', 'copy', '-c:a', 'aac']);
      }
    } else {
      stage('正在重新編碼影片…');
      const options = data.mode === 'compress'
        ? ['-crf', '28', '-vf', "scale=-2:trunc(min(ih\\,720)/2)*2", '-b:a', '96k']
        : ['-crf', '21', '-vf', fitEvenDimensions, '-b:a', '128k'];
      code = run([...compatibility, ...options]);
    }
    if (code !== 0) {
      throw new Error(data.mode === 'copy'
        ? '快速轉檔失敗。可嘗試兼容模式，或從原廠播放器重新匯出影片。'
        : '影片無法轉檔。請查看詳情，或從原廠播放器重新匯出影片。');
    }
    const output = ffmpeg.FS.readFile(outputName);
    if (!output.length) throw new Error('轉檔結果為空。請檢查來源影片。');
    self.postMessage({ type: 'done', output, log: logs.join('\n') }, [output.buffer]);
  } catch (error) {
    const message = logs.length ? error.message : '無法啟動轉檔。請檢查網絡及瀏覽器後重試。';
    self.postMessage({ type: 'error', message, log: [...logs, error.message].join('\n') });
  }
};
