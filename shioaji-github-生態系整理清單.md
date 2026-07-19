# Shioaji GitHub 生態系完整整理清單

> 蒐集日期:2026-07-20。方法:GitHub 關鍵字搜尋(`shioaji` 共 123 個 repo)+ Sinotrade 官方組織全列表 + topic 標籤 + 程式碼搜尋(`import shioaji`)+ 中文關鍵字(永豐金 api)+ 拼寫變體(shiaoji)。星數與更新日期為當日快照。

## 目錄

1. [官方資源(Sinotrade)](#1-官方資源sinotrade)
2. [作者與核心貢獻者](#2-作者與核心貢獻者)
3. [Shioaji 服務化:REST / WebSocket 閘道](#3-shioaji-服務化rest--websocket-閘道)
4. [自動交易框架與實盤系統](#4-自動交易框架與實盤系統)
5. [MCP / LLM / AI Agent 整合](#5-mcp--llm--ai-agent-整合)
6. [行情資料工程(蒐集/儲存/串流)](#6-行情資料工程蒐集儲存串流)
7. [儀表板與 GUI](#7-儀表板與-gui)
8. [通知與聊天機器人](#8-通知與聊天機器人)
9. [教學資源(鐵人賽/書籍/範例)](#9-教學資源鐵人賽書籍範例)
10. [跨語言與第三方框架整合](#10-跨語言與第三方框架整合)
11. [雲端部署範例](#11-雲端部署範例)
12. [長尾清單(個人練習/測試)](#12-長尾清單個人練習測試)
13. [統計與觀察](#13-統計與觀察)

---

## 1. 官方資源(Sinotrade)

| Repo | ⭐ | 語言 | 說明 |
|---|---|---|---|
| [Sinotrade/Shioaji](https://github.com/Sinotrade/Shioaji) | 487 | Dockerfile | **主 repo**。跨平台交易 API:Python 原生綁定 + HTTP API/SSE(JS、Go、C#、Rust 等任何語言可接)。含官方 Docker image `sinotrade/shioaji`。Issues 區是最大的問題討論庫 |
| [Sinotrade/shioaji-pro-app](https://github.com/Sinotrade/shioaji-pro-app) | 193 | TypeScript | **Shioaji Pro 專業交易終端**(本教學影片系列的主角)。React 19 + Vite,零後端,直連本機 `shioaji server`。即時 SSE 行情、K 線點價下單、閃電下單、觸價停損停利、可拖拉版面。UI 100% 開源;桌面版(Tauri)、AI Agent、回測為 Releases 專屬模組 |
| [Sinotrade/Sinotrade.github.io](https://github.com/Sinotrade/Sinotrade.github.io) | 9 | HTML | 官方文件網站原始碼(sinotrade.github.io),含 `llms-full.txt` 供 LLM 使用 |
| [Sinotrade/sj-trading-demo](https://github.com/Sinotrade/sj-trading-demo) | 12 | Python | 官方文件所有範例程式的集中 repo |
| [Sinotrade/scone](https://github.com/Sinotrade/scone) | 10 | Shell | 官方早期量化交易 App(early stage,含分析/回測/自動化願景) |
| [Sinotrade/rshioaji](https://github.com/Sinotrade/rshioaji) | 9 | Rust/PS | **Rust 重寫版**(alpha)。把 Shioaji 變成 HTTP API server + SSE + CLI 的引擎,即 Shioaji Pro 的底層;`plugins/` 內含官方 Claude Code shioaji plugin/skill 原始碼 |
| [Sinotrade/mcp-server-shioaji](https://github.com/Sinotrade/mcp-server-shioaji) | 9 | Python | **官方 MCP server**:讓 AI 助手查報價、歷史資料、合約清單 |
| [Sinotrade/sinopac_gateway](https://github.com/Sinotrade/sinopac_gateway) | 9 | Python | VNPY 的永豐 gateway(官方) |
| [Sinotrade/shioaji-app-demo](https://github.com/Sinotrade/shioaji-app-demo) | 2 | TypeScript | 自訂 App 模板(Vite+React+Tailwind),build 完上傳到 Shioaji Dashboard 的 Custom Apps |
| [Sinotrade/sj-qrcode](https://github.com/Sinotrade/sj-qrcode) | 0 | TypeScript | API 金鑰 JSON/QR code 產生器網站 |
| [Sinotrade/Shioaji.Csharp](https://github.com/Sinotrade/Shioaji.Csharp) / [shioaji_dotnet_sample](https://github.com/Sinotrade/shioaji_dotnet_sample) | 0 | C# | C#/.NET 綁定與範例(2021,舊;新專案建議走 HTTP API) |
| [Sinotrade/ShioajiOpenAPI](https://github.com/Sinotrade/ShioajiOpenAPI) | 0 | HTML | 早期 OpenAPI 文件(2020) |

其他組織內基礎建設 fork(非直接用法):`vnpy`、`manylinux`、`uv`、`miniconda3`、`sinopac_oauth2_client`、`pysolace`。

官方社群:README 內有 [Telegram](https://t.me/joinchat/973EyAQlrfthZTk1) 與 [Discord](https://discord.gg/5nzmWCTnG7) 連結。

---

## 2. 作者與核心貢獻者

### Yvictor(Shioaji 主要作者)

| Repo | ⭐ | 說明 |
|---|---|---|
| [Yvictor/sjtrade](https://github.com/Yvictor/sjtrade) | 32 | 當沖 demo 框架(PyPI `sjtrade`),部位檔驅動進出場,附 Colab 教學,測試覆蓋完整——**看作者怎麼用自己的 API 的最佳範本** |
| [Yvictor/shioaji-ddb](https://github.com/Yvictor/shioaji-ddb) | 28 | Shioaji × DolphinDB 時序資料庫整合(docker-compose 一鍵起) |
| [Yvictor/sj_sync](https://github.com/Yvictor/sj_sync) | 5 | 即時部位與報價同步工具 |
| [Yvictor/shioaji-example](https://github.com/Yvictor/shioaji-example) | 2 | 早期永豐金 API 範例 |
| [Yvictor/ShioajiCpp4Tutorial](https://github.com/Yvictor/ShioajiCpp4Tutorial) | 1 | C++ 教學、[ShioajiCI](https://github.com/Yvictor/ShioajiCI) CI 環境、[sj_trade_dev](https://github.com/Yvictor/sj_trade_dev) 開發沙盒 |

### SsallyLin

| Repo | ⭐ | 說明 |
|---|---|---|
| [SsallyLin/touchprice](https://github.com/SsallyLin/touchprice) | 35 | **觸價單擴充套件**(PyPI `touchprice`,官方文件進階篇引用):條件觸發自動下單 |
| [SsallyLin/ShioajiExample](https://github.com/SsallyLin/ShioajiExample) | 6 | Jupyter 範例集 |

### ypochien

| Repo | ⭐ | 說明 |
|---|---|---|
| [ypochien/Shioaji_Example](https://github.com/ypochien/Shioaji_Example) | 4 | 範例集 |
| [ypochien/Royabot](https://github.com/ypochien/Royabot) | 3 | Telegram 財經指標機器人 |
| [ypochien/SjTgBot](https://github.com/ypochien/SjTgBot) | 0 | Shioaji + Telegram 下單/報價機器人 |
| [ypochien/5element](https://github.com/ypochien/5element) | 3 | 交易系統 MVP;另有 [shioaji_on_gae](https://github.com/ypochien/shioaji_on_gae)(Google App Engine 部署範例) |

---

## 3. Shioaji 服務化:REST / WebSocket 閘道

把 Python SDK 包成網路服務,解決「只能 Python」「5 條連線上限」「跨程式共用」問題。(注:Shioaji 1.7+ / rshioaji 已內建官方 `shioaji server` HTTP+SSE 方案)

| Repo | ⭐ | 說明 |
|---|---|---|
| [luisleo526/shioaji-api-dashboard](https://github.com/luisleo526/shioaji-api-dashboard) | 119 | **社群最高星**。自動交易 REST API 服務:TradingView Webhook 直接下單台灣期貨、Docker 部署、NGROK 隧道、NGINX IP 白名單、中文 Web 控制台、自動重連 |
| [SDpower/shioajicaller](https://github.com/SDpower/shioajicaller) | 40 | WebSocket 服務包裝(PyPI `shioajicaller`+Docker image):合約匯出 CSV/Redis、報價轉發,多程式共用一條連線 |
| [Martingale42/shioaji-server](https://github.com/Martingale42/shioaji-server) | 2 | REST/WebSocket 閘道,作為 **NautilusTrader** Sinopac adapter 的後端 |
| [leolarrel/sinopac_shioaji](https://github.com/leolarrel/sinopac_shioaji) | 10 | 永豐證券/期貨交易 API 服務程式 |
| [MaxChenCMC/shioaji_trading_app](https://github.com/MaxChenCMC/shioaji_trading_app) | 1 | Python 後端 + React 前端的低延遲下單應用 |

---

## 4. 自動交易框架與實盤系統

| Repo | ⭐ | 說明 |
|---|---|---|
| [chrisli-kw/AutoTradingPlatform](https://github.com/chrisli-kw/AutoTradingPlatform) | 49 | 股票/期貨/選擇權通用交易框架(支援 Shioaji 1.5+、選擇權組合單):多策略、多帳戶、風控設定、部位同步 |
| [ppcvote/ultra-trader](https://github.com/ppcvote/ultra-trader) | 12 | 台指期開源系統:3 內建策略 + 斷路器/部位控管/回撤保護 + 回測引擎 + FastAPI/WebSocket 即時儀表板;模擬→沙盒→實盤三模式 |
| [youthink0/shioaji-options](https://github.com/youthink0/shioaji-options) | 9 | 選擇權即時自動下單/平倉(fork:[030helios](https://github.com/030helios/shioaji-options) ⭐3) |
| [wenli/Shioaji_job](https://github.com/wenli/Shioaji_job) | 4 | 永豐期貨策略模擬與回測;同作者 [Shioaji_stock](https://github.com/wenli/Shioaji_stock)(台股願望清單多週期更新+多策略回測) |
| [OswallowO/Remora](https://github.com/OswallowO/Remora) | 3 | 台股盤中當沖:主力資金追蹤、族群連動、自動做空、參數最佳化 |
| [Joyen09/tw-stock-strategy-framework](https://github.com/Joyen09/tw-stock-strategy-framework) | 2 | 台股量化框架:FinMind 資料 + Shioaji 下單,回測→模擬→實單,Telegram 通知遙控 |
| [kiratsao/trading-agents-v2](https://github.com/kiratsao/trading-agents-v2) | 2 | 小台 EMA(30/100) 趨勢系統 + Walk-Forward 驗證 + paper trading |
| [caizongxun/tw-daytrade-microstructure](https://github.com/caizongxun/tw-daytrade-microstructure) | 1 | 市場微結構當沖:OBI、VPIN、Trade Imbalance 指標 |
| [timhwchuang/tfx-trading](https://github.com/timhwchuang/tfx-trading) | 0 | 台指期 monorepo:執行核心 + tick 回測(前身 trading-engine 已封存) |
| [KevinYang515/tmf-bot](https://github.com/KevinYang515/tmf-bot) | 0 | 微台自動交易:TradingView + Shioaji + Streamlit |

小型/個人實盤專案:[a2007535/Autotrader](https://github.com/a2007535/Autotrader)、[a00909/shioaji_trading_bot](https://github.com/a00909/shioaji_trading_bot)、[watchstation-alt/shioaji-trading](https://github.com/watchstation-alt/shioaji-trading)、[kiwicabbage/sj-point](https://github.com/kiwicabbage/sj-point)、[CY-Li/TW-Quant-Shioaji](https://github.com/CY-Li/TW-Quant-Shioaji)、[shioajistablelab/shioaji-stable-trading-framework](https://github.com/shioajistablelab/shioaji-stable-trading-framework)、[Jason-King-Wang/shioaji-Auto-Trading-System](https://github.com/Jason-King-Wang/shioaji-Auto-Trading-System)、[axuanhogan/futures-trader](https://github.com/axuanhogan/futures-trader)、[wyizhi30/sj-trading](https://github.com/wyizhi30/sj-trading)、[lawxstudent168-cyber/shioaji-micro-taifex](https://github.com/lawxstudent168-cyber/shioaji-micro-taifex)

---

## 5. MCP / LLM / AI Agent 整合

| Repo | ⭐ | 說明 |
|---|---|---|
| [Sinotrade/mcp-server-shioaji](https://github.com/Sinotrade/mcp-server-shioaji) | 9 | 官方 MCP server(報價/歷史資料/合約查詢),uv 安裝,環境變數帶金鑰 |
| [offbeat-studio/shioaji-mcp](https://github.com/offbeat-studio/shioaji-mcp) | 2 | 非官方 MCP:含下單/刪單/持倉/帳務工具,交易功能預設停用(`SHIOAJI_TRADING_ENABLED=true` 才開) |
| [jason8745/llm-stock-analyzer](https://github.com/jason8745/llm-stock-analyzer) | 55 | FastAPI + LangChain 的 LLM 技術分析服務,YFinance 為主、Shioaji 為台股資料選配模組 |
| [D11225687/taiwan-stock-advisor](https://github.com/D11225687/taiwan-stock-advisor) | 1 | 17-agent 台股投資顧問(FastAPI+React+PostgreSQL+LSTM/XGBoost) |
| [daniel20059463-tech/tw-stock-research](https://github.com/daniel20059463-tech/tw-stock-research) | 0 | Multi-agent 台股研究 + 紙上交易原型(用 Shioaji 報價) |
| [cct08311github/ai-trader](https://github.com/cct08311github/ai-trader) | — | 前後端 AI 交易服務,內含 `shioaji_service.py` |

相關事實:

- **官方 Claude Code plugin**(`sinotrade-plugins` 的 shioaji skill)原始碼放在 [Sinotrade/rshioaji](https://github.com/Sinotrade/rshioaji) 的 `plugins/shioaji/` 內。
- **FinRL 官方支援**:[AI4Finance-Foundation/FinRL](https://github.com/AI4Finance-Foundation/FinRL) 上游內建 `finrl/meta/data_processors/processor_sinopac.py` 與 `example_of_shioaji_api.py`,眾多 FinRL fork 沿用。

---

## 6. 行情資料工程(蒐集/儲存/串流)

| Repo | ⭐ | 說明 |
|---|---|---|
| [NickLin910221/shioaji_realtime_kbars](https://github.com/NickLin910221/shioaji_realtime_kbars) | 13 | Tick 即時聚合成 K 線(PyPI `shioaji-realtime-kbars`);同作者 [shioaji_position_management](https://github.com/NickLin910221/shioaji_position_management) 部位管理擴充 |
| [gman-quant/shioaji-kafka-project](https://github.com/gman-quant/shioaji-kafka-project) | 5 | 行情打進 Kafka 的串流管線 |
| [ychuangab/TXF-Continuous-Data-Pipeline](https://github.com/ychuangab/TXF-Continuous-Data-Pipeline) | 3 | 台指期連續月 ETL:自動換月價差調整(back-adjustment)+ 完整性檢查 + Google Sheets |
| [Yeimaoz/shioaji-depth](https://github.com/Yeimaoz/shioaji-depth) | 0 | 期貨五檔深度錄製 → 每日 parquet;同作者 [shioaji-bars](https://github.com/Yeimaoz/shioaji-bars)(歷史 K 線抓取 CLI+Lib) |
| [TaiwanCCyoyo/shioaji-stock-prices](https://github.com/TaiwanCCyoyo/shioaji-stock-prices) | 1 | 台股股價下載存 CSV、轉日 K |
| [StockAndFutures/txf-pipeline](https://github.com/StockAndFutures/txf-pipeline) | 1 | 台指期點位擷取管線 |
| [chuangtc/shioaji_fetch_kbars](https://github.com/chuangtc/shioaji_fetch_kbars) | 0 | 抓台灣 50 成分股 K 線;[chenpercy/shioaji2gsheet](https://github.com/chenpercy/shioaji2gsheet) 持倉上傳 Google Sheet;[Yujun-Wen/shioaji_future_quoter](https://github.com/Yujun-Wen/shioaji_future_quoter) 期貨報價器 |

---

## 7. 儀表板與 GUI

| Repo | ⭐ | 說明 |
|---|---|---|
| [Weitsenyu/Option](https://github.com/Weitsenyu/Option) | 8 | React + Node + Shioaji 選擇權交易儀表板:選擇權鏈、希臘值、互動圖表 |
| [tim80411/shioaji-ticker](https://github.com/tim80411/shioaji-ticker) | 0 | macOS 選單列台指期近月報價(SwiftBar + Keychain 存金鑰) |
| [Soonoonoon/Dearpygui_Shioaji_Neutron_Demo](https://github.com/Soonoonoon/Dearpygui_Shioaji_Neutron_Demo) | 2 | DearPyGui 桌面看盤 demo |
| [testtestProblem/Treemap_Dashboard_Shioaji](https://github.com/testtestProblem/Treemap_Dashboard_Shioaji) | 0 | 市場熱力圖(Treemap);[test9312/streamlit_shioaji](https://github.com/test9312/streamlit_shioaji) Streamlit 版看盤;[Joshua0209/Portfolio-Dashboard](https://github.com/Joshua0209/Portfolio-Dashboard) 投組儀表板 |

---

## 8. 通知與聊天機器人

| Repo | ⭐ | 平台 | 說明 |
|---|---|---|---|
| [giantcash/TXF_monitor](https://github.com/giantcash/TXF_monitor) | 3 | Discord+Telegram | 台指期「呂布」訊號偵測、畫圖上傳 |
| [ypochien/Royabot](https://github.com/ypochien/Royabot) | 3 | Telegram | 財經指標查詢機器人 |
| [chatmind-studio/stock-buyer](https://github.com/chatmind-studio/stock-buyer) | 1 | LINE | 永豐金 API 串接買股 LINE 機器人 |
| [seriaati/long-term-order](https://github.com/seriaati/long-term-order) | 0 | Discord | 長效單(隔日有效單)下單機器人 |
| [toto11075/sj-trading-discord-bot](https://github.com/toto11075/sj-trading-discord-bot) | 0 | Discord | 交易 + Discord 通知 |

---

## 9. 教學資源(鐵人賽/書籍/範例)

| Repo | ⭐ | 說明 |
|---|---|---|
| [WilliamZhuo/ithome_ironman2021](https://github.com/WilliamZhuo/ithome_ironman2021) | 27 | **2021 iThome 鐵人賽**「從零開始用 Python 打造簡易投資工具」全系列程式碼([文章連結](https://ithelp.ithome.com.tw/users/20141238/ironman/4483)) |
| [eyelash500/2021_ironman_Shioaji](https://github.com/eyelash500/2021_ironman_Shioaji) | 7 | 鐵人賽「Shioaji API 30 天學習」逐日 notebook(登入/帳務/K線/五檔/下單) |
| [chuangtc/shioaji_api](https://github.com/chuangtc/shioaji_api) | 8 | 永豐金 Python API 範例;同作者 [SinoPac_Trade](https://github.com/chuangtc/SinoPac_Trade)(⭐4,Docker 化) |
| [ZJHuang915/PythonQuantTrading](https://github.com/ZJHuang915/PythonQuantTrading) | — | 書籍章節式範例(含 Airflow DAG 排程 Shioaji 下單) |
| [ting-hong-shieh/shioaji-api-setup-sandbox](https://github.com/ting-hong-shieh/shioaji-api-setup-sandbox) | 0 | 登入/帳戶/合約檢查的入門沙盒 |
| [how0531/shiaoji-pro-vedio](https://github.com/how0531/shiaoji-pro-vedio) | 0 | 本專案:Shioaji Pro 教學影片系列(入門 T1-T7 + 進階) |

其他:[seagarwu/shioaji_doc_adv](https://github.com/seagarwu/shioaji_doc_adv)(官方文件進階篇筆記)、[AlexLee5999/Learn_Shioaji](https://github.com/AlexLee5999/Learn_Shioaji)、[ycy1997alex/shioaji-usage](https://github.com/ycy1997alex/shioaji-usage)、[shihyu/jason_note](https://github.com/shihyu/jason_note)(大量收錄鐵人賽/範例程式)、[ray881116/ProgramTrade](https://github.com/ray881116/ProgramTrade)(下單/報價 notebook 練習)

---

## 10. 跨語言與第三方框架整合

| 生態 | Repo | 說明 |
|---|---|---|
| **VNPY** | [Sinotrade/sinopac_gateway](https://github.com/Sinotrade/sinopac_gateway) ⭐9、[Ed-Yang/vnpy-docker](https://github.com/Ed-Yang/vnpy-docker) ⭐23 | VNPY 量化平台接永豐;vnpy-docker 提供含 Sinopac gateway 的容器 |
| **NautilusTrader** | [Martingale42/shioaji-server](https://github.com/Martingale42/shioaji-server) | Rust 高頻回測/實盤框架的 Sinopac adapter 後端 |
| **FinRL(強化學習)** | [AI4Finance-Foundation/FinRL](https://github.com/AI4Finance-Foundation/FinRL) | 上游內建 `processor_sinopac.py` 資料處理器與 Shioaji 範例 |
| **Rust** | [Sinotrade/rshioaji](https://github.com/Sinotrade/rshioaji) | 官方 Rust 核心(HTTP/SSE server) |
| **C#/.NET** | [Sinotrade/Shioaji.Csharp](https://github.com/Sinotrade/Shioaji.Csharp)、[linsamtw/shioaji-dotnet](https://github.com/linsamtw/shioaji-dotnet) | 舊版 .NET 綁定 |
| **C++** | [Yvictor/ShioajiCpp4Tutorial](https://github.com/Yvictor/ShioajiCpp4Tutorial)、[dnplus/ShioajiCpp](https://github.com/dnplus/ShioajiCpp) | C++ 教學/實驗 |
| **加密貨幣** | [Yeimaoz/binance-shioaji-sdk](https://github.com/Yeimaoz/binance-shioaji-sdk) | 幣安期貨 SDK 但仿 shioaji 風格 API,方便台股量化者跨市場 |
| **DolphinDB** | [Yvictor/shioaji-ddb](https://github.com/Yvictor/shioaji-ddb) ⭐28 | 高效時序資料庫整合 |

---

## 11. 雲端部署範例

| Repo | 平台 | 說明 |
|---|---|---|
| [HarryKao1020/lambda-shioaji](https://github.com/HarryKao1020/lambda-shioaji) | AWS Lambda | 無伺服器執行 Shioaji |
| [huber0203/shioaji-zeabur](https://github.com/huber0203/shioaji-zeabur) | Zeabur | 台灣常見 PaaS 部署(同作者另有 V2/V3/V4 迭代版) |
| [ypochien/shioaji_on_gae](https://github.com/ypochien/shioaji_on_gae) | Google App Engine | GAE 部署範例 |
| [SHLo/shioaji-jupyter](https://github.com/SHLo/shioaji-jupyter) | Docker | Jupyter 開發環境映像 |
| [Ed-Yang/vnpy-docker](https://github.com/Ed-Yang/vnpy-docker) | Docker | VNPY + Sinopac 容器 |
| 官方 | Docker Hub | `docker run -it sinotrade/shioaji:latest` |

---

## 12. 長尾清單(個人練習/測試)

以下多為個人練習、無說明或久未更新的 repo,列出供完整性參考:

`nucweacia94fine/Shioaji_Utility`(⭐8)、`gitter-badger/Shioaji`(⭐6,badge bot fork)、`UltimateWing/WUG.Python.ShioajiApiLogic`、`peteranny/ShioajiPractice`、`Hao0820/ShioajiFeature`、`stanlet2000/shioaji`、`serverclient/shioaji`、`chungzon/ShioajiConsoleAP`、`leehsinwei/shioaji`、`ckw1206/shioaji`、`mincheng1976-tw/Shioaji`、`sunnylin13/shioaji`(常數定義)、`YuJun-BO2/shioaji-cli`、`adgj5472/shioaji_sample`、`serendipity109/Shioaji_tool`、`anita-tcj/my_shioaji`、`prochihua/shioaji_split`、`LYchou/shioaji-api`、`ReasonTsai/Shioaji-trial`、`jianjhih/CRun_shioaji`、`zlou-std/Shioaji_trading_order`、`CThomas607-Yao/shioaji-trading-bot`、`denny611/stock_prize_with_shioaji`、`Hungchenyu0926/shioaji-api-dashboard`(fork)、`ezmok69/smpp`、`ASK1734/Taiwan-futures-trading-with-shiaoji`、`webclinic017/AutoTradingBot`(fork 收藏帳號)、`MaxChenCMC/Shioaji_SetQuoteCallback_PlaceOrder`、`mobetat49008/house`、`veronicajian/Options_Project`、`a20082307/senior_project`(Transformer 預測)、`HiddlestonYu/stick_strategy`、`CcBAa/TX-Observer`、`kuo220/AlphaEdge`、`ss900405twtw/ultraXtrade`、`Charliesj0129/shijim` / `subhft`(HFT 實驗)、`devpcodes/testStrategy`、`marco79423/finance-bot`、`dicksonchai98/trading-monitoring-dashboard`、`mylin102/tw-trading-unified`(內嵌 shioaji AI skill)、`lala7722/simualtionTrader`、`daniel20059463-tech/tw-stock-research`

---

## 13. 統計與觀察

- **規模**:GitHub 關鍵字 `shioaji` 命中 **123 個 repo**;加上程式碼搜尋(`import shioaji`)與中文關鍵字補遺,實際使用專案約 **150+**。語言以 Python 為絕對主流,前端類(TypeScript/React)因 Shioaji Pro 與 HTTP API 出現後開始成長。
- **星數分佈**:官方主 repo 487★ 一枝獨秀;社群最高是 luisleo526 的 TradingView webhook 閘道(119★),反映「不寫 Python、只想接訊號下單」是最大眾需求。
- **三波演進**:① 2019-2021 Python SDK 範例/鐵人賽教學期 → ② 2021-2024 服務化(WebSocket/REST 包裝、Docker 部署)與框架期 → ③ 2025 之後 AI 期(MCP server、LLM 分析、multi-agent、rshioaji HTTP/SSE、Shioaji Pro 終端)。
- **常見主題**:台指期(TXF)相關專案數量明顯多於個股;觸價單、即時 K 線聚合、五檔錄製是最常被自製的「SDK 沒直接給」功能(其中觸價與 K 線已有 PyPI 套件:`touchprice`、`shioaji-realtime-kbars`)。
- **教學切入點**(給影片系列參考):官方範例集(`sj-trading-demo`)+ 鐵人賽兩套系列是新手最常抄的起點;MCP × Claude/LLM 自動交易與 Shioaji Pro Custom Apps(`shioaji-app-demo`)目前幾乎沒有中文教學內容,是空白區。

---

*本清單由 GitHub 搜尋自動蒐集 + 人工分類整理;星數為 2026-07-20 快照,實際請以各 repo 現況為準。*
