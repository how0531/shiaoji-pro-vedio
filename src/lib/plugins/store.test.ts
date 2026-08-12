import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getPanelDef,
    hasUpdate,
    installPlugin,
    loadInstalled,
    saveInstalled,
    type InstalledPlugin,
} from './store';
import { fetchBundle, loadBundle } from './loader';
import type { StoreCatalog } from './types';

vi.mock('./loader', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./loader')>();
    return {
        ...actual,
        fetchBundle: vi.fn(async () => '/* fake bundle */'),
        loadBundle: vi.fn(async () => ({
            activate: () => ({
                panels: [
                    {
                        key: 'test-panel',
                        label: '測試面板',
                        pinnable: false,
                        singleton: true,
                        defaultSize: { w: 1, h: 1, minW: 1, minH: 1 },
                        Component: () => null,
                    },
                ],
            }),
        })),
    };
});

const FAKE: InstalledPlugin = {
    id: 'statement',
    baseUrl: 'https://example.com/statement/',
    version: '1.0.0',
    enabled: true,
    sideloaded: false,
    manifest: {
        id: 'statement',
        name: '證券對帳單',
        version: '1.0.0',
        apiVersion: 1,
        minAppVersion: '0.0.0',
        entry: 'index.js',
        sha256: 'a'.repeat(64),
        description: 'x',
    },
};

// installPlugin 測試共用的 catalog entry（相容快照：apiVersion 1）
const CATALOG_ENTRY: StoreCatalog['plugins'][number] = {
    ...FAKE.manifest,
    url: 'https://example.com/statement',
};

beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchBundle).mockClear();
    vi.mocked(loadBundle).mockClear();
});

describe('installed list persistence', () => {
    it('round-trip', () => {
        saveInstalled([FAKE]);
        expect(loadInstalled()).toEqual([FAKE]);
    });
    it('壞資料回空陣列', () => {
        localStorage.setItem('sjp.plugins.installed.v1', '{not json');
        expect(loadInstalled()).toEqual([]);
    });
});

describe('hasUpdate', () => {
    it('目錄版本較新 → true', () => {
        expect(hasUpdate(FAKE, { ...FAKE.manifest, version: '1.1.0' })).toBe(
            true,
        );
    });
    it('相同或較舊 → false', () => {
        expect(hasUpdate(FAKE, FAKE.manifest)).toBe(false);
    });
});

describe('installPlugin：相容性以實抓 manifest.json 為準', () => {
    it('catalog 快照相容，但實際 manifest apiVersion 過新 → reject 且不下載 bundle', async () => {
        // catalog 過期常見情境：entry（快照）還是 apiVersion 1，但外掛作者
        // 已經把實際 manifest.json 升到不相容的 apiVersion，商店還沒同步
        const staleManifest = { ...FAKE.manifest, apiVersion: 999 };
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(JSON.stringify(staleManifest), {
                        status: 200,
                    }),
            ),
        );

        await expect(installPlugin(CATALOG_ENTRY)).rejects.toThrow(/App/);
        expect(fetchBundle).not.toHaveBeenCalled();

        vi.unstubAllGlobals();
    });
});

describe('installPlugin：saveInstalled 失敗要 rollback panelsByPlugin', () => {
    it('localStorage.setItem 丟例外 → installPlugin reject 且面板已回滾', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(JSON.stringify(FAKE.manifest), {
                        status: 200,
                    }),
            ),
        );
        const setItemSpy = vi
            .spyOn(Storage.prototype, 'setItem')
            .mockImplementation(() => {
                throw new Error('QuotaExceededError');
            });

        await expect(installPlugin(CATALOG_ENTRY)).rejects.toThrow(
            /安裝清單寫入失敗/,
        );
        // panelsByPlugin 在 saveInstalled 失敗後應該被復原（本來就沒有這個
        // 外掛），面板查不到，不會有「裝失敗但面板還活著」的脫節
        expect(getPanelDef('statement', 'test-panel')).toBeNull();

        setItemSpy.mockRestore();
        vi.unstubAllGlobals();
    });
});
