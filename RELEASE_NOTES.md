## v0.1.33 — 更新流程、版本辨識與回測時框

### App 更新
- 更新改為「背景下載」與「重新啟動並安裝」兩個步驟；下載完成後可自行決定安裝時間，不會突然中斷操作。
- Linux AppImage 保留 App 內更新；`.deb`／`.rpm` 改由下載頁或套件管理器更新，避免 App 內觸發系統權限提示。
- Server 管理面板會顯示下載進度、待安裝版本、安裝狀態與錯誤訊息。

### 版本與診斷
- 頂部明確顯示 Shioaji Pro App 版本，不再把 Shioaji Server 版本誤認為 App 版本。
- Server 管理面板同時顯示 `Server v1.7.0` 與 `App v0.1.33`，版本不相容時會直接警告。
- 相容 Shioaji Contract V2 延遲載入後可能省略的合約數健康資訊。

### 回測與 Agent
- 策略回測新增 30 分 K，沿用 1 分 K 聚合、指標、交易標記與績效計算流程。
- AI Agent 商品搜尋支援股票、期貨、選擇權、權證與正式指數代碼；指數查價和價格觸發支援 `quote_idx`。

---

⚠ 回測結果基於歷史資料與簡化成本假設，不代表未來績效；AI 分析僅供參考；自動下單請自行評估風險，盈虧自負。

Shioaji Pro 桌面版 — 內建 shioaji server（sidecar）、伺服器管理介面、系統匣、自動更新。

下載：macOS `.dmg` ｜ Windows `.msi` / `.exe` ｜ Linux `.AppImage` / `.deb` / `.rpm`
