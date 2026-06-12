## v0.1.18 — Codex 模型修復、伺服器診斷

### AI Agent：Codex 訂閱修復
- 修正「The 'gpt-5.4-codex' model is not supported」錯誤：模型清單 API 已改版（需帶 `client_version`），現在能正確取得即時清單；預設模型更新為 **gpt-5.5**
- 已儲存的舊模型名稱自動升級；未來模型再被下架時會自動改用清單上第一個可用模型並記住，不再卡死
- 實測通過：模型清單（gpt-5.5／gpt-5.4／gpt-5.4-mini）與完整對話回應

### 伺服器面板：看得懂的啟動失敗
- 啟動失敗時顯示**人話診斷**：API Key 不存在／金鑰格式錯誤／憑證問題／登入失敗，並以紅字標出原始 ERROR 行
- 修正 log 截斷 bug — 之前只保留開頭，真正的錯誤原因（在結尾）反而被切掉
- 新增「**複製診斷資訊**」按鈕：一鍵複製 App 版本、平台、伺服器狀態、行情流狀態與 log，回報問題直接貼上
- 面板標題列與診斷 Debug 面板現在都會顯示 **App 版本**，截圖回報一眼識別

---

⚠ AI 分析僅供參考；自動下單模式請自行評估風險，盈虧自負。Codex 訂閱通道為非官方文件化端點，可能隨 OpenAI 調整而變動。

Shioaji Pro 桌面版 — 內建 shioaji server（sidecar）、伺服器管理介面、系統匣、自動更新。

下載：macOS `.dmg` ｜ Windows `.msi` / `.exe` ｜ Linux `.AppImage` / `.deb` / `.rpm`
