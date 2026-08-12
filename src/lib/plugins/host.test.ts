import { describe, expect, it, vi } from 'vitest';
import { createHost } from './host';

// Mock 所有外部依賴
vi.mock('../api', () => ({
    apiGet: vi.fn(async () => ({})),
    apiPost: vi.fn(async () => ({})),
}));

vi.mock('../activity', () => ({
    trackActivity: vi.fn(),
}));

vi.mock('../shioaji', () => ({
    resolveContract: vi.fn(async () => null),
    fetchWarrants: vi.fn(async () => []),
    subscribeQuote: vi.fn(async () => {}),
}));

vi.mock('../stream', () => ({
    ensureStream: vi.fn(),
    onAnyTick: vi.fn(() => () => {}),
}));

vi.mock('../theme-store', () => ({
    getThemeSettings: vi.fn(() => ({ mode: 'light' })),
    getChartColors: vi.fn(() => ({ up: '#00cc00', down: '#cc0000' })),
}));

import { apiGet, apiPost } from '../api';

describe('createHost API deny-list', () => {
    it('api.post(/api/v1/order/place_order) 被擋下', async () => {
        const host = createHost('test', { onSelectCode: () => {} });
        await expect(host.api.post('/api/v1/order/place_order', {})).rejects.toThrow(
            /下單/,
        );
    });

    it('api.get(/api/v1/order/cancel_order) 被擋下', async () => {
        const host = createHost('test', { onSelectCode: () => {} });
        await expect(host.api.get('/api/v1/order/cancel_order')).rejects.toThrow();
    });

    it('api.post(/api/v1/order/trades) 通過 deny-list，正常呼叫 apiPost', async () => {
        const host = createHost('test', { onSelectCode: () => {} });
        vi.mocked(apiPost).mockClear();

        await expect(host.api.post('/api/v1/order/trades', {})).resolves.toEqual({});
        expect(vi.mocked(apiPost)).toHaveBeenCalledWith(
            '/api/v1/order/trades',
            {},
        );
    });

    it('api.post(/api/v1/order/place_order) 不呼叫 apiPost', async () => {
        const host = createHost('test', { onSelectCode: () => {} });
        vi.mocked(apiPost).mockClear();

        await expect(
            host.api.post('/api/v1/order/place_order', {}),
        ).rejects.toThrow();
        expect(vi.mocked(apiPost)).not.toHaveBeenCalled();
    });

    it('deny-list 所有路徑都被擋下', async () => {
        const deniedPaths = [
            '/order/place_order',
            '/order/cancel_order',
            '/order/update_price',
            '/order/update_qty',
            '/order/place_comboorder',
            '/order/cancel_comboorder',
        ];

        for (const path of deniedPaths) {
            const host = createHost('test', { onSelectCode: () => {} });
            await expect(host.api.get(path)).rejects.toThrow();
            await expect(host.api.post(path, {})).rejects.toThrow();
        }
    });

    it('query path /api/v1/order/combotrades 通過 deny-list', async () => {
        const host = createHost('test', { onSelectCode: () => {} });
        vi.mocked(apiGet).mockClear();

        await expect(host.api.get('/api/v1/order/combotrades')).resolves.toEqual(
            {},
        );
        expect(vi.mocked(apiGet)).toHaveBeenCalledWith('/api/v1/order/combotrades');
    });
});
