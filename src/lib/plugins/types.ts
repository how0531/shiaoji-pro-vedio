// src/lib/plugins/types.ts — 外掛系統的公開契約。
// 與 shioaji-pro-plugins/packages/sdk/src/types.ts 保持同步（手動）。

import type { ContractInfo } from '../types/contract';
import type { SseTick } from '../stream';

export const HOST_API_VERSION = 1;

// 官方商店 manifest 的 URL；開發時可用 localStorage 'sjp.plugins.storeUrl' 覆寫
// 外掛市集架在 GitHub Pages（目錄式網址，載入器才抓得到
// <base>/<id>/manifest.json）。市集若換帳號或搬到內網，改這一行即可，
// 開發時也能用 localStorage 的 sjp.plugins.storeUrl 覆寫。
export const OFFICIAL_STORE_URL =
    'https://how0531.github.io/shioaji-pro-plugins/store.json';

// ---- 權限模型（宣告即揭露）----
// 外掛在 manifest 宣告它會用到哪些能力，商店把宣告攤開給使用者看。
// v1 的定位是揭露與可稽核，不是安全邊界：bundle 與 App 同一個 realm，
// 真正的防線是官方審核、manifest 的 sha256 pinning 與 side-load 警告。
// 順序即商店的顯示順序（高風險在前）。

export const PLUGIN_PERMISSION_IDS = [
    'account-identity',
    'account-switch',
    'portfolio-read',
    'order-history-read',
    'realtime-quote',
    'watchlist-write',
    'ui-navigate',
    'market-data',
    'notifications',
    'local-settings',
] as const;

export type PluginPermissionId = (typeof PLUGIN_PERMISSION_IDS)[number];

export type PluginPermissionRisk = 'high' | 'medium' | 'low';

export interface PluginPermissionInfo {
    label: string; // 商店列出的一行標題（使用者視角，不寫端點名稱）
    description: string; // 展開後的白話說明
    risk: PluginPermissionRisk;
}

export const PLUGIN_PERMISSIONS: Record<
    PluginPermissionId,
    PluginPermissionInfo
> = {
    'account-identity': {
        label: '你的身分與券商帳號',
        description:
            '能看到你有哪些券商帳號代碼，不包含姓名、身分證字號與憑證到期日。',
        risk: 'high',
    },
    // 風險評 high：外掛本身不能下單（deny-list 擋住 place_order 等
    // path），但它能換掉 App 的全域目前帳戶。切走之後，使用者自己手動
    // 下的單、看的庫存都會進到外掛選的那一戶，不是使用者以為的那一戶，
    // 這個後果跟外掛直接下單一樣傷，所以不能因為「外掛沒有下單權限」
    // 就把這個權限評成中低風險。
    'account-switch': {
        label: '切換你正在使用的帳戶',
        description:
            '能把 App 的目前帳戶換成你的另一個券商帳戶，下單面板與帳務面板都會跟著換。若外掛在你不知情時切換，你後續手動下的單會進到另一個帳戶。',
        risk: 'high',
    },
    'portfolio-read': {
        label: '你的庫存、損益與可動用資金',
        description:
            '能看到你手上有哪些股票期貨、成本與現在賺賠多少、帳戶餘額、交割金額、保證金與可用額度。',
        risk: 'high',
    },
    'order-history-read': {
        label: '你的委託與成交紀錄',
        description:
            '能看到你下過哪些單、價格數量與狀態，也能掛上成交回報，即時知道你每一筆成交。',
        risk: 'high',
    },
    'realtime-quote': {
        label: '即時報價訂閱',
        description:
            '訂閱指定商品的即時跳動報價，並會用掉券商給你的訂閱名額。',
        risk: 'medium',
    },
    'watchlist-write': {
        label: '你的自選股清單',
        description:
            '能讀你的自選清單，也能新增清單或把商品加進去（host 沒有給刪除與改名）。',
        risk: 'medium',
    },
    'ui-navigate': {
        label: '切換你正在看的商品',
        description:
            '能把整個 App 的目前商品換成別的代碼，其他面板（含下單面板）會跟著換。',
        risk: 'medium',
    },
    'market-data': {
        label: '公開行情與商品資料',
        description:
            '查股票、期貨、選擇權、權證的基本資料與歷史行情，跟你的帳戶和個資無關。',
        risk: 'low',
    },
    notifications: {
        label: '在通知中心留訊息',
        description: '能往通知中心寫訊息，內容由外掛自己決定。',
        risk: 'low',
    },
    'local-settings': {
        label: '在這台電腦存自己的設定',
        description: '把外掛自己的偏好設定存在本機，資料不會離開這台電腦。',
        risk: 'low',
    },
};

export interface PluginManifest {
    id: string;
    name: string;
    version: string; // semver 三段
    apiVersion: number;
    minAppVersion: string;
    entry: string; // 相對於 manifest 所在目錄，如 'index.js'
    sha256: string; // entry bundle 的 sha256 hex
    description: string;
    // 選填（舊 manifest 沒有這兩欄仍然有效）。
    // permissions：外掛宣告要用的能力，未知 id 在 parseManifest 就被拒。
    permissions?: PluginPermissionId[];
    // icon：lucide 圖示名稱（PascalCase，如 Receipt），或 1 至 2 個字元的
    // 角標（可放 emoji）。App 端解析順序固定三段：命中 allowlist 畫 lucide
    // 元件；長度 2 以內當文字角標；其餘或缺值取外掛名稱首字做 monogram。
    // 不接受 URL 與 data URI（CSP 限制、離線會破圖、第三方 SVG 有 XSS 風險）。
    icon?: string;
    // 選填，商店卡片顯示用（誰發佈這顆外掛）。缺值不影響既有 manifest。
    publisher?: string;
}

// store.json 的形狀（CI 產生）
export interface StoreCatalog {
    apiVersion: number;
    plugins: (PluginManifest & { url: string; disabled?: boolean })[];
}

export interface PluginPanelProps {
    // null → 面板未鎖定商品且全域也沒選；string → 當前商品代碼
    code: string | null;
}

export interface PluginPanelDef {
    key: string;
    label: string;
    pinnable: boolean;
    singleton: boolean;
    defaultSize: { w: number; h: number; minW: number; minH: number };
    Component: React.ComponentType<PluginPanelProps>;
}

export interface PluginPanels {
    panels: PluginPanelDef[];
}

export interface WarrantFilters {
    underlyingCode: string;
    callPut?: 'C' | 'P';
}

export interface WarrantInfo {
    code: string;
    name: string;
    call_put?: string;
    strike_price?: number;
    // 權證到期日欄位是 expiry_date（ContractInfo 的 call_put/exercise_ratio
    // 那一區）；delivery_date 是期貨/選擇權在用，權證回應中幾乎必為
    // undefined。保留 delivery_date 供舊資料 fallback，不刪。
    expiry_date?: string;
    delivery_date?: string;
}

// host.ui.theme() 回傳的設計 token。目的是讓外掛面板長得跟 App 內建面板
// 一樣，而不是只有漲跌色可用（只有 5 個 token 時，外掛怎麼排都跟 App 有
// 明顯落差，看起來像外掛而不像產品的一部分）。
//
// 【值的形態】mode/convention 以外分三類，混用前先看清楚：
// ・up / down / text / bg（v1 就有的四個）是實際色值字串（如
//   '#f23645'），canvas 的 fillStyle 也吃得下。
// ・其餘顏色與 font/space/radius 是 CSS 變數參照字串（形如
//   'var(--color-border__1x2y3z0)'）。主題 class 掛在 <html>，外掛面板是
//   它的後代，所以放進 inline style 或 SVG 屬性都會正確解析；而且使用者
//   切換主題時不用重新呼叫 theme() 就會自己跟著變（host v1 沒有主題變更
//   的訂閱 API，快照成實色反而會留在舊主題）。反過來說 canvas 的
//   fillStyle 不認 var()，要畫 canvas 請用上面那四個實色。
// ・fontSize 是純 rem 字面值（App 這一層沒有對應的 CSS 變數）。rem 會跟
//   著使用者的字級縮放走，不要自己換算成 px。
//
// 【只加不改】既有 5 個欄位的名稱與語意永遠不動，舊外掛照跑。
export interface ThemeTokens {
    mode: 'dark' | 'midnight' | 'light';
    up: string; // 漲色（依台/美慣例設定變化）
    down: string;
    text: string;
    bg: string;

    // 目前的漲跌色慣例：'tw' 紅漲綠跌、'intl' 綠漲紅跌。up/down 已經照
    // 慣例換過色，通常不用讀這欄；要寫「紅K/綠K」這種文案時才需要。
    convention: 'tw' | 'intl';

    // ---- 表面（由低到高的層次）----
    panel: string; // 面板底色。sticky 表頭要蓋住捲動內容就用它（不透明）
    panelRaised: string; // 浮起層：下拉選單、彈出卡片
    inset: string; // 凹陷層：統計卡背景、分組表頭
    hoverBg: string; // 列 hover 底色，也是進度條/量尺的軌道底色

    // ---- 文字 ----
    textMuted: string; // 次要文字：標籤、表頭、註解、單位

    // ---- 框線 ----
    border: string; // 一般邊框：面板分隔、卡片外框、表頭底線
    borderStrong: string; // 較亮的邊框：focus、需要強調的分隔
    borderSubtle: string; // 半透明細線：表格資料列之間的分隔線

    // ---- 品牌強調 ----
    accent: string; // 強調色：面板標題左側色條、連結、focus ring
    accentSoft: string; // accent 的低透明底：選取列、chip 背景

    // ---- 漲跌的低透明底（做 badge / chip 用）----
    upSoft: string;
    downSoft: string;
    flat: string; // 0 值不上色時的中性數字色

    // ---- 語意色（恆定，不隨台/美慣例翻轉）----
    // 警戒與風險一定要用這三個，不要拿 up/down 代打：使用者切成 intl
    // 慣例時 up/down 會互換，「維持率過低」會從紅變綠。
    success: string; // 安全、達標（恆綠）
    danger: string; // 危險、違規、追繳（恆紅）
    warning: string; // 警戒、接近門檻（琥珀）

    // ---- 字族 ----
    // 數字一律 mono，並自行加上 fontVariantNumeric: 'tabular-nums'
    // （兩者永遠成對出現，否則數字欄會跳動）。
    font: {
        display: string; // 標籤、表頭、標題
        mono: string; // 所有數字
        body: string; // 中文敘述
    };

    // ---- 字級階梯 ----
    // 交易終端的密度，比一般後台小一號以上，照這個梯度用就會跟 App 一致。
    fontSize: {
        kpi: string; // 1.4rem，面板唯一的主指標
        stat: string; // 1rem，統計卡的值
        total: string; // 0.9rem，小計/總額列
        body: string; // 0.72rem，表格與一般數值
        label: string; // 0.64rem，資料標籤
        header: string; // 0.62rem，表頭與區塊小標
        micro: string; // 0.6rem，最小註記
    };

    // ---- 間距 ----
    // 表格 cell 的慣例是 padding: `4px ${space.sm}`（列高約 22 至 24px）。
    space: {
        xs: string; // 0.25rem
        sm: string; // 0.5rem
        md: string; // 1rem
        lg: string; // 1.5rem
        xl: string; // 2rem
    };

    // ---- 圓角 ----
    // chip 之類的膠囊直接寫 '999px'，不在這個梯度裡。
    radius: {
        sm: string; // 0.25rem，卡片與 badge
        md: string; // 0.375rem
        lg: string; // 0.5rem
    };
}

// /api/v1/auth/accounts 的投影，刻意只留這四個欄位。原始回應還帶
// person_id（身分證字號）與 username（姓名），外掛查帳只需要
// broker_id/account_id 挑對戶頭，姓名與身分證字號沒有功能上的必要卻讓
// 每個外掛都變成個資持有者，所以不投影過去。這個邊界要與 host.ts 的
// assertAllowedPath deny-list 搭配才成立：宣告用來揭露，deny-list 用來
// 強制，否則外掛仍可自己 api.get('/api/v1/auth/accounts') 繞過去。
export interface PluginAccount {
    account_type: 'S' | 'F';
    broker_id: string;
    account_id: string;
    signed: boolean;
}

export interface PluginHost {
    apiVersion: number;
    appVersion: string;
    api: {
        get<T>(path: string): Promise<T>;
        post<T>(path: string, body: unknown): Promise<T>;
    };
    stream: {
        subscribe(code: string, cb: (tick: SseTick) => void): () => void;
    };
    contracts: {
        resolve(code: string): Promise<ContractInfo | null>;
        searchWarrants(filters: WarrantFilters): Promise<WarrantInfo[]>;
    };
    ui: {
        theme(): ThemeTokens;
        onSelectCode(code: string): void;
        // 顯示於通知中心（trackActivity），非彈出式
        toast(msg: string, level?: 'info' | 'warn' | 'error'): void;
    };
    storage: {
        get<T>(key: string): T | null;
        set(key: string, value: unknown): void;
    };
    accounts: {
        /** 全部帳戶（含未簽署），供外掛自建選擇器 */
        list(): Promise<PluginAccount[]>;
        /** App 當前選擇的帳戶（跟隨 header 帳戶下拉），無則 null */
        current(type: 'S' | 'F'): Promise<PluginAccount | null>;
        /** 使用者在 App 切換帳戶時觸發，回傳退訂函數 */
        onChange(cb: () => void): () => void;
        /**
         * 把 App 的全域目前帳戶換成傳入的帳戶（下單面板、庫存面板、其他
         * 外掛都會跟著換）。找不到對應帳戶或帳戶未 signed 會 reject，
         * 不會靜默失敗。對應權限見 PLUGIN_PERMISSIONS 的 'account-switch'。
         */
        select(account: PluginAccount): Promise<void>;
    };
}

// bundle 載入後從 window.SJP_PLUGIN 取得的形狀
export interface PluginModule {
    activate(host: PluginHost): PluginPanels;
}
