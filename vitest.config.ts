import fs from 'node:fs';
import path from 'node:path';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
) as { version?: string };

export default defineConfig({
    // store.test.ts 經由 store.ts → host.ts → theme-store.ts 間接載入
    // src/theme.css.ts（vanilla-extract），沒有這個 plugin 轉換會直接炸
    plugins: [vanillaExtractPlugin()],
    define: {
        // 與 vite.config.ts 同源：host.ts 的 APP_VERSION 沒注入時 fallback
        // 是不合法 semver 的 '0.0.0-dev'，會讓 cmpVersion 對任何 minAppVersion
        // 都誤判成「App 版本過舊」。測試環境也注入真的 pkg.version，行為才
        // 跟正式 build 一致
        __APP_VERSION__: JSON.stringify(pkg.version ?? '0.0.0'),
    },
    test: {
        // jsdom：外掛 store 的 localStorage round-trip 測試需要 DOM 環境
        environment: 'jsdom',
    },
});
