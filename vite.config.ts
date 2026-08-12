// vite.config.ts

import fs from 'node:fs';
import path from 'node:path';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// closed-source modules (AI Agent, future tiered features) live in the
// private repo, checked out into ./modules on desktop builds; open-source
// builds resolve '@modules' to the empty stub manifest
const modulesDir = path.resolve(__dirname, './modules/index.ts');
const modulesTarget = fs.existsSync(modulesDir)
    ? modulesDir
    : path.resolve(__dirname, './src/modules-stub/index.ts');
const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
) as { version?: string };

// 財經新聞面板的 dev 代理。前綴與 src/lib/news.ts 的 PROXY_ORIGINS 一一
// 對應；鉅亨 API 會擋沒有來源標頭的請求，而 Origin/Referer 又是瀏覽器禁止
// 腳本自訂的標頭，只能由 proxy 這一層補上。
const NEWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const NEWS_UPSTREAMS: {
    prefix: string;
    target: string;
    headers?: Record<string, string>;
}[] = [
    {
        prefix: '/news/cnyes',
        target: 'https://api.cnyes.com',
        headers: {
            Origin: 'https://news.cnyes.com',
            Referer: 'https://news.cnyes.com/',
        },
    },
    { prefix: '/news/yahoo', target: 'https://tw.stock.yahoo.com' },
    { prefix: '/news/udn', target: 'https://money.udn.com' },
    { prefix: '/news/cna', target: 'https://feeds.feedburner.com' },
    { prefix: '/news/technews', target: 'https://finance.technews.tw' },
    { prefix: '/news/twse', target: 'https://openapi.twse.com.tw' },
    { prefix: '/news/tpex', target: 'https://www.tpex.org.tw' },
];

const newsProxy = Object.fromEntries(
    NEWS_UPSTREAMS.map(({ prefix, target, headers }) => [
        prefix,
        {
            target,
            changeOrigin: true,
            rewrite: (path: string) => path.slice(prefix.length),
            headers: { 'User-Agent': NEWS_UA, ...headers },
        },
    ]),
);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
        base: env.VITE_BASE ?? '/',
        // shioaji app upload flattens nested paths — emit a flat bundle.
        // target: old Intel Macs run older WKWebView (Safari 13–15 era);
        // Vite 8's default (baseline-widely-available ≈ Safari 16) emits
        // syntax those webviews cannot parse → white screen on launch (#4)
        build: { assetsDir: '', target: ['es2020', 'safari13'] },
        // react-draggable (react-grid-layout dep) reads process.env at runtime
        define: {
            'process.env': {},
            // feature-flag service client key (publishable) — from .env
            // locally, or the STATSIG_CLIENT_KEY secret in CI builds
            __STATSIG_CLIENT_KEY__: JSON.stringify(
                env.STATSIG_CLIENT_KEY ??
                    process.env.STATSIG_CLIENT_KEY ??
                    '',
            ),
            __SHIOAJI_APP_VERSION__: JSON.stringify(pkg.version ?? ''),
            // 外掛 host（PluginHost.appVersion，src/lib/plugins/host.ts）用；
            // 與上面的 __SHIOAJI_APP_VERSION__ 同源，分開命名避免外掛 SDK
            // 耦合到桌面 app 內部的握手用常數
            __APP_VERSION__: JSON.stringify(pkg.version ?? ''),
            // bundled server version（repo 根目錄 SHIOAJI_VERSION —
            // 與 CI 下載 sidecar 的同一個來源）— app 開機做版本握手
            __SHIOAJI_SERVER_VERSION__: JSON.stringify(
                fs
                    .readFileSync(
                        path.resolve(__dirname, 'SHIOAJI_VERSION'),
                        'utf8',
                    )
                    .trim(),
            ),
        },
        plugins: [vanillaExtractPlugin(), react()],
        resolve: {
            alias: {
                '@modules': modulesTarget,
                '@': path.resolve(__dirname, './src'),
            },
        },
        // preview（launcher 走 pnpm preview）與 dev 用同一組新聞代理，
        // 否則 preview 下新聞會全被 CORS 擋掉
        preview: { proxy: { ...newsProxy } },
        server: {
            // honor a harness-assigned port (preview tooling sets PORT);
            // default stays 5173 for tauri dev. Bind loopback only so Vite
            // is never exposed to the LAN.
            host: '127.0.0.1',
            port: Number(process.env.PORT) || 5173,
            proxy: {
                // dev 打自帶 sidecar（scripts/dev-api.sh，與 CI 打包同版
                // binary、port 21322）— 確保 API/UI 版本相符，不依賴使用
                // 者自裝在 8080 的 CLI。要打別台時用 VITE_API_TARGET 蓋掉
                '/api': env.VITE_API_TARGET ?? 'http://127.0.0.1:21322',
                // 財經新聞面板：這些新聞站一家都沒送 CORS 標頭，瀏覽器直
                // 連必被擋。桌面版走 Tauri 的 Rust-side fetch，dev 就靠這
                // 組 proxy（前綴與 src/lib/news.ts 的 PROXY_ORIGINS 對應）
                ...newsProxy,
            },
        },
    };
});
