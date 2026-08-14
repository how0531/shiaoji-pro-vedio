import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getLoaded,
    getPanelDef,
    getWidgetNote,
    hasUpdate,
    initPlugins,
    installPlugin,
    listLoadedWidgets,
    loadInstalled,
    saveInstalled,
    setPluginEnabled,
    sideloadPlugin,
    uninstallPlugin,
    updatableIds,
    updatePlugin,
    type InstalledPlugin,
    type PluginsState,
} from './store';
import { fetchBundle, loadBundle } from './loader';
import {
    PLUGIN_WIDGETS_PER_PLUGIN_MAX,
    type StoreCatalog,
} from './types';

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
    it('版號相同但 sha256 不同 → true（發佈者忘了升版的救命索）', () => {
        expect(
            hasUpdate(FAKE, { ...FAKE.manifest, sha256: 'b'.repeat(64) }),
        ).toBe(true);
    });
    it('版號較舊但 sha256 不同 → true（內容仍需修復）', () => {
        expect(
            hasUpdate(FAKE, {
                ...FAKE.manifest,
                version: '0.9.0',
                sha256: 'c'.repeat(64),
            }),
        ).toBe(true);
    });
});

describe('updatableIds', () => {
    const NEWER_ENTRY: StoreCatalog['plugins'][number] = {
        ...FAKE.manifest,
        version: '1.1.0',
        url: 'https://example.com/statement',
    };

    function stateWith(
        installed: InstalledPlugin[],
        catalog: StoreCatalog | null,
    ): PluginsState {
        return { installed, loaded: {}, catalog };
    }

    it('有更新且啟用中 → 列入', () => {
        const state = stateWith([FAKE], { apiVersion: 1, plugins: [NEWER_ENTRY] });
        expect(updatableIds(state)).toEqual(['statement']);
    });

    it('已停用不算', () => {
        const state = stateWith(
            [{ ...FAKE, enabled: false }],
            { apiVersion: 1, plugins: [NEWER_ENTRY] },
        );
        expect(updatableIds(state)).toEqual([]);
    });

    it('官方下架不算', () => {
        const state = stateWith(
            [FAKE],
            { apiVersion: 1, plugins: [{ ...NEWER_ENTRY, disabled: true }] },
        );
        expect(updatableIds(state)).toEqual([]);
    });

    it('sha256 不同也算（版號相同）', () => {
        const state = stateWith(
            [FAKE],
            {
                apiVersion: 1,
                plugins: [
                    {
                        ...FAKE.manifest,
                        sha256: 'b'.repeat(64),
                        url: 'https://example.com/statement',
                    },
                ],
            },
        );
        expect(updatableIds(state)).toEqual(['statement']);
    });

    it('目錄裡沒有對應項目不算（無比對來源）', () => {
        const state = stateWith([FAKE], { apiVersion: 1, plugins: [] });
        expect(updatableIds(state)).toEqual([]);
    });

    it('catalog 為 null（離線）不算', () => {
        expect(updatableIds(stateWith([FAKE], null))).toEqual([]);
    });

    it('版號與 sha256 都相同 → 不算', () => {
        const state = stateWith(
            [FAKE],
            {
                apiVersion: 1,
                plugins: [{ ...FAKE.manifest, url: 'https://example.com/statement' }],
            },
        );
        expect(updatableIds(state)).toEqual([]);
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

// ---- 狀態列小工具的註冊表（widgetsByPlugin）----

function fakeWidget(key: string) {
    return { key, label: key, Component: () => null };
}

// activate() 回傳指定數量的 widget（面板固定一個，比照預設 mock）
function bundleWithWidgets(count: number) {
    return {
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
            widgets: Array.from({ length: count }, (_, i) =>
                fakeWidget(`w${i}`),
            ),
        }),
    };
}

async function installWithWidgets(count: number) {
    vi.mocked(loadBundle).mockResolvedValueOnce(
        bundleWithWidgets(count) as unknown as Awaited<
            ReturnType<typeof loadBundle>
        >,
    );
    vi.stubGlobal(
        'fetch',
        vi.fn(
            async () =>
                new Response(JSON.stringify(FAKE.manifest), { status: 200 }),
        ),
    );
    await installPlugin(CATALOG_ENTRY);
    vi.unstubAllGlobals();
}

describe('狀態列小工具註冊', () => {
    it('舊 bundle 只回 { panels } 時完全不受影響（widgets 視為空）', async () => {
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
        await installPlugin(CATALOG_ENTRY);
        vi.unstubAllGlobals();

        expect(listLoadedWidgets()).toEqual([]);
        expect(getPanelDef('statement', 'test-panel')).not.toBeNull();
    });

    it('超過每顆外掛的上限時只截斷並記一句原因，面板照常運作', async () => {
        await seedCatalog(CATALOG_NORMAL);
        await installWithWidgets(PLUGIN_WIDGETS_PER_PLUGIN_MAX + 2);

        expect(listLoadedWidgets().length).toBe(PLUGIN_WIDGETS_PER_PLUGIN_MAX);
        expect(getWidgetNote('statement')).toBeTruthy();
        // 截斷不該讓整顆外掛看起來壞掉
        expect(getLoaded('statement')).toBe('ok');
        expect(getPanelDef('statement', 'test-panel')).not.toBeNull();
    });

    it('沒超過上限時不留下截斷說明', async () => {
        await seedCatalog(CATALOG_NORMAL);
        await installWithWidgets(1);

        expect(listLoadedWidgets().length).toBe(1);
        expect(getWidgetNote('statement')).toBeUndefined();
    });

    it('停用外掛時小工具跟著下架（與面板同進同退）', async () => {
        await seedCatalog(CATALOG_NORMAL);
        await installWithWidgets(1);
        expect(listLoadedWidgets().length).toBe(1);

        await setPluginEnabled('statement', false);
        expect(listLoadedWidgets()).toEqual([]);
    });

    it('移除外掛時小工具跟著清掉', async () => {
        await seedCatalog(CATALOG_NORMAL);
        await installWithWidgets(1);
        expect(listLoadedWidgets().length).toBe(1);

        uninstallPlugin('statement');
        expect(listLoadedWidgets()).toEqual([]);
    });

    // 【鎖住 ErrorBoundary 重置的資料來源】WidgetChip 的 React key 帶
    // sha256 才能在外掛升版時重新掛載（否則舊版留下的 state.error 永遠
    // 回不來，見 plugin-widget-bar.tsx）。key 從哪來就要鎖在哪：這裡只驗
    // listLoadedWidgets() 的 sha256 有沒有跟著 updatePlugin 換新，不驗
    // React 有沒有真的重新掛載（那件事已經在真實瀏覽器裡驗證過）。
    it('外掛升版後 listLoadedWidgets 的 sha256 跟著換新', async () => {
        await seedCatalog(CATALOG_NORMAL);
        await installWithWidgets(1);
        const before = listLoadedWidgets();
        expect(before.length).toBe(1);
        const [beforeEntry] = before;
        expect(beforeEntry?.sha256).toBe(FAKE.manifest.sha256);

        const newSha = 'b'.repeat(64);
        vi.mocked(loadBundle).mockResolvedValueOnce(
            bundleWithWidgets(1) as unknown as Awaited<
                ReturnType<typeof loadBundle>
            >,
        );
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({
                            ...FAKE.manifest,
                            version: '1.1.0',
                            sha256: newSha,
                        }),
                        { status: 200 },
                    ),
            ),
        );
        await updatePlugin('statement');
        vi.unstubAllGlobals();

        const after = listLoadedWidgets();
        expect(after.length).toBe(1);
        const [afterEntry] = after;
        expect(afterEntry?.sha256).toBe(newSha);
        expect(afterEntry?.sha256).not.toBe(beforeEntry?.sha256);
    });
});
