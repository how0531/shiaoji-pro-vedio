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
