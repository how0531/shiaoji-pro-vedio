// src/lib/plugins/manifest.ts — manifest 解析與相容性檢查（純函數）

import {
    HOST_API_VERSION,
    PLUGIN_PERMISSION_IDS,
    type PluginManifest,
    type PluginPermissionId,
} from './types';

const ID_RE = /^[a-z][a-z0-9-]*$/;
const VER_RE = /^\d+\.\d+\.\d+$/;
// icon 只收兩種形狀：lucide 元件名（PascalCase 英數）或 1 至 2 個字元的
// 角標。URL 與 data URI 因此自然被擋掉。
const ICON_NAME_RE = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
// 角標排除控制字元、格式字元與標記符號，manifest 是外部來源，寧可窄一點
const ICON_BADGE_DENY_RE = /[\p{Cc}\p{Cf}<>&"'`\\/]/u;
// publisher 比照 icon 角標的嚴謹度：排除控制字元、格式字元與標記符號
const PUBLISHER_DENY_RE = /[\p{Cc}\p{Cf}<>&"'`]/u;

const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(PLUGIN_PERMISSION_IDS);

function fail(field: string, why: string): never {
    throw new Error(`外掛 manifest 欄位 ${field} ${why}`);
}

function isValidIcon(icon: string): boolean {
    if (ICON_NAME_RE.test(icon)) return true;
    // 用 code point 計數，emoji（含旗幟、帶變異選擇子）才不會被誤判成過長
    const points = Array.from(icon);
    return (
        points.length >= 1 &&
        points.length <= 2 &&
        !ICON_BADGE_DENY_RE.test(icon)
    );
}

// undefined = manifest 沒宣告（舊版相容，不是「沒有權限」的宣告）
function parsePermissions(v: unknown): PluginPermissionId[] | undefined {
    if (v === undefined) return undefined;
    if (!Array.isArray(v)) fail('permissions', '必須是陣列');
    const out: PluginPermissionId[] = [];
    for (const item of v as unknown[]) {
        if (typeof item !== 'string' || !KNOWN_PERMISSIONS.has(item)) {
            const shown = typeof item === 'string' ? item.slice(0, 32) : typeof item;
            fail('permissions', `含未知權限「${shown}」`);
        }
        const id = item as PluginPermissionId;
        if (!out.includes(id)) out.push(id); // 重複宣告只留一筆，商店不重複列
    }
    return out;
}

function parseIcon(v: unknown): string | undefined {
    if (v === undefined) return undefined;
    if (typeof v !== 'string' || !isValidIcon(v)) {
        fail('icon', '必須是 lucide 圖示名稱或 1 至 2 個字元的角標');
    }
    return v;
}

function isValidPublisher(v: string): boolean {
    const points = Array.from(v);
    return (
        points.length >= 1 &&
        points.length <= 40 &&
        !PUBLISHER_DENY_RE.test(v)
    );
}

function parsePublisher(v: unknown): string | undefined {
    if (v === undefined) return undefined;
    if (typeof v !== 'string' || !isValidPublisher(v)) {
        fail('publisher', '必須是長度 40 以內、不含控制字元與標記符號的非空字串');
    }
    return v;
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
    const permissions = parsePermissions(r.permissions);
    const icon = parseIcon(r.icon);
    const publisher = parsePublisher(r.publisher);
    const manifest: PluginManifest = {
        id,
        name: str('name'),
        version,
        apiVersion: r.apiVersion,
        minAppVersion,
        entry: str('entry'),
        sha256,
        description: str('description'),
    };
    // 沒宣告就不要補上空欄位，讓「未宣告」與「宣告為空」在下游可分辨
    if (permissions) manifest.permissions = permissions;
    if (icon !== undefined) manifest.icon = icon;
    if (publisher !== undefined) manifest.publisher = publisher;
    return manifest;
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
