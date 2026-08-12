import { describe, expect, it } from 'vitest';
import { sha256Hex } from './loader';

describe('sha256Hex', () => {
    it('已知向量', async () => {
        // echo -n 'abc' | sha256sum
        expect(await sha256Hex('abc')).toBe(
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
        );
    });
    it('空字串', async () => {
        expect(await sha256Hex('')).toBe(
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        );
    });
});
