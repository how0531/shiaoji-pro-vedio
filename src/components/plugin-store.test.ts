// src/components/plugin-store.test.ts — 商店卡片的純函式：權限來源解析
// （含舊 manifest 向後相容）、風險排序與統計、更新時新增的權限。

import { describe, expect, it } from 'vitest';
import {
    addedPermissions,
    PLUGIN_ICONS,
    resolvePermissions,
    riskCounts,
    sortPermissions,
} from './plugin-store';
import type { InstalledPlugin } from '../lib/plugins/store';
import type { PluginManifest, StoreCatalog } from '../lib/plugins/types';

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
});
