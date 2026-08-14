// src/lib/plugins/widget-prefs.test.ts — 狀態列小工具偏好的純函式：
// defaultOn 的種子語意、頂欄名額上限、渲染層的穩定取前 N 個。

import { describe, expect, it } from 'vitest';
import {
    countWidgetsOn,
    isWidgetOn,
    planSeed,
    selectHeaderWidgets,
    widgetPrefKey,
    type WidgetEntry,
    type WidgetPrefs,
} from './widget-prefs';
import {
    PLUGIN_HEADER_WIDGETS_MAX,
    type PluginWidgetDef,
} from './types';

function widget(over: Partial<PluginWidgetDef> = {}): PluginWidgetDef {
    return {
        key: 'w',
        label: '小工具',
        Component: () => null,
        ...over,
    };
}

function entry(pluginId: string, over: Partial<PluginWidgetDef> = {}) {
    return { pluginId, widget: widget(over) } satisfies WidgetEntry;
}

describe('widgetPrefKey', () => {
    it('用 :: 併起來，永遠組不出 __proto__ 這種危險鍵', () => {
        expect(widgetPrefKey('margin-ratio', 'ratio')).toBe(
            'margin-ratio::ratio',
        );
        expect(widgetPrefKey('__proto__', '__proto__')).toContain('::');
    });
});

describe('isWidgetOn', () => {
    it('沒有紀錄一律當關閉（還沒 seed 過就不該先佔頂欄的位子）', () => {
        expect(isWidgetOn({}, 'p', 'w')).toBe(false);
    });

    it('只認 true，其他值都當關閉', () => {
        expect(isWidgetOn({ 'p::w': true }, 'p', 'w')).toBe(true);
        expect(isWidgetOn({ 'p::w': false }, 'p', 'w')).toBe(false);
    });

    it('Object.prototype 上的成員不會被誤判為已開啟', () => {
        expect(isWidgetOn({}, 'toString', 'x')).toBe(false);
    });
});

describe('planSeed', () => {
    it('第一次出現才讀 defaultOn', () => {
        expect(planSeed({}, [entry('a', { defaultOn: true })])).toEqual({
            'a::w': true,
        });
    });

    it('沒寫 defaultOn 的一律 seed 成關閉', () => {
        expect(planSeed({}, [entry('a')])).toEqual({ 'a::w': false });
    });

    it('已經有紀錄就完全不動（外掛升版、重裝、改 defaultOn 都翻不掉使用者的決定）', () => {
        const prefs: WidgetPrefs = { 'a::w': false };
        expect(planSeed(prefs, [entry('a', { defaultOn: true })])).toEqual({});
    });

    it('頂欄名額已滿時，defaultOn 只能 seed 成關閉（不准靠 defaultOn 擠掉別人）', () => {
        const on: WidgetPrefs = {};
        const existing: WidgetEntry[] = [];
        for (let i = 0; i < PLUGIN_HEADER_WIDGETS_MAX; i++) {
            on[`p${i}::w`] = true;
            existing.push(entry(`p${i}`));
        }
        const seeded = planSeed(on, [
            ...existing,
            entry('newcomer', { defaultOn: true }),
        ]);
        expect(seeded).toEqual({ 'newcomer::w': false });
    });

    it('同一批一次 seed 多個時，名額用完之後的也只能是關閉', () => {
        const entries: WidgetEntry[] = [];
        for (let i = 0; i < PLUGIN_HEADER_WIDGETS_MAX + 2; i++) {
            entries.push(entry(`p${i}`, { defaultOn: true }));
        }
        const seeded = planSeed({}, entries);
        const onCount = Object.values(seeded).filter(Boolean).length;
        expect(onCount).toBe(PLUGIN_HEADER_WIDGETS_MAX);
        expect(Object.keys(seeded).length).toBe(PLUGIN_HEADER_WIDGETS_MAX + 2);
    });
});

describe('countWidgetsOn', () => {
    it('只算還註冊在的 widget，已移除外掛留下的殘留紀錄不計入', () => {
        const prefs: WidgetPrefs = { 'a::w': true, 'gone::w': true };
        expect(countWidgetsOn(prefs, [entry('a')])).toBe(1);
    });
});

describe('selectHeaderWidgets', () => {
    it('只端出開著的，順序照傳入順序（安裝順序 × def 順序）', () => {
        const entries = [entry('a'), entry('b'), entry('c')];
        const prefs: WidgetPrefs = { 'a::w': true, 'c::w': true };
        expect(
            selectHeaderWidgets(prefs, entries).map((e) => e.pluginId),
        ).toEqual(['a', 'c']);
    });

    it('localStorage 被手改成超過上限時，渲染層仍只取前 N 個', () => {
        const prefs: WidgetPrefs = {};
        const entries: WidgetEntry[] = [];
        for (let i = 0; i < PLUGIN_HEADER_WIDGETS_MAX + 3; i++) {
            prefs[`p${i}::w`] = true;
            entries.push(entry(`p${i}`));
        }
        expect(selectHeaderWidgets(prefs, entries).length).toBe(
            PLUGIN_HEADER_WIDGETS_MAX,
        );
    });

    it('全部關閉時回空陣列（頂欄完全不渲染這一段）', () => {
        expect(selectHeaderWidgets({}, [entry('a'), entry('b')])).toEqual([]);
    });
});
