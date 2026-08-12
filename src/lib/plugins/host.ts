// src/lib/plugins/host.ts — 外掛的世界入口。全部 async，參數可序列化
// （未來 iframe 沙箱相容）。v1 刻意不含下單 API。

import { apiGet, apiPost } from '../api';
import { trackActivity } from '../activity';
import { resolveContract, fetchWarrants, subscribeQuote } from '../shioaji';
import { ensureStream, onAnyTick } from '../stream';
import { getThemeSettings, getChartColors } from '../theme-store';
import type { PluginHost, ThemeTokens } from './types';
import { HOST_API_VERSION } from './types';

// App 版本：build 時由 vite define 注入（見 vite.config.ts 的
// __APP_VERSION__，讀 package.json）。測試等未注入環境 fallback 開發版號。
// export 給 store.ts 的 checkCompat 共用，避免重複解析邏輯。
declare const __APP_VERSION__: string | undefined;
export const APP_VERSION =
    typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';

function themeTokens(): ThemeTokens {
    const s = getThemeSettings();
    const c = getChartColors(s);
    return {
        mode: s.mode,
        up: c.up,
        down: c.down,
        text: s.mode === 'light' ? '#1a1a1a' : '#e8e8e8',
        bg: s.mode === 'light' ? '#ffffff' : '#101014',
    };
}

export function createHost(
    pluginId: string,
    bridge: { onSelectCode(code: string): void },
): PluginHost {
    const ns = `sjp.plugin.${pluginId}.`;
    return {
        apiVersion: HOST_API_VERSION,
        appVersion: APP_VERSION,
        api: {
            get: (path) => apiGet(path),
            post: (path, body) => apiPost(path, body),
        },
        stream: {
            subscribe(code, cb) {
                ensureStream();
                // 真訂閱：resolveContract 取完整 contract → subscribeQuote
                // 會 POST /api/v1/stream/subscribe，成功後才 registerSubscription
                // （見 shioaji.ts）。subscribe() 本身是同步 API（外掛立刻拿到
                // 退訂函式），這段是 fire-and-forget；失敗不 throw，只記一筆
                // 活動方便除錯。
                resolveContract(code)
                    .then((contract) => subscribeQuote(contract, 'Tick'))
                    .catch((e) => {
                        const msg = e instanceof Error ? e.message : String(e);
                        trackActivity(
                            `plugin:${pluginId}:error`,
                            `訂閱 ${code} 失敗：${msg}`,
                        );
                    });
                const off = onAnyTick((tick) => {
                    if (tick.code === code) cb(tick);
                });
                // 退訂只移除本地 tick listener，刻意不送 unsubscribe、也不
                // unregisterSubscription：同一代碼常被自選清單／看板等其他
                // 面板共享同一份訂閱，外掛結束訂閱若真的退訂，會連帶把別人
                // 正在看的行情斷掉。取捨是 session 內有界的行情洩漏（這個
                // 代碼在分頁存活期間仍會持續收到推播），換取不誤傷其他訂閱
                // 者。要收斂就得把 stream.ts 的訂閱登記表改成「共享訂閱計
                // 數」，歸零才真的送 unsubscribe——這是之後的升級路徑，不在
                // v1 host API 範圍內。
                return () => {
                    off();
                };
            },
        },
        contracts: {
            // resolveContract 一律 resolve 一筆 ContractInfo（查無則
            // reject），非 brief 猜想的 nullable — 直接轉呼叫即可，
            // Promise<ContractInfo> 可指派給 Promise<ContractInfo | null>
            resolve: (code) => resolveContract(code),
            // fetchWarrants 簽名是 (underlyingCode, filters)，回傳
            // ContractInfo[]（非 { contracts }），結構上已滿足 WarrantInfo[]
            searchWarrants: (filters) =>
                fetchWarrants(filters.underlyingCode, {
                    callPut: filters.callPut,
                }),
        },
        ui: {
            theme: themeTokens,
            onSelectCode: (code) => bridge.onSelectCode(code),
            toast: (msg, level = 'info') =>
                trackActivity(`plugin:${pluginId}:${level}`, msg),
        },
        storage: {
            get<T>(key: string): T | null {
                const raw = localStorage.getItem(ns + key);
                if (raw === null) return null;
                try {
                    return JSON.parse(raw) as T;
                } catch {
                    return null;
                }
            },
            set(key, value) {
                // 外掛自己的設定寫入失敗（配額/被封鎖）不該讓面板整個炸掉——
                // v1 host API 的 storage.set 本來就是 fire-and-forget，靜默吞
                // 掉即可，不像 store.ts 的 saveInstalled 有 rollback 需求
                try {
                    localStorage.setItem(ns + key, JSON.stringify(value));
                } catch {
                    // 配額爆了或被瀏覽器封鎖，外掛自己的設定沒存到，不影響面板
                }
            },
        },
    };
}
