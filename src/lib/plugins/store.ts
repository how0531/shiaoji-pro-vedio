// src/lib/plugins/store.ts — 外掛安裝清單（localStorage）＋runtime 註冊表。
// useSyncExternalStore 模式比照 theme-store.ts：模組級可變狀態 + listeners
// Set，狀態變更時整包置換再通知，讓 React 用 Object.is 判斷是否需要重繪。

import { useSyncExternalStore } from 'react';
import { checkCompat, cmpVersion, parseManifest } from './manifest';
import {
    fetchBundle,
    installSharedGlobals,
    loadBundle,
    sha256Hex,
} from './loader';
import { createHost, APP_VERSION } from './host';
import { rawFetch } from '../api';
import {
    OFFICIAL_STORE_URL,
    type PluginManifest,
    type PluginPanelDef,
    type StoreCatalog,
} from './types';

const LS_KEY = 'sjp.plugins.installed.v1';
const STORE_URL_KEY = 'sjp.plugins.storeUrl';

export interface InstalledPlugin {
    id: string;
    baseUrl: string; // manifest 所在目錄 URL，結尾含 /
    version: string;
    enabled: boolean;
    sideloaded: boolean;
    manifest: PluginManifest;
}

export interface PluginsState {
    installed: InstalledPlugin[];
    // pluginId → 'ok' 或失敗原因（顯示在商店與佔位卡）
    loaded: Record<string, 'ok' | string>;
    catalog: StoreCatalog | null;
}

export function loadInstalled(): InstalledPlugin[] {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

export function saveInstalled(list: InstalledPlugin[]) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`外掛安裝清單寫入失敗（${msg}）`);
    }
}

export function hasUpdate(
    p: InstalledPlugin,
    catalogEntry: PluginManifest,
): boolean {
    return cmpVersion(catalogEntry.version, p.version) > 0;
}

// ---- runtime state（模組級，非持久化）----

let state: PluginsState = {
    installed: loadInstalled(),
    loaded: {},
    catalog: null,
};

const listeners = new Set<() => void>();
// pluginId → 該外掛 activate() 回傳的面板定義；與 state.loaded 是否為 'ok'
// 一起變動（activatePlugin/uninstall/停用時同步更新），元件靠 usePluginsState()
// 的狀態變化觸發重新讀取 listLoadedPanels()。
const panelsByPlugin = new Map<string, PluginPanelDef[]>();

// initPlugins 之前呼叫 install/sideload 屬非預期時序，用 no-op bridge 兜底
// 避免拋錯，onSelectCode 靜默失效
let currentBridge: { onSelectCode(code: string): void } = {
    onSelectCode: () => {},
};

function setState(patch: Partial<PluginsState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
}

export function usePluginsState(): PluginsState {
    return useSyncExternalStore(
        (l) => {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        () => state,
    );
}

// ---- catalog ----

async function fetchCatalog(): Promise<StoreCatalog | null> {
    const url = localStorage.getItem(STORE_URL_KEY) || OFFICIAL_STORE_URL;
    try {
        const res = await rawFetch(url);
        if (!res.ok) return null;
        return (await res.json()) as StoreCatalog;
    } catch {
        return null; // 離線／商店暫時打不開 → 靜默，安裝清單仍可用
    }
}

// ---- 載入 / 啟用單一外掛（initPlugins 逐一載入、setPluginEnabled(on) 重走用）----

async function activatePlugin(p: InstalledPlugin): Promise<void> {
    try {
        const code = await fetchBundle(
            p.baseUrl + p.manifest.entry,
            p.manifest.sha256,
        );
        const mod = await loadBundle(code);
        const host = createHost(p.id, currentBridge);
        const { panels } = mod.activate(host);
        panelsByPlugin.set(p.id, panels);
        setState({ loaded: { ...state.loaded, [p.id]: 'ok' } });
    } catch (e) {
        panelsByPlugin.delete(p.id);
        const msg = e instanceof Error ? e.message : String(e);
        setState({ loaded: { ...state.loaded, [p.id]: msg } });
    }
}

function withTrailingSlash(url: string): string {
    return url.endsWith('/') ? url : `${url}/`;
}

// saveInstalled 失敗（配額/被封鎖）時，把 panelsByPlugin 剛做的變更復原成
// 呼叫前的樣子，避免「安裝清單沒寫入、但面板已經活著」的兩邊脫節
function restorePanels(id: string, prev: PluginPanelDef[] | undefined) {
    if (prev) panelsByPlugin.set(id, prev);
    else panelsByPlugin.delete(id);
}

// ---- 開機：載入所有已安裝且啟用的外掛 ----

export async function initPlugins(bridge: {
    onSelectCode(code: string): void;
}): Promise<void> {
    currentBridge = bridge;
    await installSharedGlobals();
    const catalog = await fetchCatalog();
    const stored = loadInstalled();

    // 官方商店標記 disabled 的外掛，強制關閉並記錄原因，不進入載入流程
    const forcedLoaded: Record<string, string> = {};
    const nextInstalled = stored.map((p) => {
        const catalogEntry = catalog?.plugins.find((e) => e.id === p.id);
        if (p.enabled && catalogEntry?.disabled) {
            forcedLoaded[p.id] = '官方已停用：此外掛暫不可用';
            return { ...p, enabled: false };
        }
        return p;
    });
    if (Object.keys(forcedLoaded).length > 0) saveInstalled(nextInstalled);

    setState({
        catalog,
        installed: nextInstalled,
        loaded: { ...state.loaded, ...forcedLoaded },
    });

    for (const p of nextInstalled) {
        if (!p.enabled) continue;
        await activatePlugin(p);
    }
}

// ---- 從商店安裝 ----

export async function installPlugin(
    entry: StoreCatalog['plugins'][number],
): Promise<void> {
    const reason = checkCompat(entry, APP_VERSION);
    if (reason) throw new Error(reason);

    const baseUrl = withTrailingSlash(entry.url);
    const res = await rawFetch(`${baseUrl}manifest.json`);
    if (!res.ok) throw new Error(`外掛清單下載失敗（${res.status}）`);
    const manifest = parseManifest(await res.json());

    // entry 是 catalog 快照，可能過期——真正要載入、要信任的是剛抓回的
    // manifest.json，一律以它再驗一次相容性，快照通過不代表這裡也通過
    const manifestReason = checkCompat(manifest, APP_VERSION);
    if (manifestReason) throw new Error(manifestReason);

    const code = await fetchBundle(baseUrl + manifest.entry, manifest.sha256);
    const mod = await loadBundle(code);
    const host = createHost(manifest.id, currentBridge);
    const { panels } = mod.activate(host);

    const prevPanels = panelsByPlugin.get(manifest.id);
    panelsByPlugin.set(manifest.id, panels);

    const record: InstalledPlugin = {
        id: manifest.id,
        baseUrl,
        version: manifest.version,
        enabled: true,
        sideloaded: false,
        manifest,
    };
    const nextInstalled = [
        ...state.installed.filter((p) => p.id !== manifest.id),
        record,
    ];
    try {
        saveInstalled(nextInstalled);
    } catch (e) {
        restorePanels(manifest.id, prevPanels);
        throw e;
    }
    setState({
        installed: nextInstalled,
        loaded: { ...state.loaded, [manifest.id]: 'ok' },
    });
}

// ---- 更新既有外掛（重抓同一 baseUrl 的 manifest.json）----

export async function updatePlugin(id: string): Promise<void> {
    const current = state.installed.find((p) => p.id === id);
    if (!current) throw new Error(`外掛 ${id} 尚未安裝`);

    const res = await rawFetch(`${current.baseUrl}manifest.json`);
    if (!res.ok) throw new Error(`外掛清單下載失敗（${res.status}）`);
    const manifest = parseManifest(await res.json());
    const reason = checkCompat(manifest, APP_VERSION);
    if (reason) throw new Error(reason);

    const code = await fetchBundle(
        current.baseUrl + manifest.entry,
        manifest.sha256,
    );
    const mod = await loadBundle(code);
    const host = createHost(id, currentBridge);
    const { panels } = mod.activate(host); // panels 換新，remount 由 React 樹處理

    const prevPanels = panelsByPlugin.get(id);
    panelsByPlugin.set(id, panels);

    const nextInstalled = state.installed.map((p) =>
        p.id === id ? { ...p, version: manifest.version, manifest } : p,
    );
    try {
        saveInstalled(nextInstalled);
    } catch (e) {
        restorePanels(id, prevPanels);
        throw e;
    }
    setState({
        installed: nextInstalled,
        loaded: { ...state.loaded, [id]: 'ok' },
    });
}

// ---- 停用 / 重新啟用 ----

export async function setPluginEnabled(
    id: string,
    on: boolean,
): Promise<void> {
    const current = state.installed.find((p) => p.id === id);
    if (!current) throw new Error(`外掛 ${id} 尚未安裝`);

    const nextInstalled = state.installed.map((p) =>
        p.id === id ? { ...p, enabled: on } : p,
    );
    // 這裡先 saveInstalled 再動 panelsByPlugin（下面的 delete / activatePlugin）
    // ——順序本身就是防呆：saveInstalled 失敗會直接 throw 中止，panelsByPlugin
    // 還沒被動過，不需要額外 rollback
    saveInstalled(nextInstalled);
    setState({ installed: nextInstalled });

    if (!on) {
        panelsByPlugin.delete(id);
        listeners.forEach((l) => l()); // panels Map 變動，通知重新讀取
        return;
    }
    await activatePlugin({ ...current, enabled: true });
}

// ---- 移除 ----

export function uninstallPlugin(id: string): void {
    panelsByPlugin.delete(id);
    const nextInstalled = state.installed.filter((p) => p.id !== id);
    saveInstalled(nextInstalled);
    const nextLoaded = { ...state.loaded };
    delete nextLoaded[id];
    setState({ installed: nextInstalled, loaded: nextLoaded });
}

// ---- side-load（本機開發用，manifest 自帶的 sha256 不受信任，現算現記）----

export async function sideloadPlugin(baseUrlInput: string): Promise<void> {
    const baseUrl = withTrailingSlash(baseUrlInput);
    const manifestRes = await rawFetch(`${baseUrl}manifest.json`);
    if (!manifestRes.ok) {
        throw new Error(`side-load manifest 下載失敗（${manifestRes.status}）`);
    }
    const manifest = parseManifest(await manifestRes.json());

    const bundleRes = await rawFetch(baseUrl + manifest.entry);
    if (!bundleRes.ok) {
        throw new Error(`side-load 外掛下載失敗（${bundleRes.status}）`);
    }
    const code = await bundleRes.text();
    const actualSha = await sha256Hex(code);
    const finalManifest: PluginManifest = { ...manifest, sha256: actualSha };

    const mod = await loadBundle(code);
    const host = createHost(manifest.id, currentBridge);
    const { panels } = mod.activate(host);

    const prevPanels = panelsByPlugin.get(manifest.id);
    panelsByPlugin.set(manifest.id, panels);

    const record: InstalledPlugin = {
        id: manifest.id,
        baseUrl,
        version: manifest.version,
        enabled: true,
        sideloaded: true,
        manifest: finalManifest,
    };
    const nextInstalled = [
        ...state.installed.filter((p) => p.id !== manifest.id),
        record,
    ];
    try {
        saveInstalled(nextInstalled);
    } catch (e) {
        restorePanels(manifest.id, prevPanels);
        throw e;
    }
    setState({
        installed: nextInstalled,
        loaded: { ...state.loaded, [manifest.id]: 'ok' },
    });
}

// ---- 面板查詢 ----

export function getPanelDef(
    pluginId: string,
    panelKey: string,
): PluginPanelDef | null {
    return panelsByPlugin.get(pluginId)?.find((p) => p.key === panelKey) ?? null;
}

export function listLoadedPanels(): {
    pluginId: string;
    panel: PluginPanelDef;
}[] {
    const out: { pluginId: string; panel: PluginPanelDef }[] = [];
    for (const [pluginId, panels] of panelsByPlugin) {
        for (const panel of panels) out.push({ pluginId, panel });
    }
    return out;
}

export function getCatalog(): StoreCatalog | null {
    return state.catalog;
}
