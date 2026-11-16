# Office 萬用小工具 (Office Tools Pro)

一個純前端的辦公室生產力工具集合。檔案在瀏覽器內處理。

[開啟 Office 萬用小工具](https://perryamos941-tech.github.io/office-tools/) · [開啟批量改名與影片工具](https://perryamos941-tech.github.io/office-tools/file-tools/)

## v4.16 檔案工具

- **批量改名**支援 JPG／JPEG／HEIC／HEIF 的 EXIF 拍攝時間，以及其他檔案的修改時間。可沿用原名或輸入活動名稱，自選日期及時分秒格式、設定全批共用日期及時間或偏移分鐘，亦可逐檔修正、加流水號及儲存命名預設，預覽後下載改名副本的 ZIP。每批最多 250 MB 及 3,000 個檔案。
- **影片工具**可逐段處理最多 20 段影片，可續跑、只重試失敗項目，並逐段下載或分卷打包為 ZIP。兩個模式均輸出 H.264 8-bit 4:2:0／AAC-LC MP4，適合 Windows 播放。每段最多 128 MB，每個 ZIP 卷最多 256 MB，建議使用電腦瀏覽器。DAV 支援視乎錄影機的匯出格式。
- 檔案工具可從首頁的 04／05 分頁或獨立頁面開啟。處理元件按需從 CDN 載入，原始檔案在瀏覽器內處理。影片功能透過 HTTPS 或 localhost 開啟。

## 🚀 主要功能 (Features)

### 1. 📄 PDF 助手 (PDF Assistant)
- **視覺化排序**：拖曳頁面調整順序。
- **旋轉頁面**：修正掃描錯誤的方向。
- **提取/分割**：選取特定頁面匯出為新 PDF。
- **隱私安全**：完全在瀏覽器運行，PDF 不會上傳伺服器。

### 2. ⚡ 極速圖片壓縮 (Image Compression Turbo)
- **支援格式**：JPG, PNG, **HEIC (iPhone)**。
- **批量處理**：多線程並發處理，速度極快。
- **浮水印**：自動讀取 EXIF 日期並壓印在照片上。
- **隱私保護**：本地運算，照片不離機。

### 3. 🏷️ 條碼生成 (Barcode Generator)
- 支援 Code128 條碼與 QR Code。
- 支援批量生成並匯出為 PDF (A4 排版) 或 Excel。

## 🛠️ 技術棧 (Tech Stack)
- **Core**: HTML5, Bootstrap 5, Vanilla JS
- **Libraries**: `pdf-lib`, `jspdf`, `heic2any`, `sortablejs`
- **Deployment**: GitHub Pages

## ⚠️ 免責聲明 (Disclaimer)
本工具所有運算均在客戶端（瀏覽器）完成，不會將您的檔案上傳至任何伺服器。
This tool runs entirely on the client-side (browser). No files are uploaded to any server.

## 📄 License
MIT License
