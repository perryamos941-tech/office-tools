# 第三方套件及授權

Office 萬用小工具自有程式碼依 [MIT 授權](LICENSE) 提供。第三方程式碼、字型及其他資源繼續適用各自的授權。PDF、OCR、圖片與條碼工具隨附的授權及聲明保留於網站頁尾及原始套件。

| 套件 | 版本與授權 | 原始碼／建置 |
| --- | --- | --- |
| FFmpeg WebAssembly 單執行緒核心 | `@ffmpeg/core 0.12.10`，GPL-2.0-or-later。[GPL v2 全文](licenses/FFmpeg-GPL-2.0.txt) | [發行版本 v12.15](https://github.com/ffmpegwasm/ffmpeg.wasm/releases/tag/v12.15)、[該版建置腳本](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v12.15/build)、[Dockerfile 與依賴來源](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/Dockerfile)、[FFmpeg n5.1.4 原始碼](https://github.com/FFmpeg/FFmpeg/tree/n5.1.4) |
| ExifReader | 4.54.0，MPL-2.0。[MPL 全文](licenses/ExifReader-MPL-2.0.txt) | [4.54.0 原始碼](https://github.com/mattiasw/ExifReader/tree/v4.54.0) |
| JSZip | 3.10.1，MIT 或 GPL-3.0-or-later。此專案採用 [MIT 條款](licenses/JSZip-MIT.txt)。 | [3.10.1 原始碼](https://github.com/Stuk/jszip/tree/v3.10.1) |
| DejaVu 字型子集 | 等寬、粗體無襯線、襯線。[原授權及版權聲明](file-tools/stamp-font-LICENSE.txt) | [DejaVu Fonts](https://dejavu-fonts.github.io/) |

影片工具從 jsDelivr 讀取原版 `@ffmpeg/core 0.12.10`。已核對該二進位檔回報 FFmpeg 5.1.4、Emscripten 3.1.40、`--enable-gpl` 和 `--enable-libx264`，與上列上游建置配方相符。第三方套件的其餘建置依賴列於上游 Dockerfile。

下載的 UMD JavaScript 和 WASM 均透過 Fetch Subresource Integrity，以原版 npm 發行包計算出的 SHA-384 驗證後才載入。驗證失敗會停止轉檔。
