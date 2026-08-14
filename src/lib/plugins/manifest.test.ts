import { describe, expect, it } from 'vitest';
import { checkCompat, cmpVersion, parseManifest } from './manifest';
import {
    PLUGIN_CATEGORIES,
    PLUGIN_PERMISSION_IDS,
    PLUGIN_PERMISSIONS,
} from './types';
import { PANEL_CATEGORIES } from '../workspace';

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
    it('minAppVersion 非 x.y.z 格式', () => {
        expect(() =>
            parseManifest({ ...VALID, minAppVersion: '1.0' }),
        ).toThrow(/minAppVersion/);
    });
    it('apiVersion 非數字', () => {
        expect(() => parseManifest({ ...VALID, apiVersion: '1' })).toThrow(
            /apiVersion/,
        );
    });
    it('sha256 非 64 位 hex', () => {
        expect(() =>
            parseManifest({ ...VALID, sha256: 'zz'.repeat(32) }),
        ).toThrow(/sha256/);
    });
    it('缺 name 欄位', () => {
        const { name: _name, ...missing } = VALID;
        expect(() => parseManifest(missing)).toThrow(/name/);
    });
});

describe('parseManifest：permissions', () => {
    it('接受已知權限並保留順序', () => {
        const m = parseManifest({
            ...VALID,
            permissions: ['order-history-read', 'portfolio-read'],
        });
        expect(m.permissions).toEqual(['order-history-read', 'portfolio-read']);
    });
    it('重複宣告只留一筆', () => {
        const m = parseManifest({
            ...VALID,
            permissions: ['market-data', 'market-data', 'ui-navigate'],
        });
        expect(m.permissions).toEqual(['market-data', 'ui-navigate']);
    });
    it('空陣列＝宣告不需要任何權限', () => {
        const m = parseManifest({ ...VALID, permissions: [] });
        expect(m.permissions).toEqual([]);
    });
    it('未知 permission 要拒絕', () => {
        expect(() =>
            parseManifest({ ...VALID, permissions: ['place-order'] }),
        ).toThrow(/permissions/);
    });
    it('非字串元素要拒絕', () => {
        expect(() =>
            parseManifest({ ...VALID, permissions: [{ id: 'market-data' }] }),
        ).toThrow(/permissions/);
    });
    it('permissions 非陣列要拒絕', () => {
        expect(() =>
            parseManifest({ ...VALID, permissions: 'market-data' }),
        ).toThrow(/permissions/);
    });
    it('每個宣告的 id 都查得到文案', () => {
        const m = parseManifest({
            ...VALID,
            permissions: [...PLUGIN_PERMISSION_IDS],
        });
        for (const id of m.permissions ?? []) {
            expect(PLUGIN_PERMISSIONS[id].label).not.toBe('');
        }
    });
    it('缺 permissions 仍通過且不補欄位（向後相容）', () => {
        const m = parseManifest(VALID);
        expect('permissions' in m).toBe(false);
    });
});

describe('parseManifest：permissionNotes', () => {
    it('接受對得上 permissions 的情境說明', () => {
        const m = parseManifest({
            ...VALID,
            permissions: ['portfolio-read', 'market-data'],
            permissionNotes: {
                'portfolio-read': '只用來讀融資融券庫存算維持率。',
            },
        });
        expect(m.permissionNotes).toEqual({
            'portfolio-read': '只用來讀融資融券庫存算維持率。',
        });
    });
    it('允許只寫其中幾條（Partial）', () => {
        const m = parseManifest({
            ...VALID,
            permissions: ['portfolio-read', 'market-data'],
            permissionNotes: { 'market-data': '查商品基本資料。' },
        });
        expect(Object.keys(m.permissionNotes ?? {})).toEqual(['market-data']);
    });
    it('孤兒 key（未出現在 permissions）要拒絕', () => {
        expect(() =>
            parseManifest({
                ...VALID,
                permissions: ['market-data'],
                permissionNotes: { 'account-switch': '幫你切到融資戶。' },
            }),
        ).toThrow(/permissionNotes/);
    });
    it('沒宣告 permissions 卻寫 notes 要拒絕', () => {
        expect(() =>
            parseManifest({
                ...VALID,
                permissionNotes: { 'market-data': '查商品基本資料。' },
            }),
        ).toThrow(/permissionNotes/);
    });
    it('未知權限 key 要拒絕', () => {
        expect(() =>
            parseManifest({
                ...VALID,
                permissions: ['market-data'],
                permissionNotes: { 'place-order': '幫你下單。' },
            }),
        ).toThrow(/permissionNotes/);
    });
    it('接受剛好 80 字、拒絕 81 字', () => {
        const ok = '維'.repeat(80);
        expect(
            parseManifest({
                ...VALID,
                permissions: ['market-data'],
                permissionNotes: { 'market-data': ok },
            }).permissionNotes?.['market-data'],
        ).toBe(ok);
        expect(() =>
            parseManifest({
                ...VALID,
                permissions: ['market-data'],
                permissionNotes: { 'market-data': '維'.repeat(81) },
            }),
        ).toThrow(/permissionNotes/);
    });
    it('拒絕換行與雙向覆寫字元', () => {
        for (const bad of ['第一行\n第二行', '正常‮反向']) {
            expect(() =>
                parseManifest({
                    ...VALID,
                    permissions: ['market-data'],
                    permissionNotes: { 'market-data': bad },
                }),
            ).toThrow(/permissionNotes/);
        }
    });
    it('拒絕空字串、純空白與非字串', () => {
        for (const bad of ['', '   ', 42]) {
            expect(() =>
                parseManifest({
                    ...VALID,
                    permissions: ['market-data'],
                    permissionNotes: { 'market-data': bad },
                }),
            ).toThrow(/permissionNotes/);
        }
    });
    it('允許引號與中文括號（比 publisher 寬鬆）', () => {
        const note = '只讀「融資融券」庫存，不碰其他資料。';
        expect(
            parseManifest({
                ...VALID,
                permissions: ['portfolio-read'],
                permissionNotes: { 'portfolio-read': note },
            }).permissionNotes?.['portfolio-read'],
        ).toBe(note);
    });
    it('permissionNotes 非物件或陣列要拒絕', () => {
        expect(() =>
            parseManifest({ ...VALID, permissionNotes: '理由' }),
        ).toThrow(/permissionNotes/);
        expect(() => parseManifest({ ...VALID, permissionNotes: [] })).toThrow(
            /permissionNotes/,
        );
    });
    it('缺 permissionNotes 仍通過且不補欄位（向後相容）', () => {
        const m = parseManifest({ ...VALID, permissions: ['market-data'] });
        expect('permissionNotes' in m).toBe(false);
    });
});

describe('parseManifest：icon', () => {
    it('接受 lucide 圖示名稱', () => {
        expect(parseManifest({ ...VALID, icon: 'Receipt' }).icon).toBe(
            'Receipt',
        );
    });
    it('接受 emoji 角標', () => {
        expect(parseManifest({ ...VALID, icon: '📄' }).icon).toBe('📄');
    });
    it('接受兩字元文字角標', () => {
        expect(parseManifest({ ...VALID, icon: '權證' }).icon).toBe('權證');
    });
    it('拒絕三字元以上的非圖示名稱', () => {
        expect(() => parseManifest({ ...VALID, icon: '對帳單' })).toThrow(
            /icon/,
        );
    });
    it('拒絕 URL 與 data URI', () => {
        expect(() =>
            parseManifest({ ...VALID, icon: 'https://evil.test/x.svg' }),
        ).toThrow(/icon/);
        expect(() =>
            parseManifest({ ...VALID, icon: 'data:image/svg+xml,<svg/>' }),
        ).toThrow(/icon/);
    });
    it('拒絕標記符號', () => {
        expect(() => parseManifest({ ...VALID, icon: '<>' })).toThrow(/icon/);
    });
    it('拒絕空字串與非字串', () => {
        expect(() => parseManifest({ ...VALID, icon: '' })).toThrow(/icon/);
        expect(() => parseManifest({ ...VALID, icon: 42 })).toThrow(/icon/);
    });
    it('缺 icon 仍通過且不補欄位（向後相容）', () => {
        expect('icon' in parseManifest(VALID)).toBe(false);
    });
});

describe('parseManifest：publisher', () => {
    it('接受合法發佈者名稱', () => {
        expect(
            parseManifest({ ...VALID, publisher: '永豐金證券' }).publisher,
        ).toBe('永豐金證券');
    });
    it('接受剛好 40 字元', () => {
        const name = '永'.repeat(40);
        expect(parseManifest({ ...VALID, publisher: name }).publisher).toBe(
            name,
        );
    });
    it('拒絕超過 40 字元', () => {
        expect(() =>
            parseManifest({ ...VALID, publisher: '永'.repeat(41) }),
        ).toThrow(/publisher/);
    });
    it('拒絕空字串', () => {
        expect(() => parseManifest({ ...VALID, publisher: '' })).toThrow(
            /publisher/,
        );
    });
    it('拒絕非字串', () => {
        expect(() => parseManifest({ ...VALID, publisher: 42 })).toThrow(
            /publisher/,
        );
    });
    it('拒絕控制字元', () => {
        expect(() =>
            parseManifest({ ...VALID, publisher: 'abc\tdef' }),
        ).toThrow(/publisher/);
    });
    it('拒絕標記符號', () => {
        for (const bad of ['<script>', 'A&B', `it's`, '"x"', '`x`']) {
            expect(() =>
                parseManifest({ ...VALID, publisher: bad }),
            ).toThrow(/publisher/);
        }
    });
    it('缺 publisher 仍通過且不補欄位（向後相容）', () => {
        expect('publisher' in parseManifest(VALID)).toBe(false);
    });
});

describe('parseManifest：category', () => {
    it('接受合法分類', () => {
        expect(parseManifest({ ...VALID, category: 'account' }).category).toBe(
            'account',
        );
    });
    it('五個 key 都被接受', () => {
        for (const { key } of PLUGIN_CATEGORIES) {
            expect(parseManifest({ ...VALID, category: key }).category).toBe(
                key,
            );
        }
    });
    it('未知分類要拒絕', () => {
        expect(() =>
            parseManifest({ ...VALID, category: 'crypto' }),
        ).toThrow(/category/);
    });
    it('非字串要拒絕', () => {
        expect(() => parseManifest({ ...VALID, category: 42 })).toThrow(
            /category/,
        );
    });
    it('缺 category 仍通過且不補欄位（向後相容）', () => {
        const m = parseManifest(VALID);
        expect('category' in m).toBe(false);
    });
});

describe('分類一致性守衛', () => {
    // PLUGIN_CATEGORIES（商店分類）與 PANEL_CATEGORIES（面板分類）現在
    // 刻意保持一致：外掛裝完就是變成面板，使用者不該在兩個地方看到不同的
    // 分類語彙。這個測試防止未來有人只改一邊造成靜默漂移。
    //
    // 將來若要刻意讓兩者分家（例如商店長出面板體系沒有的分類），改這個
    // 測試本身以反映新的設計意圖，而不是刪掉它。
    it('PLUGIN_CATEGORIES 的 key 集合與 PANEL_CATEGORIES 相同', () => {
        const pluginKeys = new Set(PLUGIN_CATEGORIES.map((c) => c.key));
        const panelKeys = new Set(PANEL_CATEGORIES.map((c) => c.key));
        expect(pluginKeys).toEqual(panelKeys);
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
