# AI 交易代理 · 實作示範（Shioaji 模擬環境）

三個「AI Agent 風格」的完整可執行實作，重現 Shioaji Pro **桌面版 AI Agent** 面板背後在做的事——用程式驅動 Shioaji API 完成 agentic 交易任務。**全部跑在模擬環境（`simulation=True`），不動真錢。**

> 為什麼是腳本而不是面板？AI Agent 是**桌面版專屬的閉源模組**，開源 Web 版只顯示鎖定畫面。這幾支腳本用官方 Shioaji Python SDK 把「面板背後的邏輯」攤開來，既是教學實料，你也能直接改來用、或做成桌面版技能市集的技能。

## 環境

```sh
pip install shioaji            # SDK（本機實測 1.5.6 可用）
# 金鑰放 .env（同層或上層）：SJ_API_KEY / SJ_SEC_KEY
```

## 三個代理

| 腳本 | 任務 | 實測輸出 |
|---|---|---|
| `agent0_autonomous.py` | **自主代理（端到端）**：登入→掃描選股→決策→**實際送出委託**→掛 OCO 保護→盯場控管，一次跑完 | `run0.txt`（選 7814+21.67%→掛單 36.85 狀態 PreSubmitted→OCO 停損35.74/停利38.69→帳務盯場→撤單） |
| `agent1_premarket_scan.py` | **盤前掃描播報**：抓漲幅/量/額三張排行→交叉篩「量價俱足」→打分→口語播報→選自選候選 | `run1.txt`（篩出 10 檔、精選 8：3491昇達科/6243迅杰/2886兆豐金…） |
| `agent2_bracket_agent.py` | **括號單自動風控**：進場單成交後自動掛 OCO 停損停利，客戶端監看行情、到價才送市價單 | `run2.txt`（2317 進場234→停損226.98/停利245.7，監看到價觸發） |
| `agent3_position_monitor.py` | **持倉監控 Kill-Switch**：監看當日未實現＋已實現損益，超過日虧上限自動撤單＋示警 | `run3.txt`（讀持倉/損益、帳號遮蔽、日虧上限判斷） |

## 執行

```sh
python agent1_premarket_scan.py
python agent2_bracket_agent.py 2317 --demo        # 示範 OCO 到價邏輯（非交易日也能跑）
python agent2_bracket_agent.py 2317 --qty 1       # 真的送進場單（盤中成交後啟 OCO）
python agent3_position_monitor.py --max-loss 30000 --once
python agent3_position_monitor.py --max-loss 30000 --interval 10   # 持續盯場
```

## 設計對應（＝桌面版 AI Agent 的能力）

- **agentic 任務**：三支都是「給目標→自己抓資料→做決策→執行」的自動任務
- **技能（skill）**：每支的核心函式（掃描篩選、OCO 監看、Kill-Switch）都可包成可複用技能
- **排程**：`agent3 --interval` 就是最簡單的盯場排程；接 cron／Windows 工作排程器即可定時跑
- **客戶端觸價**：agent2 的 OCO「只在程式開著時監看行情、到價才送單」——與 App 的觸價單同一套限制

## 安全

- 全程模擬環境、帳號輸出已遮蔽（`mask_acct`）。
- agent2 live 模式與 agent3 的撤單會真的送 API 指令（模擬環境不動真錢）；正式環境使用請自負風險並先在模擬練熟。
- 非交易日：模擬伺服器會瞬間自動取消限價單、也沒有即時成交價——腳本邏輯照跑，部分「成交後」步驟需盤中才完整。
