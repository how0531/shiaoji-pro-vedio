// scripts/serve-plugins.mjs — node http 靜態伺服外掛 fixture 目錄（端到端
// 煙霧測試用），預設伺服 fixtures/ 於 5199。所有回應加
// Access-Control-Allow-Origin: * 讓 app（不同 origin，如 5173）能直接 fetch。
//
// 用法：
//   node scripts/serve-plugins.mjs            → 伺服 fixtures/ 於 5199
//   node scripts/serve-plugins.mjs ./some-dir  → 伺服指定目錄於 5199

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 5199;

const rootArg = process.argv[2];
const root = rootArg
    ? resolve(process.cwd(), rootArg)
    : resolve(__dirname, '..', 'fixtures');

const MIME = {
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const pathname = decodeURIComponent(url.pathname);

    // 防止 path traversal：normalize 後必須仍在 root 之下
    const filePath = normalize(join(root, pathname));
    if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    try {
        const s = await stat(filePath);
        if (!s.isFile()) throw new Error('not a file');
        const body = await readFile(filePath);
        const type = MIME[extname(filePath)] ?? 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(body);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found: ' + pathname);
    }
});

server.listen(PORT, () => {
    console.log(
        `外掛靜態伺服器啟動：http://localhost:${PORT}/（根目錄 ${root}）`,
    );
});
