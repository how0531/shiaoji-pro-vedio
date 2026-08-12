// scripts/hash-fixture.mjs — 讀 fixtures/plugin-hello/index.js，算 sha256，
// 回填 fixtures/plugin-hello/manifest.json 的 sha256 欄位。
// 用法：node scripts/hash-fixture.mjs

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, '..', 'fixtures', 'plugin-hello');
const entryPath = join(fixtureDir, 'index.js');
const manifestPath = join(fixtureDir, 'manifest.json');

const code = await readFile(entryPath, 'utf8');
const sha256 = createHash('sha256').update(code).digest('hex');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.sha256 = sha256;

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`已更新 ${manifestPath} 的 sha256 → ${sha256}`);
