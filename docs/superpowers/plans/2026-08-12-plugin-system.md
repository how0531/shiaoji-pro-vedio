# 外掛系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shioaji Pro 外掛系統：runtime 遠端載入的面板外掛＋App 內商店，及首批四個查詢型外掛（獨立 monorepo）。

**Architecture:** 外掛是 IIFE bundle（externalize react → `window.SJP_React` 等共享全域），App 抓 `store.json` 目錄、sha256 驗證後以 Blob script 載入，`activate(host)` 回傳面板註冊進動態註冊表，掛進現有 workspace/grid 機制。四個外掛住在獨立 repo `shioaji-pro-plugins`（pnpm monorepo），CI 產 `store.json`＋GitHub Release。

**Tech Stack:** React 19、TypeScript、Vite（lib mode iife）、vitest（新增 devDep）、vanilla-extract、pnpm、Web Crypto（sha256）、Cache API。

**Spec:** `docs/superpowers/specs/2026-08-12-plugin-system-design.md`

## Global Constraints

- 繁體中文 UI 文案；程式註解風格比照現有檔案（中英混用可）
- 不使用 default export（外掛 runtime 匯出走 `window.SJP_PLUGIN` 全域，非 ESM default）
- 生產程式碼不留 console.log
- 4 空格縮排、單引號、分號，比照現有 `src/` 風格
- 樣式用 vanilla-extract（`*.css.ts`），比照 `src/components/*.css.ts`
- 套件管理用 pnpm；Node 20+
- 主 repo 新增 devDependency 僅 `vitest`；不新增 runtime dependency
- 外掛 API 版本 `HOST_API_VERSION = 1`；所有 host 方法 async、參數可序列化（iframe 未來相容）
- v1 不提供下單 API、跨外掛通訊、背景任務（spec 明定）
- Commit 訊息結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

**主 repo（Shioaji-Pro）：**

```
src/lib/plugins/
  types.ts          ← PluginManifest / PluginHost / PluginPanelDef / 常數
  manifest.ts       ← manifest 解析驗證、版本比較、相容性檢查（純函數）
  loader.ts         ← sha256、bundle 抓取（Cache API 後備）、Blob script 載入
  host.ts           ← createHost()：橋接 api/stream/contracts/theme/storage
  store.ts          ← 安裝清單（localStorage）、runtime 註冊表、init/install/update/disable
src/components/
  plugin-block.tsx      ← 版面上的外掛面板容器（ErrorBoundary＋佔位卡）
  plugin-store.tsx      ← 商店對話框（含開發者模式 side-load）
  plugin-store.css.ts
fixtures/plugin-hello/  ← 端到端煙霧測試用的手寫外掛
scripts/serve-plugins.mjs ← 本機靜態伺服 fixtures（開發/煙霧測試用）
```

**外掛 repo（`../shioaji-pro-plugins`，與主 repo 同層）：**

```
shioaji-pro-plugins/
  package.json  pnpm-workspace.yaml  tsconfig.base.json
  packages/sdk/            ← 型別（與主 repo types.ts 同步）＋vite build helper＋mock host
  packages/statement/      ← 證券對帳單
  packages/warrant-finder/ ← 個股對應權證
  packages/margin-ratio/   ← 整戶與個股維持率
  packages/credit-expiry/  ← 融資券到期明細
  scripts/build-store.mjs  ← build 全部＋sha256＋產 store.json
  .github/workflows/release.yml
```

---

## Phase 1：主 repo 外掛系統

### Task 1: vitest ＋ 外掛型別 ＋ manifest 驗證

**Files:**
- Modify: `package.json`（加 vitest＋test script）
- Create: `src/lib/plugins/types.ts`
- Create: `src/lib/plugins/manifest.ts`
- Test: `src/lib/plugins/manifest.test.ts`

**Interfaces:**
- Produces: `PluginManifest`、`PluginPanelDef`、`PluginPanels`、`PluginHost`、`HOST_API_VERSION`、`parseManifest(raw: unknown): PluginManifest`（throws）、`cmpVersion(a: string, b: string): -1 | 0 | 1`、`checkCompat(m: PluginManifest, appVersion: string): string | null`（null＝相容）

- [ ] **Step 1: 安裝 vitest 並加 script**

```bash
pnpm add -D vitest
```

`package.json` scripts 加：`"test": "vitest run"`。

- [ ] **Step 2: 寫型別檔**（無邏輯，不需測試）

`src/lib/plugins/types.ts`：

```ts
// src/lib/plugins/types.ts — 外掛系統的公開契約。
// 與 shioaji-pro-plugins/packages/sdk/src/types.ts 保持同步（手動）。

import type { ContractInfo } from '../types/contract';
import type { SseTick } from '../stream';

export const HOST_API_VERSION = 1;

// 官方商店 manifest 的 URL；開發時可用 localStorage 'sjp.plugins.storeUrl' 覆寫
export const OFFICIAL_STORE_URL =
    'https://github.com/Sinotrade/shioaji-pro-plugins/releases/latest/download/store.json';

export interface PluginManifest {
    id: string;
    name: string;
    version: string; // semver 三段
    apiVersion: number;
    minAppVersion: string;
    entry: string; // 相對於 manifest 所在目錄，如 'index.js'
    sha256: string; // entry bundle 的 sha256 hex
    description: string;
}

// store.json 的形狀（CI 產生）
export interface StoreCatalog {
    apiVersion: number;
    plugins: (PluginManifest & { url: string; disabled?: boolean })[];
}

export interface PluginPanelProps {
    // null → 面板未鎖定商品且全域也沒選；string → 當前商品代碼
    code: string | null;
}

export interface PluginPanelDef {
    key: string;
    label: string;
    pinnable: boolean;
    singleton: boolean;
    defaultSize: { w: number; h: number; minW: number; minH: number };
    Component: React.ComponentType<PluginPanelProps>;
}

export interface PluginPanels {
    panels: PluginPanelDef[];
}

export interface WarrantFilters {
    underlyingCode: string;
    callPut?: 'C' | 'P';
}

export interface WarrantInfo {
    code: string;
    name: string;
    call_put?: string;
    strike_price?: number;
    delivery_date?: string;
}

export interface ThemeTokens {
    mode: 'dark' | 'midnight' | 'light';
    up: string; // 漲色（依台/美慣例設定變化）
    down: string;
    text: string;
    bg: string;
}

export interface PluginHost {
    apiVersion: number;
    appVersion: string;
    api: {
        get<T>(path: string): Promise<T>;
        post<T>(path: string, body: unknown): Promise<T>;
    };
    stream: {
        subscribe(code: string, cb: (tick: SseTick) => void): () => void;
    };
    contracts: {
        resolve(code: string): Promise<ContractInfo | null>;
        searchWarrants(filters: WarrantFilters): Promise<WarrantInfo[]>;
    };
    ui: {
        theme(): ThemeTokens;
        onSelectCode(code: string): void;
        // 顯示於通知中心（trackActivity），非彈出式
        toast(msg: string, level?: 'info' | 'warn' | 'error'): void;
    };
    storage: {
        get<T>(key: string): T | null;
        set(key: string, value: unknown): void;
    };
}

// bundle 載入後從 window.SJP_PLUGIN 取得的形狀
export interface PluginModule {
    activate(host: PluginHost): PluginPanels;
}
```

- [ ] **Step 3: 寫 manifest 驗證的失敗測試**

`src/lib/plugins/manifest.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { checkCompat, cmpVersion, parseManifest } from './manifest';

const VALID = {
    id: 'statement',
    name: '證券對帳單',
    version: '1.2.0',
    apiVersion: 1,
    minAppVersion: '0.9.0',
    entry: 'index.js',
    sha256: 'a'.repeat(64),
    description: '月對帳單視圖',
};

describe('parseManifest', () => {
    it('接受合法 manifest', () => {
        expect(parseManifest(VALID).id).toBe('statement');
    });
    it('缺欄位要丟錯', () => {
        const { sha256: _sha256, ...missing } = VALID;
        expect(() => parseManifest(missing)).toThrow(/sha256/);
    });
    it('id 只允許 kebab-case', () => {
        expect(() => parseManifest({ ...VALID, id: 'Bad Id!' })).toThrow(
            /id/,
        );
    });
    it('version 必須是三段數字', () => {
        expect(() => parseManifest({ ...VALID, version: 'v1' })).toThrow(
            /version/,
        );
    });
    it('非物件輸入要丟錯', () => {
        expect(() => parseManifest(null)).toThrow();
    });
});

describe('cmpVersion', () => {
    it('比較各段數字而非字串', () => {
        expect(cmpVersion('1.10.0', '1.9.0')).toBe(1);
        expect(cmpVersion('1.2.0', '1.2.0')).toBe(0);
        expect(cmpVersion('0.9.1', '1.0.0')).toBe(-1);
    });
});

describe('checkCompat', () => {
    it('相容時回 null', () => {
        expect(checkCompat(parseManifest(VALID), '1.0.0')).toBeNull();
    });
    it('apiVersion 過新 → 說明文字', () => {
        const m = parseManifest({ ...VALID, apiVersion: 99 });
        expect(checkCompat(m, '1.0.0')).toMatch(/App/);
    });
    it('App 版本過舊 → 說明文字', () => {
        const m = parseManifest({ ...VALID, minAppVersion: '9.9.9' });
        expect(checkCompat(m, '1.0.0')).toMatch(/更新/);
    });
});
```

- [ ] **Step 4: 跑測試確認失敗**

Run: `pnpm test src/lib/plugins/manifest.test.ts`
Expected: FAIL（manifest.ts 不存在）

- [ ] **Step 5: 實作 manifest.ts**

```ts
// src/lib/plugins/manifest.ts — manifest 解析與相容性檢查（純函數）

import { HOST_API_VERSION, type PluginManifest } from './types';

const ID_RE = /^[a-z][a-z0-9-]*$/;
const VER_RE = /^\d+\.\d+\.\d+$/;

function fail(field: string, why: string): never {
    throw new Error(`外掛 manifest 欄位 ${field} ${why}`);
}

export function parseManifest(raw: unknown): PluginManifest {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error('外掛 manifest 不是物件');
    }
    const r = raw as Record<string, unknown>;
    const str = (k: string): string => {
        if (typeof r[k] !== 'string' || r[k] === '') fail(k, '缺少或非字串');
        return r[k] as string;
    };
    const id = str('id');
    if (!ID_RE.test(id)) fail('id', '必須是 kebab-case 英數');
    const version = str('version');
    if (!VER_RE.test(version)) fail('version', '必須是 x.y.z');
    const minAppVersion = str('minAppVersion');
    if (!VER_RE.test(minAppVersion)) fail('minAppVersion', '必須是 x.y.z');
    if (typeof r.apiVersion !== 'number') fail('apiVersion', '缺少或非數字');
    const sha256 = str('sha256');
    if (!/^[0-9a-f]{64}$/.test(sha256)) fail('sha256', '必須是 64 位 hex');
    return {
        id,
        name: str('name'),
        version,
        apiVersion: r.apiVersion,
        minAppVersion,
        entry: str('entry'),
        sha256,
        description: str('description'),
    };
}

export function cmpVersion(a: string, b: string): -1 | 0 | 1 {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
    }
    return 0;
}

// null = 相容；否則回傳給使用者看的原因
export function checkCompat(
    m: PluginManifest,
    appVersion: string,
): string | null {
    if (m.apiVersion > HOST_API_VERSION) {
        return `此外掛需要較新的 App（外掛 API v${m.apiVersion}，App 支援 v${HOST_API_VERSION}）`;
    }
    if (cmpVersion(appVersion, m.minAppVersion) < 0) {
        return `此外掛需要 App ${m.minAppVersion} 以上，請先更新 App`;
    }
    return null;
}
```

- [ ] **Step 6: 跑測試確認通過**

Run: `pnpm test src/lib/plugins/manifest.test.ts`
Expected: PASS（10 tests）

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/plugins/
git commit -m "feat(plugins): 外掛型別契約與 manifest 驗證（vitest 起步）"
```

### Task 2: sha256 ＋ bundle 載入器

**Files:**
- Create: `src/lib/plugins/loader.ts`
- Modify: `src/lib/api.ts`（export 現有私有 `doFetch` 為 `rawFetch`）
- Test: `src/lib/plugins/loader.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `PluginManifest`、`PluginModule`
- Produces: `sha256Hex(text: string): Promise<string>`、`fetchBundle(url: string, expectedSha: string): Promise<string>`（網路優先→驗 sha→寫 Cache；失敗退 Cache）、`loadBundle(code: string): Promise<PluginModule>`（Blob script、序列化載入）、`ensureSharedGlobals(): void`

- [ ] **Step 1: api.ts 開出 rawFetch**

在 `src/lib/api.ts` 把 `async function doFetch` 改為：

```ts
export async function rawFetch(
    url: string,
    init?: RequestInit,
): Promise<Response> {
    if (isTauri) {
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
        return tauriFetch(url, init);
    }
    return fetch(url, init);
}
```

檔案內原本呼叫 `doFetch(` 的地方全改 `rawFetch(`（同檔 5 處）。跑 `pnpm build` 確認 tsc 過。

- [ ] **Step 2: 寫 sha256 失敗測試**

`src/lib/plugins/loader.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './loader';

describe('sha256Hex', () => {
    it('已知向量', async () => {
        // echo -n 'abc' | sha256sum
        expect(await sha256Hex('abc')).toBe(
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        );
    });
    it('空字串', async () => {
        expect(await sha256Hex('')).toBe(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        );
    });
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `pnpm test src/lib/plugins/loader.test.ts`
Expected: FAIL

- [ ] **Step 4: 實作 loader.ts**

```ts
// src/lib/plugins/loader.ts — bundle 抓取（sha256 驗證＋Cache API 後備）
// 與 Blob script 載入。外掛 bundle 是 IIFE：執行後把 exports 放到
// window.SJP_PLUGIN，react 系列從 window.SJP_React 等共享全域取。

import { rawFetch } from '../api';
import type { PluginModule } from './types';

export async function sha256Hex(text: string): Promise<string> {
    const buf = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(text),
    );
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

const CACHE_NAME = 'sjp-plugins-v1';

async function readCache(url: string): Promise<string | null> {
    try {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(url);
        return hit ? hit.text() : null;
    } catch {
        return null; // Cache API 不可用（如私密瀏覽）→ 純網路
    }
}

async function writeCache(url: string, text: string) {
    try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(url, new Response(text));
    } catch {
        // 快取失敗不影響載入
    }
}

// 網路優先：抓到→驗 sha→寫快取。網路失敗→退快取（仍驗 sha）。
export async function fetchBundle(
    url: string,
    expectedSha: string,
): Promise<string> {
    let text: string | null = null;
    try {
        const res = await rawFetch(url);
        if (res.ok) text = await res.text();
    } catch {
        // 斷網 → 走快取
    }
    if (text === null) text = await readCache(url);
    if (text === null) throw new Error('外掛下載失敗且無本地快取');
    const actual = await sha256Hex(text);
    if (actual !== expectedSha) {
        throw new Error('外掛完整性驗證失敗（sha256 不符），已拒絕載入');
    }
    await writeCache(url, text);
    return text;
}

declare global {
    interface Window {
        SJP_React?: unknown;
        SJP_ReactDOM?: unknown;
        SJP_JSXRuntime?: unknown;
        SJP_PLUGIN?: PluginModule;
    }
}

export function ensureSharedGlobals() {
    if (window.SJP_React) return;
    // 動態 import 避免在測試環境（node）觸碰 react-dom
    // 實際掛載於 boot 流程（store.ts init）
}

export async function installSharedGlobals() {
    if (window.SJP_React) return;
    const [react, reactDom, jsx] = await Promise.all([
        import('react'),
        import('react-dom'),
        import('react/jsx-runtime'),
    ]);
    window.SJP_React = react;
    window.SJP_ReactDOM = reactDom;
    window.SJP_JSXRuntime = jsx;
}

// 外掛共用 window.SJP_PLUGIN 交棒，載入必須序列化
let loadChain: Promise<unknown> = Promise.resolve();

export function loadBundle(code: string): Promise<PluginModule> {
    const next = loadChain.then(
        () =>
            new Promise<PluginModule>((resolve, reject) => {
                const url = URL.createObjectURL(
                    new Blob([code], { type: 'text/javascript' }),
                );
                const s = document.createElement('script');
                s.src = url;
                s.onload = () => {
                    URL.revokeObjectURL(url);
                    s.remove();
                    const mod = window.SJP_PLUGIN;
                    delete window.SJP_PLUGIN;
                    if (!mod || typeof mod.activate !== 'function') {
                        reject(new Error('外掛缺少 activate 匯出'));
                        return;
                    }
                    resolve(mod);
                };
                s.onerror = () => {
                    URL.revokeObjectURL(url);
                    s.remove();
                    reject(new Error('外掛腳本執行失敗'));
                };
                document.head.appendChild(s);
            }),
    );
    loadChain = next.catch(() => undefined);
    return next;
}
```

- [ ] **Step 5: 跑測試確認通過＋build 過**

Run: `pnpm test src/lib/plugins/loader.test.ts` → PASS
Run: `pnpm build` → 成功（rawFetch 改名無漏改）

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts src/lib/plugins/loader.ts src/lib/plugins/loader.test.ts
git commit -m "feat(plugins): bundle 載入器（sha256 驗證、快取後備、Blob script）"
```

### Task 3: PluginHost 工廠 ＋ 外掛狀態 store

**Files:**
- Create: `src/lib/plugins/host.ts`
- Create: `src/lib/plugins/store.ts`
- Test: `src/lib/plugins/store.test.ts`

**Interfaces:**
- Consumes: Task 1–2 全部；`src/lib/shioaji.ts` 的 `resolveContract`、`fetchWarrants`；`src/lib/stream.ts` 的 `ensureStream`/`registerSubscription`/`unregisterSubscription`/`onAnyTick`；`src/lib/activity.ts` 的 `trackActivity`；`src/lib/theme-store.ts`
- Produces:
  - `createHost(pluginId: string, bridge: { onSelectCode(code: string): void }): PluginHost`
  - store：`initPlugins(bridge): Promise<void>`、`usePluginsState(): PluginsState`、`installPlugin(catalogEntry): Promise<void>`、`updatePlugin(id): Promise<void>`、`setPluginEnabled(id, on): Promise<void>`、`uninstallPlugin(id): void`、`sideloadPlugin(baseUrl): Promise<void>`、`getPanelDef(pluginId, panelKey): PluginPanelDef | null`、`listLoadedPanels(): { pluginId: string; panel: PluginPanelDef }[]`、`getCatalog(): StoreCatalog | null`
  - `interface PluginsState { installed: InstalledPlugin[]; loaded: Record<string, 'ok' | string>; catalog: StoreCatalog | null }`
  - `interface InstalledPlugin { id: string; baseUrl: string; version: string; enabled: boolean; sideloaded: boolean; manifest: PluginManifest }`

- [ ] **Step 1: host.ts 實作**（薄橋接，不寫單元測試——每條線都是既有模組的一行轉呼叫，由 Task 6 fixture 煙霧測試覆蓋）

```ts
// src/lib/plugins/host.ts — 外掛的世界入口。全部 async、參數可序列化
// （未來 iframe 沙箱相容）。v1 刻意不含下單 API。

import { apiGet, apiPost } from '../api';
import { trackActivity } from '../activity';
import { resolveContract, fetchWarrants } from '../shioaji';
import {
    ensureStream,
    onAnyTick,
    registerSubscription,
    unregisterSubscription,
} from '../stream';
import { getThemeSettings, getChartColors } from '../theme-store';
import type { PluginHost, ThemeTokens } from './types';
import { HOST_API_VERSION } from './types';

// App 版本：build 時由 vite define 注入（見 vite.config.ts 的
// __APP_VERSION__），fallback 開發模式
declare const __APP_VERSION__: string | undefined;
const APP_VERSION =
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
                registerSubscription({ code, quote_type: 'tick' });
                const off = onAnyTick((tick) => {
                    if (tick.code === code) cb(tick);
                });
                return () => {
                    off();
                    unregisterSubscription(code, 'tick');
                };
            },
        },
        contracts: {
            resolve: (code) =>
                resolveContract(code).then((c) => c ?? null),
            searchWarrants: (filters) =>
                fetchWarrants({
                    underlying_code: filters.underlyingCode,
                    call_put: filters.callPut,
                }).then((r) => r.contracts ?? []),
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
                localStorage.setItem(ns + key, JSON.stringify(value));
            },
        },
    };
}
```

註：`getThemeSettings` 若 theme-store 未匯出（只有 `useThemeSettings`），在 theme-store.ts 補一個讀取當前值的具名匯出（同一 store 內部變數，一行）。`resolveContract`/`fetchWarrants` 簽名以 `src/lib/shioaji.ts` 實際定義為準——實作時先讀該檔對齊參數（`fetchWarrants` 的 filters 鍵名、回傳形狀），不要照抄本計畫猜的鍵名。`vite.config.ts` 的 `define` 加 `__APP_VERSION__: JSON.stringify(pkg.version)`（讀 package.json）。

- [ ] **Step 2: 寫 store 純邏輯的失敗測試**

`src/lib/plugins/store.test.ts`（測不碰 DOM 的部分：安裝清單的 localStorage round-trip、更新判斷）：

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
    hasUpdate,
    loadInstalled,
    saveInstalled,
    type InstalledPlugin,
} from './store';

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

beforeEach(() => localStorage.clear());

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
```

vitest 需要 DOM 環境跑 localStorage：`package.json` devDep 加 `jsdom`，test script 改 `vitest run --environment jsdom`（或 vite.config 加 test.environment）。

- [ ] **Step 3: 跑測試確認失敗**

Run: `pnpm test src/lib/plugins/store.test.ts`
Expected: FAIL

- [ ] **Step 4: 實作 store.ts**

```ts
// src/lib/plugins/store.ts — 外掛安裝清單（localStorage）＋runtime 註冊表。
// useSyncExternalStore 模式比照 theme-store.ts。

import { useSyncExternalStore } from 'react';
import { checkCompat, cmpVersion, parseManifest } from './manifest';
import { fetchBundle, installSharedGlobals, loadBundle } from './loader';
import { createHost } from './host';
import { rawFetch } from '../api';
import {
    OFFICIAL_STORE_URL,
    type InstalledPlugin as _II, // (型別定義在下方，此行僅示意——實作時型別放本檔)
} from './types';
```

實作內容（完整要求，本檔約 200 行）：

```ts
const LS_KEY = 'sjp.plugins.installed.v1';

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
    localStorage.setItem(LS_KEY, JSON.stringify(list));
}

export function hasUpdate(
    p: InstalledPlugin,
    catalogEntry: PluginManifest,
): boolean {
    return cmpVersion(catalogEntry.version, p.version) > 0;
}
```

其餘函數行為規格：

- `initPlugins(bridge)`：`installSharedGlobals()` → 抓 catalog（`localStorage['sjp.plugins.storeUrl'] ?? OFFICIAL_STORE_URL`，`rawFetch`，失敗→catalog=null 靜默）→ 對每個 `enabled` 的 installed：若 catalog 標 `disabled` → 強制 `enabled=false`、`loaded[id]='官方已停用：…'`；否則 `fetchBundle(baseUrl+entry, sha256)` → `loadBundle` → `activate(createHost(id, bridge))` → panels 存入模組級 `Map<string, PluginPanelDef[]>`、`loaded[id]='ok'`。任何一步 throw → `loaded[id]=錯誤訊息`，繼續下一個外掛（單一外掛失敗不擋其他）。
- `installPlugin(entry)`（entry 來自 catalog，含 url）：`checkCompat` 先擋 → 抓 manifest.json（`entry.url` 目錄下）→ `parseManifest` → fetchBundle → loadBundle → activate → 寫入 installed（enabled=true）→ 通知訂閱者。
- `updatePlugin(id)`：同 install 流程重抓，成功後更新 version/manifest，該外掛 panels 換新（remount 由 React 樹處理）。
- `setPluginEnabled(id, on)`：off→從 panels Map 移除；on→重走載入。皆持久化。
- `sideloadPlugin(baseUrl)`：抓 `baseUrl + 'manifest.json'` → parse → **跳過 sha256 比對改為現算現記**（side-load 無官方 sha；記下實際 hash 供之後顯示）→ 載入 → installed 標 `sideloaded: true`。
- `getPanelDef(pluginId, panelKey)`：查 Map，無 → null。
- `listLoadedPanels()`：攤平 Map。
- 訂閱：模組級 `listeners: Set<() => void>`＋`snapshot` 物件，`usePluginsState()` 用 `useSyncExternalStore`。

- [ ] **Step 5: 跑測試確認通過＋build**

Run: `pnpm test` → PASS；`pnpm build` → 成功

- [ ] **Step 6: Commit**

```bash
git add src/lib/plugins/ src/lib/theme-store.ts vite.config.ts package.json pnpm-lock.yaml
git commit -m "feat(plugins): PluginHost 橋接與外掛狀態 store（安裝/更新/停用/side-load）"
```

### Task 4: workspace `plugin` block ＋ App 渲染整合

**Files:**
- Modify: `src/lib/workspace.ts`
- Create: `src/components/plugin-block.tsx`
- Modify: `src/App.tsx`
- Test: 手動（`pnpm dev` 開版面加外掛格）＋`pnpm build`

**Interfaces:**
- Consumes: Task 3 的 `getPanelDef`、`listLoadedPanels`、`initPlugins`、`usePluginsState`
- Produces: `Block` 增欄位 `pluginId?: string; panelKey?: string`；`BlockType` 增 `'plugin'`；`PluginBlock` 元件 props `{ block: Block; code: string | null }`

- [ ] **Step 1: workspace.ts 加型別**

`BlockType` union 加 `| 'plugin'`；`Block` 加：

```ts
export interface Block {
    id: string;
    type: BlockType;
    pin: string | null;
    // type === 'plugin' 時必填：對應外掛面板
    pluginId?: string;
    panelKey?: string;
}
```

`BLOCK_META` 加通用備援（實際 label/size 於 addBlock 時從外掛面板定義取）：

```ts
plugin: {
    label: '外掛面板',
    pinnable: true,
    singleton: false,
    defaultSize: { w: 6, h: 10, minW: 3, minH: 4 },
},
```

- [ ] **Step 2: PluginBlock 元件（ErrorBoundary＋佔位卡）**

`src/components/plugin-block.tsx`：

```tsx
// src/components/plugin-block.tsx — 版面上的外掛面板容器。
// 外掛崩潰只毀這一格：class ErrorBoundary 包住外掛元件。

import React from 'react';
import type { Block } from '../lib/workspace';
import { getPanelDef, usePluginsState } from '../lib/plugins/store';

class PanelBoundary extends React.Component<
    { children: React.ReactNode; onRetry: () => void },
    { error: string | null }
> {
    state = { error: null as string | null };
    static getDerivedStateFromError(e: unknown) {
        return { error: e instanceof Error ? e.message : String(e) };
    }
    render() {
        if (this.state.error !== null) {
            return (
                <div style={{ padding: 12 }}>
                    <p>外掛面板發生錯誤：{this.state.error}</p>
                    <button
                        onClick={() => {
                            this.setState({ error: null });
                            this.props.onRetry();
                        }}
                    >
                        重新載入
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export function PluginBlock({
    block,
    code,
}: {
    block: Block;
    code: string | null;
}) {
    const { loaded } = usePluginsState();
    const [retry, setRetry] = React.useState(0);
    const def =
        block.pluginId && block.panelKey
            ? getPanelDef(block.pluginId, block.panelKey)
            : null;
    if (!def) {
        const reason =
            (block.pluginId && loaded[block.pluginId]) || '外掛已停用或未安裝';
        return (
            <div style={{ padding: 12, opacity: 0.7 }}>
                外掛面板不可用：{reason === 'ok' ? '面板不存在' : reason}
            </div>
        );
    }
    const Comp = def.Component;
    return (
        <PanelBoundary
            key={retry}
            onRetry={() => setRetry((n) => n + 1)}
        >
            <Comp code={code} />
        </PanelBoundary>
    );
}
```

（inline style 僅此佔位卡；正式面板樣式由外掛自帶。）

- [ ] **Step 3: App.tsx 整合**

1. boot 處（App mount 的 useEffect）呼叫 `void initPlugins({ onSelectCode });`
2. `BlockBody` 的 switch 加：

```tsx
case 'plugin':
    return <PluginBlock block={block} code={contract?.code ?? null} />;
```

3. BlockView 標題：`block.type === 'plugin'` 時 label 改用 `getPanelDef(...)?.label ?? BLOCK_META.plugin.label`。
4. 「新增面板」選單（App.tsx `Object.keys(BLOCK_META)` 處）：先 filter 掉 `'plugin'`（不出現通用項），再 concat `listLoadedPanels().map(...)` 產生每個外掛面板的項目；`addBlock` 簽名擴為 `(type: BlockType, plugin?: { pluginId: string; panelKey: string })`，plugin 項用外掛面板的 `defaultSize`/`singleton`。
5. `usePluginsState()` 在 App 訂閱，外掛載入完成後選單自動出現。

- [ ] **Step 4: 驗證**

Run: `pnpm build` → tsc 無誤。
Run: `pnpm dev` → App 正常啟動、無外掛時行為不變（回歸）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace.ts src/components/plugin-block.tsx src/App.tsx
git commit -m "feat(plugins): workspace plugin block 與 App 渲染整合（ErrorBoundary）"
```

### Task 5: 商店對話框 ＋ header 入口 ＋ 開發者模式

**Files:**
- Create: `src/components/plugin-store.tsx`
- Create: `src/components/plugin-store.css.ts`
- Modify: `src/components/hud-header.tsx`（加「外掛」按鈕；比照現有「版面」按鈕的 props 傳遞模式）
- Modify: `src/App.tsx`（掛對話框 state）

**Interfaces:**
- Consumes: Task 3 全部 store 函數
- Produces: `PluginStoreDialog({ open, onClose }: { open: boolean; onClose: () => void })`

- [ ] **Step 1: css.ts**（比照 `src/components/command-palette.css.ts` 的 overlay＋panel 模式；類名：`overlay`、`dialog`、`row`、`rowTitle`、`rowDesc`、`badge`、`actions`、`devSection`、`devWarning`）

- [ ] **Step 2: 對話框元件**

`plugin-store.tsx` 行為規格（完整實作，約 180 行）：

- 列表資料：`usePluginsState()`；顯示 catalog 全部外掛，每列＝名稱＋描述＋狀態徽章（未安裝／已安裝 vX／可更新 vX→vY／已停用／載入失敗:原因／官方下架）。
- 動作按鈕：未安裝→「安裝」(`installPlugin`)；可更新→「更新」(`updatePlugin`)；已安裝→啟用開關 (`setPluginEnabled`)＋「移除」(`uninstallPlugin`)。動作中 disable 按鈕顯示「處理中…」。
- catalog === null 時列表區顯示「無法取得外掛目錄（離線？）——已安裝的外掛不受影響」。
- 開發者模式（底部收合區）：URL 輸入框＋「載入」按鈕；點載入先出確認畫面（同對話框內切換）：

```
⚠ 自負風險：side-load 的外掛不經官方簽驗，擁有與 App 相同的資料存取權
（帳務、行情、個人設定）。僅載入你完全信任的來源。
[取消] [我了解風險，繼續載入]
```

確認後 `sideloadPlugin(url)`，失敗顯示錯誤於同區。

- [ ] **Step 3: header 按鈕**

讀 `src/components/hud-header.tsx` 找工具列按鈕群（「版面」「伺服器」等），比照同款式加「外掛」按鈕，props 加 `onOpenPluginStore: () => void`；App.tsx 掛 `const [pluginStoreOpen, setPluginStoreOpen] = useState(false)` 並 render `<PluginStoreDialog …/>`。有可更新外掛時按鈕加紅點（`usePluginsState` 算 `hasUpdate` 任一）。

- [ ] **Step 4: 驗證＋commit**

`pnpm build` 過、`pnpm dev` 開商店對話框正常（目錄抓不到時顯示離線文案）。

```bash
git add src/components/plugin-store.tsx src/components/plugin-store.css.ts src/components/hud-header.tsx src/App.tsx
git commit -m "feat(plugins): 外掛商店對話框與 header 入口（含開發者模式警告）"
```

### Task 6: fixture 外掛 ＋ 端到端煙霧驗證

**Files:**
- Create: `fixtures/plugin-hello/index.js`
- Create: `fixtures/plugin-hello/manifest.json`
- Create: `scripts/serve-plugins.mjs`
- Create: `scripts/hash-fixture.mjs`

**Interfaces:**
- Consumes: 整個 Phase 1
- Produces: 可重複執行的煙霧測試流程（寫進本 task 的驗證步驟；未來改外掛系統都用它回歸）

- [ ] **Step 1: 手寫 fixture 外掛（不需 build）**

`fixtures/plugin-hello/index.js`：

```js
// fixture 外掛：驗證載入鏈（sha256→blob script→activate→面板渲染）
(function () {
    const React = window.SJP_React;
    function HelloPanel(props) {
        return React.createElement(
            'div',
            { style: { padding: 12 } },
            'Hello from plugin — code=' + (props.code ?? '無'),
        );
    }
    window.SJP_PLUGIN = {
        activate: function (host) {
            host.ui.toast('hello 外掛已載入');
            return {
                panels: [
                    {
                        key: 'hello',
                        label: 'Hello 外掛',
                        pinnable: true,
                        singleton: false,
                        defaultSize: { w: 4, h: 6, minW: 2, minH: 3 },
                        Component: HelloPanel,
                    },
                ],
            };
        },
    };
})();
```

- [ ] **Step 2: hash 腳本＋manifest**

`scripts/hash-fixture.mjs`：讀 `fixtures/plugin-hello/index.js` → 算 sha256 → 覆寫 `manifest.json` 的 `sha256` 欄位。manifest 其餘欄位：

```json
{
  "id": "hello",
  "name": "Hello 外掛",
  "version": "0.1.0",
  "apiVersion": 1,
  "minAppVersion": "0.0.0",
  "entry": "index.js",
  "sha256": "（由 hash-fixture.mjs 產生）",
  "description": "端到端煙霧測試用"
}
```

`scripts/serve-plugins.mjs`：node http 靜態伺服 `fixtures/` 於 port 5199，回應加 `Access-Control-Allow-Origin: *`。

- [ ] **Step 3: 端到端煙霧測試（手動，逐項打勾）**

```
1. node scripts/hash-fixture.mjs && node scripts/serve-plugins.mjs &
2. pnpm dev → 開 App
3. 商店 → 開發者模式 → http://localhost:5199/plugin-hello/ → 確認警告文案 → 載入
4. 「新增面板」選單出現「Hello 外掛」→ 加入版面 → 顯示 Hello from plugin
5. 選商品 → 面板 code 跟著變（全域連動）
6. 商店停用 hello → 版面格子變佔位卡「外掛已停用」
7. 重新啟用 → 面板回來
8. 改 index.js 一個字（不重跑 hash）→ 停用再啟用 → 必須被 sha256 拒絕
9. 重新整理頁面 → side-load 外掛自動恢復載入
```

全數通過才算 Phase 1 完成。

- [ ] **Step 4: Commit**

```bash
git add fixtures/ scripts/hash-fixture.mjs scripts/serve-plugins.mjs
git commit -m "test(plugins): fixture 外掛與端到端煙霧測試流程"
```

---

## Phase 2：`shioaji-pro-plugins` monorepo（首批四外掛）

### Task 7: monorepo scaffold ＋ SDK

**Files:**（皆在 `../shioaji-pro-plugins/`，與主 repo 同層）
- Create: `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.gitignore`、`README.md`
- Create: `packages/sdk/package.json`、`packages/sdk/src/types.ts`、`packages/sdk/src/mock-host.ts`、`packages/sdk/src/build.ts`、`packages/sdk/src/index.ts`

**Interfaces:**
- Produces: `@sjp/sdk` workspace 套件：`types.ts`（自主 repo `src/lib/plugins/types.ts` 複製，去掉 `ContractInfo`/`SseTick` import 改為結構型別；檔頭註明同步來源）、`createMockHost(overrides?: Partial<MockHostData>): PluginHost`（api.get/post 從 `overrides.responses: Record<string, unknown>` 查表回傳，storage 用記憶體 Map）、`definePluginConfig(opts: { entry: string }): UserConfig`（vite lib iife、external react 系列、globals 映射 `SJP_React`/`SJP_ReactDOM`/`SJP_JSXRuntime`、footer `window.SJP_PLUGIN = SJP_PLUGIN_BUILD;`、輸出 `dist/index.js`）

- [ ] **Step 1: scaffold**

```bash
mkdir ../shioaji-pro-plugins && cd ../shioaji-pro-plugins
git init
pnpm init
```

`pnpm-workspace.yaml`：`packages:\n  - 'packages/*'`。根 `package.json`：`"scripts": { "build": "pnpm -r --filter './packages/*' build", "test": "vitest run" }`，devDeps：`typescript`、`vite`、`vitest`、`jsdom`、`@vitejs/plugin-react`、`react`、`react-dom`、`@types/react`。（react 是 devDep——外掛 build 時 external，僅供型別與測試。）

- [ ] **Step 2: sdk 套件**（`definePluginConfig` 核心）

`packages/sdk/src/build.ts`：

```ts
import type { UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

export function definePluginConfig(opts: { entry: string }): UserConfig {
    return {
        plugins: [react()],
        define: { 'process.env.NODE_ENV': '"production"' },
        build: {
            lib: {
                entry: opts.entry,
                formats: ['iife'],
                name: 'SJP_PLUGIN_BUILD',
                fileName: () => 'index.js',
            },
            rollupOptions: {
                external: ['react', 'react-dom', 'react/jsx-runtime'],
                output: {
                    globals: {
                        react: 'SJP_React',
                        'react-dom': 'SJP_ReactDOM',
                        'react/jsx-runtime': 'SJP_JSXRuntime',
                    },
                    footer: 'window.SJP_PLUGIN = SJP_PLUGIN_BUILD;',
                },
            },
        },
    };
}
```

- [ ] **Step 3: mock host＋型別複製＋首個煙霧測試**

`packages/sdk/src/mock-host.test.ts`：mock host 的 api.get 查表、storage round-trip（2 個 test）。跑 `pnpm test` PASS 後 commit：

```bash
git add -A && git commit -m "feat(sdk): monorepo scaffold 與外掛 SDK（型別/mock host/build helper）"
```

### Task 8: statement 外掛（證券對帳單）

**Files:**
- Create: `packages/statement/package.json`、`vite.config.ts`、`manifest.json`、`src/index.tsx`、`src/logic.ts`
- Test: `packages/statement/src/logic.test.ts`

**Interfaces:**
- Consumes: `@sjp/sdk` 的 `PluginHost`、`PluginPanelProps`、`createMockHost`、`definePluginConfig`
- Produces: bundle 匯出 `activate`；純函數 `buildStatement(trades: TradeRow[], pnl: PnlRow[], settlements: SettleRow[], month: string): StatementView`

資料端點（host.api.get）：
- `/api/v1/order/trades?account_type=S` → 當日成交
- `/api/v1/portfolio/profit_loss?account_type=S&begin=YYYY-MM-DD&end=YYYY-MM-DD` → 已實現損益（區間）
- `/api/v1/portfolio/settlements?account_type=S` → 交割金額（T/T1/T2）

- [ ] **Step 1: logic.ts 的失敗測試**（先寫 `buildStatement`：按月彙總已實現損益筆數/金額、串當日成交、交割金流；輸入形狀用寬鬆 interface＋optional 欄位，缺欄位不炸）

```ts
import { describe, expect, it } from 'vitest';
import { buildStatement } from './logic';

const PNL = [
    { code: '2330', quantity: 1000, pnl: 5000, price: 600, date: '2026-08-03' },
    { code: '2317', quantity: 2000, pnl: -1200, price: 100, date: '2026-08-05' },
    { code: '2330', quantity: 1000, pnl: 800, price: 610, date: '2026-07-28' },
];

describe('buildStatement', () => {
    it('只彙總指定月份', () => {
        const v = buildStatement([], PNL, [], '2026-08');
        expect(v.realized).toHaveLength(2);
        expect(v.totalPnl).toBe(3800);
    });
    it('空資料不炸', () => {
        const v = buildStatement([], [], [], '2026-08');
        expect(v.totalPnl).toBe(0);
    });
});
```

- [ ] **Step 2: 實作 logic.ts → 測試 PASS**
- [ ] **Step 3: index.tsx 面板**（月份選擇器＋三區塊：已實現損益表、當日成交、交割金額；用 `host.ui.theme()` 的色票 inline style；面板薄、邏輯全在 logic.ts）。`activate` 具名函數＋`window.SJP_PLUGIN` 由 build footer 處理，src 內正常 `export function activate`（iife lib 的 entry export 即 SJP_PLUGIN_BUILD）。
- [ ] **Step 4: build＋manifest**

```bash
pnpm --filter statement build
```

manifest.json 版本 `1.0.0`、id `statement`、名稱「證券對帳單」、sha256 由 Task 12 腳本統一計算（先填 64 個 0）。

- [ ] **Step 5: Commit** `feat(statement): 證券對帳單外掛`

### Task 9: warrant-finder 外掛（個股對應權證）

**Files:** `packages/warrant-finder/`（結構同 Task 8）

**Interfaces:**
- Produces: 純函數 `rankWarrants(warrants: WarrantInfo[], underlyingPrice: number | null): WarrantInfo[]`（依到期日近→遠、價內外排序；underlyingPrice null 時只按到期日）

行為：面板跟隨當前商品 code（`props.code`）→ `host.contracts.searchWarrants({ underlyingCode: code })` → 列表（代碼/名稱/認購售/履約價/到期日）→ 點列 `host.ui.onSelectCode(權證代碼)` 全 App 跳轉。code 為 null 或查無 → 空狀態文案「此商品無對應權證」。

- [ ] **Step 1: rankWarrants 失敗測試**（3 案例：排序、null price、空陣列）
- [ ] **Step 2: 實作 PASS**
- [ ] **Step 3: 面板＋build＋manifest**（id `warrant-finder`，名稱「個股對應權證」）
- [ ] **Step 4: Commit** `feat(warrant-finder): 個股對應權證外掛`

### Task 10: margin-ratio 外掛（整戶與個股維持率）

**Files:** `packages/margin-ratio/`（結構同 Task 8）

**Interfaces:**
- Produces: 純函數 `computeMaintenance(rows: PositionDetailRow[]): { perStock: StockRatio[]; account: number | null; missingFields: boolean }`

```ts
// 台股融資維持率 = 擔保品市值 / 融資金額 × 100%；整戶 = Σ市值 / Σ融資金額。
// 130% 為追繳線 → 列表以 <130 紅、130–166 黃、>=166 綠。
export interface PositionDetailRow {
    code: string;
    quantity: number;
    last_price: number;
    cond?: string; // 'Cash' | 'MarginTrading' | 'ShortSelling'
    margin_purchase_amount?: number; // 融資金額（欄位存在性待驗證）
    collateral?: number;
}
```

**spec 標注的驗證項**：實作時先 `host.api.get('/api/v1/portfolio/position_unit?account_type=S')` 打一次真伺服器（或看主 repo `src/lib/types/portfolio.ts` 有無 detail 型別）確認 `margin_purchase_amount`／`cond` 是否存在。缺欄位 → `missingFields: true`，面板顯示「伺服器未提供融資明細欄位，無法計算維持率」空狀態——**不硬湊數字**（spec 明定降級行為）。

- [ ] **Step 1: computeMaintenance 失敗測試**（4 案例：單股維持率、整戶加總、無融資部位→account null、缺欄位→missingFields true）
- [ ] **Step 2: 實作 PASS**
- [ ] **Step 3: 面板＋build＋manifest**（id `margin-ratio`，名稱「整戶與個股維持率」；紅黃綠用 theme 的 up/down＋自帶琥珀色）
- [ ] **Step 4: Commit** `feat(margin-ratio): 整戶與個股維持率外掛`

### Task 11: credit-expiry 外掛（融資券到期明細）

**Files:** `packages/credit-expiry/`（結構同 Task 8）

**Interfaces:**
- Produces: 純函數 `expiryRows(rows: PositionDetailRow[], today: string): ExpiryRow[]`

```ts
// 融資/融券期限 = 買進日 + 6 個月（可展延不納入 v1）。
// ExpiryRow = { code, quantity, buyDate, expiryDate, daysLeft }，
// daysLeft 升冪排序；rows 缺 date 欄位 → 回空陣列＋missingFields 旗標。
```

- [ ] **Step 1: expiryRows 失敗測試**（4 案例：+6 月跨年、daysLeft 計算與排序、非融資部位過濾、缺 date 欄位）
- [ ] **Step 2: 實作 PASS**（日期用字串拆解計算，不引日期庫）
- [ ] **Step 3: 面板＋build＋manifest**（id `credit-expiry`，名稱「融資券到期明細」；30 天內到期列高亮）
- [ ] **Step 4: Commit** `feat(credit-expiry): 融資券到期明細外掛`

### Task 12: store.json 產生器 ＋ CI ＋ 主 repo 煙霧回歸

**Files:**
- Create: `scripts/build-store.mjs`
- Create: `.github/workflows/release.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: 四個外掛的 `dist/index.js`＋`manifest.json`
- Produces: `dist-store/store.json`＋`dist-store/<id>/index.js`＋`dist-store/<id>/manifest.json`（sha256 已回填）

- [ ] **Step 1: build-store.mjs**

行為：`pnpm build` 全部 → 對每個 `packages/*/manifest.json`（sdk 除外）：讀 `dist/index.js` → 算 sha256 → 回填 manifest → 複製到 `dist-store/<id>/` → 彙整 `store.json`：

```json
{
  "apiVersion": 1,
  "plugins": [
    { "id": "statement", "…manifest 欄位…": "",
      "url": "https://github.com/Sinotrade/shioaji-pro-plugins/releases/latest/download/statement/" }
  ]
}
```

（Release 附件是平面檔案，`url` 實際格式依 Task 12 Step 2 的上傳佈局調整：每外掛檔名 `<id>.js`／`<id>.manifest.json`，store.json 的 `url` 指到附件直鏈；主 repo store.ts 的「baseUrl+entry」邏輯以 manifest `entry` 為相對名，兩邊在此對齊。）

- [ ] **Step 2: GitHub Actions**

`.github/workflows/release.yml`：push tag `v*` → pnpm install → `node scripts/build-store.mjs` → `softprops/action-gh-release` 上傳 `dist-store/**` 為 release assets。

- [ ] **Step 3: 主 repo 端到端回歸**

用 `scripts/serve-plugins.mjs`（主 repo）改指向 `../shioaji-pro-plugins/dist-store` 伺服，重跑 Task 6 的煙霧測試 9 步，外掛換成四個正式外掛逐一安裝、渲染、停用、更新（改版本號重 build 驗更新流程）。

- [ ] **Step 4: Commit＋（可選）發佈**

```bash
git add -A && git commit -m "feat(store): store.json 產生器與 release CI"
```

GitHub repo 建立與首次 push **需使用者確認**（外部服務）：`gh repo create Sinotrade/shioaji-pro-plugins --private` 或使用者指定的 org/帳號。

---

## Self-Review 紀錄

- Spec 覆蓋：§1 套件格式（T1/T2/T6）、§2 PluginHost（T1/T3）、§3 商店/更新/緊急下架/佔位卡（T3/T4/T5）、§4 四外掛（T8–T11）、§5 repo/CI（T7/T12）、錯誤處理表（T2 快取後備/sha 拒絕、T3 逐外掛隔離、T4 ErrorBoundary/佔位卡、T5 離線文案）、測試策略（各 task TDD＋T6 煙霧）。無缺口。
- 型別一致性：`PluginPanelProps.code`、`getPanelDef(pluginId, panelKey)`、`InstalledPlugin.baseUrl` 全計畫一致；`fetchWarrants` 參數形狀標注「以 shioaji.ts 實際定義為準」屬刻意的實作期對齊點（非佔位）。
- 已知風險：store.json 的 GitHub Release 附件是平面結構 vs baseUrl 目錄結構——已在 T12 Step 1 標明兩邊對齊規則。
