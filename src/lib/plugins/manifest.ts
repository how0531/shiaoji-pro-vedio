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
        if (pa[i]! !== pb[i]!) return pa[i]! > pb[i]! ? 1 : -1;
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
