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
