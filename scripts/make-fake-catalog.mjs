// scripts/make-fake-catalog.mjs — 產生大量假外掛的 store.json，供外掛商店
// 規模化驗證用（現在官方目錄只有 4 個外掛，驗不出分頁／搜尋／分類篩選在
// 上百個外掛時的行為）。只產目錄（store.json），不產真的可安裝 bundle：
// 驗證的是商店 UI（探索分頁、搜尋、分類 chips、RENDER_LIMIT），不是安裝
// 流程本身，entry/sha256 因此不需要對應真的檔案內容。
//
// 用法：
//   node scripts/make-fake-catalog.mjs            → 300 筆，寫入
//                                                     fixtures/fake-catalog/store.json
//   node scripts/make-fake-catalog.mjs 500         → 自訂筆數
//
// 搭配 scripts/serve-plugins.mjs 伺服：
//   node scripts/serve-plugins.mjs ./fixtures/fake-catalog
// 再於瀏覽器 console：
//   localStorage.setItem('sjp.plugins.storeUrl', 'http://localhost:5199/store.json')
// 驗完記得清掉這個 key，恢復官方市集。

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'fixtures', 'fake-catalog');
const count = Number(process.argv[2]) || 300;

// 與 src/lib/plugins/types.ts 的 PLUGIN_CATEGORIES 保持一致（key 值必須是
// parseManifest 認得的五個合法分類，否則安裝時會被 category 驗證擋下）。
const CATEGORIES = /** @type {const} */ ([
    'market',
    'trading',
    'account',
    'derivatives',
    'tools',
]);
const CATEGORY_LABEL = {
    market: '行情',
    trading: '交易',
    account: '帳務分析',
    derivatives: '選擇權/衍生品',
    tools: '工具',
};

function fakeSha256(seed) {
    // 隨便填但格式合法（64 位 hex，parseManifest 的 /^[0-9a-f]{64}$/ 認得）。
    // 不對應真實 bundle 內容，因為這批假外掛本來就不打算被實際安裝。
    return createHash('sha256').update(String(seed)).digest('hex');
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function padId(n, width) {
    return String(n).padStart(width, '0');
}

const width = String(count).length;
const plugins = [];
for (let i = 1; i <= count; i++) {
    const category = pick(CATEGORIES);
    const seq = padId(i, width);
    const id = `fake-plugin-${seq}`;
    plugins.push({
        id,
        name: `假外掛 ${seq}（${CATEGORY_LABEL[category]}）`,
        version: '1.0.0',
        apiVersion: 1,
        minAppVersion: '0.0.0',
        entry: 'index.js',
        sha256: fakeSha256(id),
        description:
            `合成目錄測試資料，第 ${seq} 筆，分類為「${CATEGORY_LABEL[category]}」。` +
            `僅供外掛商店規模化驗證使用（分頁／搜尋／分類篩選），不是真的可安裝外掛。`,
        category,
        url: `http://localhost:5199/fake-plugin-${seq}/`,
    });
}

await mkdir(outDir, { recursive: true });
const storePath = join(outDir, 'store.json');
await writeFile(
    storePath,
    JSON.stringify({ apiVersion: 1, plugins }, null, 2) + '\n',
);

const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
for (const p of plugins) counts[p.category] += 1;

console.log(`已產生 ${count} 個假外掛 → ${storePath}`);
console.log('各分類分佈：', counts);
