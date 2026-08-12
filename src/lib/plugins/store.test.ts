import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getLoaded,
    getPanelDef,
    hasUpdate,
    initPlugins,
    installPlugin,
    loadInstalled,
    saveInstalled,
    setPluginEnabled,
    sideloadPlugin,
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

describe('setPluginEnabled：停用要同步更新 loaded[id]', () => {
    it('停用後 loaded[id] 是「已停用」（PluginBlock/商店都靠這個文案顯示）', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(JSON.stringify(FAKE.manifest), {
                        status: 200,
                    }),
            ),
        );

        await installPlugin(CATALOG_ENTRY);
        expect(getLoaded('statement')).toBe('ok');

        await setPluginEnabled('statement', false);
        expect(getLoaded('statement')).toBe('已停用');

        vi.unstubAllGlobals();
    });
});

// catalog 內 disabled:true 的外掛快照，安裝與重新啟用都要被擋下
const CATALOG_DISABLED: StoreCatalog = {
    apiVersion: 1,
    plugins: [{ ...FAKE.manifest, url: 'https://example.com/statement', disabled: true }],
};

// catalog 已收錄一顆正常上架（未 disabled）的 'statement'，供 side-load
// 冒名撞 id 測試使用
const CATALOG_NORMAL: StoreCatalog = {
    apiVersion: 1,
    plugins: [CATALOG_ENTRY],
};

// 用 initPlugins 把 state.catalog 灌成指定內容（installPlugin/setPluginEnabled
// 讀的是 state.catalog，不是呼叫端傳入的 entry 快照，要走真正的載入流程才會
// 生效）；呼叫完就把 fetch 解除 stub，避免污染後續呼叫
async function seedCatalog(catalog: StoreCatalog) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify(catalog), { status: 200 })),
    );
    await initPlugins({ onSelectCode: () => {} });
    vi.unstubAllGlobals();
}

describe('官方下架（catalog disabled:true）強制擋下安裝與重新啟用', () => {
    it('installPlugin：catalog 標記 disabled → 直接 throw，不下載 manifest', async () => {
        await seedCatalog(CATALOG_DISABLED);

        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        await expect(installPlugin(CATALOG_ENTRY)).rejects.toThrow(
            '此外掛已被官方停用',
        );
        expect(fetchSpy).not.toHaveBeenCalled();

        vi.unstubAllGlobals();
    });

    it('setPluginEnabled(id, true)：catalog 標記 disabled → throw，不重新載入外掛', async () => {
        saveInstalled([{ ...FAKE, enabled: false }]);
        await seedCatalog(CATALOG_DISABLED);

        await expect(setPluginEnabled('statement', true)).rejects.toThrow(
            '此外掛已被官方停用',
        );
    });
});

describe('sideloadPlugin：相容性檢查與防冒名', () => {
    it('manifest 不相容（apiVersion 過新）→ throw，不繼續抓 bundle', async () => {
        const incompatibleManifest = { ...FAKE.manifest, apiVersion: 999 };
        const fetchMock = vi.fn(
            async () =>
                new Response(JSON.stringify(incompatibleManifest), {
                    status: 200,
                }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            sideloadPlugin('https://example.com/statement'),
        ).rejects.toThrow(/App/);
        // 只抓了 manifest.json 那一次，相容性沒過就不該再去抓 bundle
        expect(fetchMock).toHaveBeenCalledTimes(1);

        vi.unstubAllGlobals();
    });

    it('id 與官方商店重複 → throw，禁止 side-load 冒名', async () => {
        // catalog 已收錄一顆同 id（statement）的官方外掛
        await seedCatalog(CATALOG_NORMAL);

        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(JSON.stringify(FAKE.manifest), {
                        status: 200,
                    }),
            ),
        );

        await expect(
            sideloadPlugin('https://example.com/statement'),
        ).rejects.toThrow('外掛 id 與官方商店重複，禁止 side-load 冒名');

        vi.unstubAllGlobals();
    });
});
