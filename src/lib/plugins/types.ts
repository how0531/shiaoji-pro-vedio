// src/lib/plugins/types.ts — 外掛系統的公開契約。
// 與 shioaji-pro-plugins/packages/sdk/src/types.ts 保持同步（手動）。

import type { ContractInfo } from '../types/contract';
import type { SseTick } from '../stream';

export const HOST_API_VERSION = 1;

// 官方商店 manifest 的 URL；開發時可用 localStorage 'sjp.plugins.storeUrl' 覆寫
export const OFFICIAL_STORE_URL =
    'https://github.com/Sinotrade/shioaji-pro-plugins/releases/latest/download/store.json';

export interface PluginManifest {
    id: string;
    name: string;
    version: string; // semver 三段
    apiVersion: number;
    minAppVersion: string;
    entry: string; // 相對於 manifest 所在目錄，如 'index.js'
    sha256: string; // entry bundle 的 sha256 hex
    description: string;
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

export interface ThemeTokens {
    mode: 'dark' | 'midnight' | 'light';
    up: string; // 漲色（依台/美慣例設定變化）
    down: string;
    text: string;
    bg: string;
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
}

// bundle 載入後從 window.SJP_PLUGIN 取得的形狀
export interface PluginModule {
    activate(host: PluginHost): PluginPanels;
}
