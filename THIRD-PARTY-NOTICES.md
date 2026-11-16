# 第三方套件及授權

Office 萬用小工具自有程式碼依 [MIT 授權](LICENSE) 提供。第三方程式碼、字型及其他資源繼續適用各自的授權。PDF、OCR、圖片與條碼工具隨附的授權及聲明保留於網站頁尾及原始套件。

| 套件 | 版本與授權 | 原始碼／建置 |
| --- | --- | --- |
| Project516 FFmpeg WebAssembly 核心 | `@project516/ffmpeg-wasm-core 0.18.0`，AGPL-3.0-or-later。[授權全文](licenses/Project516-AGPL-3.0.txt)、[NOTICE](licenses/Project516-NOTICE.txt)、[上游 MIT 聲明](licenses/Project516-Upstream-MIT.txt) | [v0.18.0 對應原始碼](https://github.com/Project516/ffmpeg.wasm/tree/v0.18.0)、[建置配方與依賴](https://github.com/Project516/ffmpeg.wasm/blob/v0.18.0/Dockerfile)、[FFmpeg 9.0.2 建置所用提交](https://github.com/FFmpeg/FFmpeg/tree/946fcce07b6dcd0331c8cc609192aeff5e1924f8) |
| ExifReader | 4.54.0，MPL-2.0。[MPL 全文](licenses/ExifReader-MPL-2.0.txt) | [4.54.0 原始碼](https://github.com/mattiasw/ExifReader/tree/v4.54.0) |
| JSZip | 3.10.1，MIT 或 GPL-3.0-or-later。此專案採用 [MIT 條款](licenses/JSZip-MIT.txt)。 | [3.10.1 原始碼](https://github.com/Stuk/jszip/tree/v3.10.1) |
| DejaVu 字型子集 | 等寬、粗體無襯線、襯線。[原授權及版權聲明](file-tools/stamp-font-LICENSE.txt) | [DejaVu Fonts](https://dejavu-fonts.github.io/) |

影片工具從 jsDelivr 下載原版發行套件的 UMD JavaScript 和 WASM，並驗證 SHA-384 後才載入。已核對實際 WASM 回報 FFmpeg n9.0.2，與發行標籤的 Dockerfile 相符。上游 NOTICE 的單執行緒版本行仍列 n5.1.10，原文保留以上游來源及實測版本補充。影片 Worker 的自有原始碼也可以按 AGPL-3.0-or-later 取得，見其檔案內授權標記。
