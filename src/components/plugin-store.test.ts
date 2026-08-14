// src/components/plugin-store.test.ts — 商店卡片的純函式：權限來源解析
// （含舊 manifest 向後相容）、風險排序與統計、更新時新增的權限。

import { describe, expect, it } from 'vitest';
import {
    addedPermissions,
    countByCategory,
    filterPlugins,
    lookupIcon,
    permissionNoteText,
    planPlacement,
    type PluginListItem,
    PLUGIN_ICONS,
    resolvePermissionNotes,
    resolvePermissions,
    riskCounts,
    sortPermissions,
} from './plugin-store';
import type { InstalledPlugin } from '../lib/plugins/store';
import {
    PLUGIN_PERMISSION_NOTE_MAX,
    type PluginManifest,
    type PluginPermissionId,
    type StoreCatalog,
} from '../lib/plugins/types';

type CatalogEntry = StoreCatalog['plugins'][number];

const SHA = '0'.repeat(64);

function manifest(over: Partial<PluginManifest> = {}): PluginManifest {
    return {
        id: 'demo',
        name: '示範外掛',
        version: '1.0.0',
        apiVersion: 1,
        minAppVersion: '0.0.0',
        entry: 'index.js',
        sha256: SHA,
        description: '示範',
        ...over,
    };
}

function entryOf(over: Partial<CatalogEntry> = {}): CatalogEntry {
    return { ...manifest(), url: 'https://example.test/demo/', ...over };
}

function installedOf(over: Partial<InstalledPlugin> = {}): InstalledPlugin {
    return {
        id: 'demo',
        baseUrl: 'https://example.test/demo/',
        version: '1.0.0',
        enabled: true,
        sideloaded: false,
        manifest: manifest(),
        ...over,
    };
}

describe('resolvePermissions', () => {
    it('未安裝時讀 catalog entry，權限在安裝前就看得到', () => {
        const entry = entryOf({ permissions: ['portfolio-read'] });
        expect(resolvePermissions(entry, undefined)).toEqual([
            'portfolio-read',
        ]);
    });

    it('舊 manifest 沒宣告 permissions 時回 undefined（不是空陣列）', () => {
        expect(resolvePermissions(entryOf(), undefined)).toBeUndefined();
        expect(resolvePermissions(undefined, installedOf())).toBeUndefined();
    });

    it('宣告空陣列代表明確的零權限，與未宣告可分辨', () => {
        expect(resolvePermissions(entryOf({ permissions: [] }), undefined))
            .toEqual([]);
    });

    it('已安裝時以本機 manifest 為準（正在跑的是它，不是商店的新版）', () => {
        const entry = entryOf({
            version: '2.0.0',
            permissions: ['account-identity'],
        });
        const installed = installedOf({
            manifest: manifest({ permissions: ['market-data'] }),
        });
        expect(resolvePermissions(entry, installed)).toEqual(['market-data']);
    });

    it('沒有 catalog entry 的 side-load 外掛照樣讀得到本機宣告', () => {
        const installed = installedOf({
            sideloaded: true,
            manifest: manifest({ permissions: ['notifications'] }),
        });
        expect(resolvePermissions(undefined, installed)).toEqual([
            'notifications',
        ]);
    });
});

describe('sortPermissions', () => {
    it('依 high → medium → low 重排，不管 manifest 宣告順序', () => {
        expect(
            sortPermissions([
                'local-settings',
                'realtime-quote',
                'account-identity',
            ]),
        ).toEqual(['account-identity', 'realtime-quote', 'local-settings']);
    });

    it('空陣列仍是空陣列', () => {
        expect(sortPermissions([])).toEqual([]);
    });
});

describe('riskCounts', () => {
    it('依風險分級統計', () => {
        expect(
            riskCounts([
                'account-identity',
                'portfolio-read',
                'realtime-quote',
                'market-data',
            ]),
        ).toEqual({ high: 2, medium: 1, low: 1 });
    });

    it('沒有權限時三級都是 0', () => {
        expect(riskCounts([])).toEqual({ high: 0, medium: 0, low: 0 });
    });

    it('未知權限 id（如 catalog 拼錯）不 throw 也不計入統計', () => {
        const ids = [
            'account-identity',
            'not-a-real-permission',
        ] as unknown as PluginPermissionId[];
        expect(() => riskCounts(ids)).not.toThrow();
        expect(riskCounts(ids)).toEqual({ high: 1, medium: 0, low: 0 });
    });
});

describe('addedPermissions', () => {
    it('列出更新後才多要的權限，已有的不重複列', () => {
        const entry = entryOf({
            version: '2.0.0',
            permissions: ['market-data', 'account-identity'],
        });
        const installed = installedOf({
            manifest: manifest({ permissions: ['market-data'] }),
        });
        expect(addedPermissions(entry, installed)).toEqual([
            'account-identity',
        ]);
    });

    it('新版沒宣告權限時不謊報成「新增」', () => {
        const installed = installedOf({
            manifest: manifest({ permissions: ['market-data'] }),
        });
        expect(addedPermissions(entryOf(), installed)).toEqual([]);
    });

    it('舊版未宣告、新版有宣告時，整批視為新增', () => {
        const entry = entryOf({
            permissions: ['portfolio-read', 'notifications'],
        });
        expect(addedPermissions(entry, installedOf())).toEqual([
            'portfolio-read',
            'notifications',
        ]);
    });
});

describe('PLUGIN_ICONS', () => {
    // manifest.ts 的 ICON_NAME_RE：allowlist 的鍵一定要是 manifest 收得下
    // 的形狀，否則外掛宣告了也永遠命中不了
    it('每個鍵都符合 manifest 允許的 lucide 名稱形狀', () => {
        const nameRe = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
        for (const key of Object.keys(PLUGIN_ICONS)) {
            expect(nameRe.test(key), key).toBe(true);
        }
    });

    it('每個值都是可渲染的元件', () => {
        for (const [key, Icon] of Object.entries(PLUGIN_ICONS)) {
            expect(Icon, key).toBeTruthy();
        }
    });

    // 四份官方 manifest（statement/margin-ratio/credit-expiry/warrant-finder）
    // 目前宣告的 icon，逐一鎖住命中 allowlist，避免新外掛加了 icon 欄位
    // 卻忘記把 lucide 元件補進 PLUGIN_ICONS，靜默退化成文字 monogram。
    it('四個官方外掛宣告的 icon 都命中 allowlist', () => {
        const officialIcons = ['Receipt', 'Ticket', 'Gauge', 'CalendarClock'];
        for (const name of officialIcons) {
            expect(PLUGIN_ICONS[name], name).toBeTruthy();
        }
    });
});

function listItem(over: Partial<PluginListItem> = {}): PluginListItem {
    return {
        id: 'demo',
        name: '示範外掛',
        description: '示範用途',
        category: 'tools',
        ...over,
    };
}

describe('filterPlugins', () => {
    it('query 為空、category 為 all 時原樣回傳（順序不變）', () => {
        const items = [
            listItem({ id: 'a' }),
            listItem({ id: 'b' }),
            listItem({ id: 'c' }),
        ];
        expect(filterPlugins(items, { query: '', category: 'all' })).toEqual(
            items,
        );
    });

    it('比對 name（大小寫不敏感）', () => {
        const items = [
            listItem({ id: 'a', name: 'Warrant Finder' }),
            listItem({ id: 'b', name: '融資券到期明細' }),
        ];
        expect(
            filterPlugins(items, { query: 'warrant', category: 'all' }),
        ).toEqual([items[0]]);
    });

    it('比對 description', () => {
        const items = [
            listItem({ id: 'a', description: '查詢整戶維持率' }),
            listItem({ id: 'b', description: '權證搜尋工具' }),
        ];
        expect(
            filterPlugins(items, { query: '維持率', category: 'all' }),
        ).toEqual([items[0]]);
    });

    it('比對 id', () => {
        const items = [
            listItem({ id: 'margin-ratio', name: '整戶維持率' }),
            listItem({ id: 'warrant-finder', name: '個股對應權證' }),
        ];
        expect(
            filterPlugins(items, { query: 'margin', category: 'all' }),
        ).toEqual([items[0]]);
    });

    it('query 前後空白與大小寫都不影響比對', () => {
        const items = [listItem({ id: 'a', name: 'Warrant Finder' })];
        expect(
            filterPlugins(items, { query: '  WARRANT  ', category: 'all' }),
        ).toEqual(items);
    });

    it('category 篩選（非 all 時忽略 query 為空的情況仍套用分類）', () => {
        const items = [
            listItem({ id: 'a', category: 'account' }),
            listItem({ id: 'b', category: 'derivatives' }),
        ];
        expect(
            filterPlugins(items, { query: '', category: 'account' }),
        ).toEqual([items[0]]);
    });

    it('分類與關鍵字可疊加', () => {
        const items = [
            listItem({ id: 'a', category: 'account', name: '對帳單' }),
            listItem({ id: 'b', category: 'account', name: '維持率' }),
            listItem({ id: 'c', category: 'derivatives', name: '對帳單副本' }),
        ];
        expect(
            filterPlugins(items, { query: '對帳單', category: 'account' }),
        ).toEqual([items[0]]);
    });

    it('找不到符合條件時回傳空陣列', () => {
        const items = [listItem({ id: 'a' })];
        expect(
            filterPlugins(items, { query: '找不到的字串', category: 'all' }),
        ).toEqual([]);
    });
});

describe('countByCategory', () => {
    it('固定回傳五個分類 key，各自統計數量', () => {
        const items = [
            listItem({ category: 'account' }),
            listItem({ category: 'account' }),
            listItem({ category: 'derivatives' }),
        ];
        expect(countByCategory(items)).toEqual({
            market: 0,
            trading: 0,
            account: 2,
            derivatives: 1,
            tools: 0,
        });
    });

    it('空陣列時每個分類都是 0（不是缺 key）', () => {
        expect(countByCategory([])).toEqual({
            market: 0,
            trading: 0,
            account: 0,
            derivatives: 0,
            tools: 0,
        });
    });
});

describe('resolvePermissionNotes', () => {
    it('未安裝時讀 catalog entry（安裝前就看得到為什麼要這些權限）', () => {
        const entry = entryOf({
            permissions: ['portfolio-read'],
            permissionNotes: { 'portfolio-read': '只用來算整戶維持率' },
        });
        expect(resolvePermissionNotes(entry, undefined)).toEqual({
            'portfolio-read': '只用來算整戶維持率',
        });
    });

    it('已安裝時以本機 manifest 為準（正在跑的是它）', () => {
        const entry = entryOf({
            permissionNotes: { 'portfolio-read': '商店新版的說法' },
        });
        const installed = installedOf({
            manifest: manifest({
                permissionNotes: { 'portfolio-read': '本機這一版的說法' },
            }),
        });
        expect(resolvePermissionNotes(entry, installed)).toEqual({
            'portfolio-read': '本機這一版的說法',
        });
    });

    it('舊 manifest 沒這一欄時回 undefined', () => {
        expect(resolvePermissionNotes(entryOf(), undefined)).toBeUndefined();
        expect(
            resolvePermissionNotes(undefined, installedOf()),
        ).toBeUndefined();
    });
});

describe('permissionNoteText', () => {
    it('有寫就回傳那一句', () => {
        expect(
            permissionNoteText(
                { 'portfolio-read': '只用來讀融資融券庫存算維持率' },
                'portfolio-read',
            ),
        ).toBe('只用來讀融資融券庫存算維持率');
    });

    it('沒有 notes、沒寫這一項、空字串、空白字串都回 null（呼叫端退回通用描述）', () => {
        expect(permissionNoteText(undefined, 'portfolio-read')).toBeNull();
        expect(permissionNoteText({}, 'portfolio-read')).toBeNull();
        expect(
            permissionNoteText({ 'portfolio-read': '' }, 'portfolio-read'),
        ).toBeNull();
        expect(
            permissionNoteText({ 'portfolio-read': '   ' }, 'portfolio-read'),
        ).toBeNull();
    });

    it('目錄資料型別不對時不 throw 也不顯示（catalog 未逐筆驗證）', () => {
        const notes = { 'portfolio-read': 42 } as unknown as Partial<
            Record<PluginPermissionId, string>
        >;
        expect(permissionNoteText(notes, 'portfolio-read')).toBeNull();
    });

    it('Object.prototype 上的成員不會被誤當成 note', () => {
        expect(permissionNoteText({}, 'toString' as PluginPermissionId))
            .toBeNull();
        expect(
            permissionNoteText({}, 'constructor' as PluginPermissionId),
        ).toBeNull();
    });

    it('清掉換行與 U+202E 這類控制/格式字元（擋破版與視覺偽造）', () => {
        expect(
            permissionNoteText(
                { 'portfolio-read': '第一行\n第二行' },
                'portfolio-read',
            ),
        ).toBe('第一行第二行');
        expect(
            permissionNoteText(
                { 'portfolio-read': '‮讀庫存' },
                'portfolio-read',
            ),
        ).toBe('讀庫存');
    });

    it('超過上限的未驗證目錄資料以 code point 為單位截斷', () => {
        const long = '權'.repeat(PLUGIN_PERMISSION_NOTE_MAX + 20);
        const out = permissionNoteText(
            { 'portfolio-read': long },
            'portfolio-read',
        );
        expect(out).not.toBeNull();
        expect(Array.from(out!).length).toBe(PLUGIN_PERMISSION_NOTE_MAX);
    });

    it('emoji 等星芒平面字元算一個 code point，不會被切成半個', () => {
        const long = '📈'.repeat(PLUGIN_PERMISSION_NOTE_MAX + 5);
        const out = permissionNoteText(
            { 'portfolio-read': long },
            'portfolio-read',
        );
        expect(Array.from(out!).length).toBe(PLUGIN_PERMISSION_NOTE_MAX);
    });
});

describe('planPlacement', () => {
    it('剛好一個面板時自動置入那一個', () => {
        expect(planPlacement([{ key: 'main' }])).toEqual({
            kind: 'place',
            panelKey: 'main',
        });
    });

    it('多個面板時不猜，讓使用者在卡片上選', () => {
        expect(planPlacement([{ key: 'a' }, { key: 'b' }])).toEqual({
            kind: 'choose',
        });
    });

    it('零面板（只提供背景能力）時完全不動版面', () => {
        expect(planPlacement([])).toEqual({ kind: 'none' });
    });
});

describe('lookupIcon', () => {
    it('命中 allowlist 時回傳對應的 lucide 元件', () => {
        expect(lookupIcon('Receipt')).toBe(PLUGIN_ICONS.Receipt);
    });

    it('未命中的一般字串回傳 undefined', () => {
        expect(lookupIcon('NotARealIcon')).toBeUndefined();
    });

    it('Object.prototype 上的鍵（如 toString）不會被誤判為命中', () => {
        expect(lookupIcon('toString')).toBeUndefined();
        expect(lookupIcon('constructor')).toBeUndefined();
        expect(lookupIcon('hasOwnProperty')).toBeUndefined();
    });
});
