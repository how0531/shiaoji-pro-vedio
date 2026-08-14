// src/lib/plugins/widget-prefs.ts — 狀態列小工具的使用者偏好（哪幾個要顯示）。
// useSyncExternalStore 模式比照 header-items.ts：模組級可變狀態 + listeners
// Set，狀態變更時整包置換再通知。
//
// 【defaultOn 是種子不是開關】host 只在「這個 key 第一次出現」時讀一次
// widget.defaultOn 並寫進偏好（見 seedWidgetPrefs），之後外掛升版、重裝、
// 改 defaultOn 都不會翻掉使用者的決定。這條是契約寫死的語意，別改成每次
// activate 都套用，否則使用者關掉的東西會自己回來。

import { useSyncExternalStore } from 'react';
import { PLUGIN_HEADER_WIDGETS_MAX, type PluginWidgetDef } from './types';

const KEY = 'sjp.plugins.widgets.v1';

// key 形如 `${pluginId}::${widgetKey}`，value 是使用者的開關決定。
export type WidgetPrefs = Record<string, boolean>;

export interface WidgetEntry {
    pluginId: string;
    widget: PluginWidgetDef;
    // 已安裝 bundle 的 sha256。頂欄 chip 的 React key 要帶上它才能在外掛
    // 升版時重新掛載（見 plugin-widget-bar.tsx 的 WidgetChip key），
    // 這裡不用它做偏好比對，只是讓它跟著 entry 一起流過去。
    sha256: string;
}

// 分隔符用 ::，pluginId 由 manifest 驗過（不含冒號），widget.key 由外掛
// 自訂但併起來一定含 ::，所以永遠組不出 '__proto__' 這種危險鍵。
export function widgetPrefKey(pluginId: string, widgetKey: string): string {
    return `${pluginId}::${widgetKey}`;
}

// 沒有紀錄一律當關閉：偏好裡查不到就是還沒被 seed 過（或已被清掉），
// 這時候寧可少顯示一格，也不要在使用者沒同意前先佔頂欄的位子。
export function isWidgetOn(
    prefs: WidgetPrefs,
    pluginId: string,
    widgetKey: string,
): boolean {
    const k = widgetPrefKey(pluginId, widgetKey);
    return Object.hasOwn(prefs, k) ? prefs[k] === true : false;
}

function load(): WidgetPrefs {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }
        const out: WidgetPrefs = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'boolean') out[k] = v;
        }
        return out;
    } catch {
        return {};
    }
}

let state: WidgetPrefs = load();

const listeners = new Set<() => void>();

function commit(next: WidgetPrefs) {
    state = next;
    try {
        localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
        // 寫不進去就只在這一次工作階段生效，不擋使用者操作
    }
    listeners.forEach((l) => l());
}

export function getWidgetPrefs(): WidgetPrefs {
    return state;
}

export function setWidgetOn(pluginId: string, widgetKey: string, on: boolean) {
    const k = widgetPrefKey(pluginId, widgetKey);
    if (state[k] === on) return;
    commit({ ...state, [k]: on });
}

export function useWidgetPrefs(): WidgetPrefs {
    return useSyncExternalStore(
        (l) => {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        getWidgetPrefs,
    );
}

// 純函式，方便單獨測試：回傳「這一批 entries 之中，還沒被 seed 過的要寫成
// 什麼值」。已經有紀錄的一律不動（使用者說了算）；defaultOn 為 true 但頂欄
// 名額已滿時只能 seed 成 false，否則外掛可以靠 defaultOn 把別人擠掉。
export function planSeed(
    prefs: WidgetPrefs,
    entries: readonly WidgetEntry[],
): WidgetPrefs {
    const seeded: WidgetPrefs = {};
    let onCount = entries.reduce(
        (n, e) => n + (isWidgetOn(prefs, e.pluginId, e.widget.key) ? 1 : 0),
        0,
    );
    for (const e of entries) {
        const k = widgetPrefKey(e.pluginId, e.widget.key);
        if (Object.hasOwn(prefs, k) || Object.hasOwn(seeded, k)) continue;
        const on =
            e.widget.defaultOn === true && onCount < PLUGIN_HEADER_WIDGETS_MAX;
        seeded[k] = on;
        if (on) onCount += 1;
    }
    return seeded;
}

export function seedWidgetPrefs(entries: readonly WidgetEntry[]) {
    const seeded = planSeed(state, entries);
    if (Object.keys(seeded).length === 0) return;
    commit({ ...state, ...seeded });
}

// 目前開著幾個（只算還註冊在的 widget，不算已移除外掛留下的殘留紀錄）。
export function countWidgetsOn(
    prefs: WidgetPrefs,
    entries: readonly WidgetEntry[],
): number {
    return entries.reduce(
        (n, e) => n + (isWidgetOn(prefs, e.pluginId, e.widget.key) ? 1 : 0),
        0,
    );
}

// 渲染層的保險：即使 localStorage 被手改成 4 個 true，也只端出前 3 個。
// entries 已由 listLoadedWidgets() 依「安裝順序 × def 順序」排好，所以這裡
// 的前 3 個是穩定的，不會因為 Map 迭代順序變動造成 chip 閃爍換位。
export function selectHeaderWidgets(
    prefs: WidgetPrefs,
    entries: readonly WidgetEntry[],
): WidgetEntry[] {
    return entries
        .filter((e) => isWidgetOn(prefs, e.pluginId, e.widget.key))
        .slice(0, PLUGIN_HEADER_WIDGETS_MAX);
}
