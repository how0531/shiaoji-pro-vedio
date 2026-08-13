// src/lib/plugins/host.ts — 外掛的世界入口。全部 async，參數可序列化
// （未來 iframe 沙箱相容）。v1 刻意不含下單 API。

import { apiGet, apiPost } from '../api';
import { accountFor, getAccountState, subscribeAccounts } from '../account-store';
import { trackActivity } from '../activity';
import { resolveContract, fetchWarrants, subscribeQuote } from '../shioaji';
import { ensureStream, onAnyTick } from '../stream';
import { getThemeSettings, getChartColors } from '../theme-store';
import type { Account } from '../types/portfolio';
import type { PluginAccount, PluginHost, ThemeTokens } from './types';
import { HOST_API_VERSION } from './types';

// App 版本：build 時由 vite define 注入（見 vite.config.ts 的
// __APP_VERSION__，讀 package.json）。測試等未注入環境 fallback 開發版號。
// export 給 store.ts 的 checkCompat 共用，避免重複解析邏輯。
declare const __APP_VERSION__: string | undefined;
export const APP_VERSION =
    typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';

// v1 spec 邊界：外掛只能查詢，不可下單。deny-list 擋掉下單／改單／刪單
// 相關 path，get/post 共用同一份檢查；查詢類（/order/trades、
// /order/combotrades）不在名單內，照常放行。
const DENIED_ORDER_PATHS = [
    '/order/place_order',
    '/order/cancel_order',
    '/order/update_price',
    '/order/update_qty',
    '/order/place_comboorder',
    '/order/cancel_comboorder',
];

// 個資邊界：這兩支回傳 person_id（身分證字號）與 username（姓名），外掛
// 查帳只需要 broker_id/account_id，唯一合法管道是 host.accounts（見
// types.ts 的 PluginAccount 投影）。單靠權限宣告只是揭露，擋在這裡才是
// 真邊界；四個外掛目前都沒呼叫這兩支，零破壞。
const DENIED_ACCOUNT_IDENTITY_PATHS = ['/auth/accounts', '/auth/ca_expiretime'];

function assertAllowedPath(path: string): void {
    if (DENIED_ORDER_PATHS.some((denied) => path.includes(denied))) {
        throw new Error('外掛不可使用下單相關 API（v1 限查詢）');
    }
    if (DENIED_ACCOUNT_IDENTITY_PATHS.some((denied) => path.includes(denied))) {
        throw new Error('外掛不可直接查詢帳戶身分資料，請改用 host.accounts');
    }
}

// 投影只留 account_type/broker_id/account_id/signed，絕不帶 person_id
// （身分證字號）與 username（姓名）——見 types.ts PluginAccount 的註解。
function toPluginAccount(a: Account): PluginAccount {
    return {
        account_type: a.account_type as 'S' | 'F',
        broker_id: a.broker_id,
        account_id: a.account_id,
        signed: a.signed,
    };
}

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
            get: async (path) => {
                assertAllowedPath(path);
                return apiGet(path);
            },
            post: async (path, body) => {
                assertAllowedPath(path);
                return apiPost(path, body);
            },
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
            // resolveContract 查無該代碼會 reject，但 PluginHost 的型別與
            // mock host（packages/sdk/mock-host.ts）都是查無回 null，不是
            // reject。這裡補 .catch 把 reject 轉成 null，讓外掛端不用額外
            // try/catch 也能跟 mock host 拿到一致的語意。
            resolve: (code) => resolveContract(code).catch(() => null),
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
        accounts: {
            list: async () => getAccountState().accounts.map(toPluginAccount),
            current: async (type) => {
                // accountFor 回 undefined 代表「讓伺服器挑預設」，投影成
                // null；它已經保證只回 signed 帳戶，這裡不用再過濾一次
                const acc = accountFor(type);
                return acc ? toPluginAccount(acc) : null;
            },
            onChange: (cb) => subscribeAccounts(cb),
        },
    };
}
