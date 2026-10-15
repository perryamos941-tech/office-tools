Office 萬用小工具 v4.11 試用版

這次是「網站檔案包」，不是單一 HTML。用家仍只開一個網址，不需安裝任何擴充功能。
請把整個 website 資料夾內的檔案一起上傳，不能只上傳 index.html。

建議先用 /v411/ 測試，不立即取代現有首頁：
1. 解壓下載的 ZIP。
2. 開啟 GitHub Desktop，選擇現有網站的 repository。
3. 按 Repository > Show in Explorer。
4. 找到現有 index.html 所在資料夾（可能是專案根目錄，或 docs 資料夾）。
5. 在該位置新增 v411 資料夾，把 ZIP 的 website 資料夾內「所有內容」複製進去。
   正確結構是 v411/index.html、v411/office-engine/、v411/fonts/ 等。
   不要變成 v411/website/index.html。
6. 回 GitHub Desktop，確認變更只有這次新增的 v411 檔案。
7. Summary 填「Add Office Tools v4.11 trial」，按 Commit to main，再按 Push origin。
8. 等候 GitHub Pages 部署成功，在原網站的資料夾網址後加 v411/。
   例如 https://你的名稱.github.io/你的專案/v411/
   若原網址以 index.html 結尾，先移除 index.html，再加 v411/。
9. 首次開啟可能自動重新載入一次，這是準備瀏覽器環境，不是安裝擴充功能。
10. 按「預先載入引擎」，就緒後選擇 DOCX／PPTX／XLSX，逐頁放大檢查，再匯出。

試用滿意後正式更新：
把 website 內所有內容複製到現有首頁 index.html 所在位置，取代同名檔案，Commit、Push。
保留原本 CNAME、.github、README 等與本次無關的檔案；不要整個刪除專案。
本工具不會代你修改或發布 GitHub。

啟動及下載：
- 使用 HTTPS 網址；不能靠雙擊本機 HTML 啟用 Office 引擎。
- PDF／OCR 等基本程式在首頁載入；Office 引擎按需下載。
- Office 引擎由官方 ZetaOffice CDN 提供，首次網路傳輸約 52 MB（依伺服器壓縮而定）。
- 網站另外提供約 16 MB 的 Office 中文替代字體；介面字體亦需載入。
- 引擎解壓後快取約 260 MB，運行時需更多記憶體。建議先用電腦 Chrome／Edge／Brave。
- 只快取引擎，不把用家文件寫入 CacheStorage 或 IndexedDB。
- 官方 CDN 可見一般靜態資源請求（例如 IP），不會收到用家所選文件。
- 新增引擎使用固定 SHA-256 校驗。若官方 CDN 換版本，會停止並提示更新，不會混用新舊檔案。
- 清除引擎快取：先「停止／釋放引擎記憶體」，再按「清除引擎快取」。
- Safari、Firefox 及實體 Samsung 手機尚未完成測試；不保證手機大文件轉換。

轉換範圍：
- DOCX／PPTX／XLSX 改用本機 LibreOffice 技術引擎，失敗不會退回舊版近似重畫。
- 輸出可保留文字與向量內容，依文件而定。
- Excel 依列印範圍、紙張、方向、縮放等設定輸出，可能有多頁。
- 字體替代、OLE、複雜版面、SmartArt 等仍可能與 Microsoft Office 不同。
- 不執行巨集，不更新外部文件連結；外部連線封鎖可能令某些內容無法顯示。
- DOC／PPT／XLS／DWG 本次未開放；TXT／CSV 保留原有純文字輸出。
- 單檔上限 40 MB、解壓後 100 MB；引擎載入四分鐘逾時，單檔轉換兩分鐘逾時。
- 遇到密碼檔、損壞檔或卡住，可停止引擎後重試。原始檔不會被修改。

重要：本版是試用版，測試通過不代表所有 Office 文件都能完美還原。
請先確認測試網址顯示 v4.11，再用自己的文件核對頁數、文字、圖表和列印範圍。
