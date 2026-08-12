# Shioaji Pro 外掛系統設計（Plugin System）

日期：2026-08-12
狀態：已與使用者逐段確認設計，待 spec 審閱

## 目標

讓 Shioaji Pro 擁有類似 Chrome 擴充功能的外掛機制：功能做成獨立外掛，
用戶在 App 內的商店自行選擇下載、更新、停用，外掛改版不需要重發 App。

首批外掛 ＝ e-Leader 點擊分析（`work/eleader-分析口徑備忘.md`）驗證出的
四個可立即補的缺口功能。

## 已確認的三個決策

| 決策 | 結論 |
|------|------|
| 信任邊界 | 自家團隊為主；進階用戶可 side-load 自製外掛（自負風險，載入前警告） |
| 發布通道 | 遠端載入：客戶在 App 內商店自行下載，更新不綁 App 發版 |
| v1 範圍 | 只做新功能外掛；現有 30 個內建面板不動 |

## 方案選擇

**採用方案 A：共享執行環境（ESM 動態載入）。**
外掛是獨立 build 的 ESM bundle，App 在 runtime `import()` 載入，React 由
App 提供（外掛 externalize）。外掛面板是一般 React 元件，主題、拖拉版面、
popout 全部沿用現有機制。

**未採用方案 B：iframe 隔離。** 隔離最強但交易面板體驗差（主題、彈窗、
串流都要橋接）。這是開放不受信任的第三方上架那天才需要的東西。
緩解：Plugin API 全部 async、參數可序列化，未來套 iframe 沙箱時外掛零改動。

## §1 外掛套件格式與載入流程

一個外掛 ＝ 一個 URL 指向的目錄：

```
plugin-statement/
  manifest.json
  index.js            ← ESM bundle
```

`manifest.json`：

```json
{
  "id": "statement",
  "name": "證券對帳單",
  "version": "1.2.0",
  "apiVersion": 1,
  "minAppVersion": "0.9.0",
  "entry": "index.js",
  "sha256": "…",
  "description": "月對帳單視圖，彙整損益與交割金流"
}
```

入口用具名匯出（本專案不用 default export）：

```ts
export function activate(host: PluginHost): PluginPanels
```

**載入流程**：App 啟動 → 抓官方商店 manifest（`store.json`）→ 比對已安裝
清單 → 已啟用的外掛逐一 `import()` → `activate(host)` → 回傳面板註冊進
動態註冊表 → 出現在「新增面板」選單。

**完整性**：桌面版 bundle 下載到 app data 目錄，sha256 驗證通過才執行。
Web 版直接 `import()` 官方 HTTPS URL。side-load 走商店的開發者模式
（本機資料夾／URL），載入前顯示自負風險警告對話框。

**故障隔離**：每個外掛面板包 Error Boundary，外掛崩潰只變成一格錯誤
卡片，不影響交易終端其他部分。商店可一鍵停用。

**相容性檢查**：`apiVersion` 大於 App 支援值、或 App 版本低於
`minAppVersion` → 拒絕載入並顯示原因。

## §2 Plugin API（`PluginHost`，apiVersion 1）

`activate(host)` 的 `host` 是外掛唯一的世界入口。全部方法 async、
參數與回傳值可序列化（為未來 iframe 沙箱鋪路）。

```ts
interface PluginHost {
    apiVersion: 1;
    appVersion: string;

    // 資料層：直通本機 shioaji server（沿用 src/lib/api.ts）
    api: {
        get<T>(path: string): Promise<T>;
        post<T>(path: string, body: unknown): Promise<T>;
    };

    // 行情串流：掛在現有單一 SSE 連線上，外掛不開新連線
    stream: {
        subscribe(code: string, cb: (tick: Tick) => void): () => void;
    };

    // 商品資訊（沿用 contracts-cache）
    contracts: {
        resolve(code: string): Promise<ContractInfo | null>;
        searchWarrants(filters: WarrantFilters): Promise<WarrantInfo[]>;
    };

    // UI 整合
    ui: {
        theme: () => ThemeTokens;           // 與主題切換連動
        onSelectCode(code: string): void;   // 全 App 商品連動跳轉
        toast(msg: string, level?: 'info' | 'warn' | 'error'): void;
    };

    // 每外掛 localStorage 命名空間隔離
    storage: {
        get<T>(key: string): T | null;
        set(key: string, value: unknown): void;
    };
}
```

面板註冊（欄位與現有 `BLOCK_META` 同形）：

```ts
export function activate(host: PluginHost): PluginPanels {
    return {
        panels: [{
            key: 'statement',
            label: '對帳單',
            pinnable: false,
            singleton: true,
            defaultSize: { w: 8, h: 10, minW: 4, minH: 5 },
            Component: StatementPanel,
        }],
    };
}
```

**v1 刻意不提供**（YAGNI＋風險控制）：

- 下單 API（`order/*`）：首批外掛都是查詢型。下單型外掛出現時，
  連同確認 UI 與風控整合一起設計，不先開洞。
- 跨外掛通訊、背景常駐任務、自訂快捷鍵：還沒有用戶。

## §3 商店 UI 與更新流程

- **入口**：header「外掛」按鈕開商店對話框（不佔版面格子）。
- **列表項**：名稱、描述、已裝版本 vs 最新版、啟用開關；
  動作＝安裝／更新／停用。
- **開發者模式**：收在商店底部，side-load 本機資料夾或 URL，
  載入前警告。
- **更新**：啟動抓一次 `store.json` → 有新版在商店按鈕掛紅點 →
  用戶手動點更新 → 下載驗 sha256 → 熱替換面板（該格子 remount，
  版面不動）。**不自動更新**：交易工具行為不能在用戶不知情下改變。
- **緊急下架**：`store.json` 的 `disabled: true` 旗標，App 啟動看到
  即強制停用並顯示原因。
- **停用佔位**：版面上被停用外掛的格子顯示「外掛已停用」佔位卡，
  不破壞用戶排好的版面。

## §4 首批四個外掛

需求量來自 e-Leader 點擊分析（主碼口徑）：

| 外掛 | id | e-Leader 需求 | 資料來源 | 確定性 |
|------|----|--------------|----------|--------|
| 證券對帳單 | `statement` | 9.6 萬 | `order/trades`＋`profit_loss`＋`settlements` | 端點都在 |
| 個股對應權證 | `warrant-finder` | 1.6 萬 | `contracts/warrants?underlying_code=` | 端點已在用 |
| 整戶與個股維持率 | `margin-ratio` | 2.4 萬 | `position_unit`＋即時報價自算 | 需驗證欄位含融資金額 |
| 融資券到期明細 | `credit-expiry` | 2.7 萬 | `credit_enquire`＋部位明細推到期日 | 需驗證含買進日期 |

兩個「需驗證」是實作前的驗證項：若 API 欄位不足，該外掛降級為
「顯示可得欄位」並在文件標明缺口，不硬湊數字。

## §5 Repo 結構與 CI

新開 monorepo `shioaji-pro-plugins`（依 new-project 慣例建立），
與主 repo 分離 —— 這就是「獨立製作、獨立更新」的落地：

```
shioaji-pro-plugins/
  packages/
    sdk/               ← PluginHost 型別＋vite build 設定（externalize react）
    statement/
    warrant-finder/
    margin-ratio/
    credit-expiry/
  store.json           ← 商店 manifest（CI 產生）
```

CI：tag 一個外掛 → build bundle → 算 sha256 → 更新 `store.json` →
發 GitHub Release。

**主 repo 的一次性改動**：

| 檔案 | 改動 |
|------|------|
| `src/lib/plugins.ts`（新） | manifest 抓取、bundle 載入、sha256 驗證、動態註冊表 |
| `src/lib/workspace.ts` | Block 加 `plugin` 型別（`{type:'plugin', pluginId, panelKey}`） |
| `src/App.tsx` | switch 加 `case 'plugin'`（含 Error Boundary） |
| 商店對話框元件（新） | 商店 UI＋header 按鈕 |

## 錯誤處理總表

| 情境 | 行為 |
|------|------|
| 外掛 bundle 下載失敗 | 商店顯示錯誤，重試按鈕；已裝版本繼續用 |
| sha256 不符 | 拒絕執行，商店顯示完整性錯誤 |
| `activate()` 拋例外 | 該外掛標記為載入失敗，其他外掛不受影響 |
| 面板 render 崩潰 | Error Boundary 顯示錯誤卡片＋「重新載入」按鈕 |
| apiVersion 不相容 | 拒絕載入，提示需更新 App |
| 遠端 `disabled: true` | 強制停用並顯示原因 |
| store.json 抓取失敗 | 靜默降級：已安裝外掛照常運作，僅無更新檢查 |

## 測試策略

- **sdk 套件**：PluginHost 介面的型別測試＋mock host，外掛可離線開發。
- **主 repo**：plugins.ts 的載入器單元測試（manifest 解析、版本比對、
  sha256 驗證、失敗路徑）。
- **端到端煙霧測試**：用一個 fixture 外掛驗證 安裝→顯示→停用→更新
  全流程。
- **四個外掛**：各自帶最小 self-check（API 回應形狀驗證）。

## 演進路線（本次不做）

1. 開放第三方上架 → 加 iframe 沙箱層（API 已可序列化，外掛零改動）。
2. 下單型外掛 → 連同確認 UI、風控（Kill Switch 整合）一起設計 order API。
3. 內建面板逐步遷出為官方外掛（等外掛介面被首批四個驗證過）。
