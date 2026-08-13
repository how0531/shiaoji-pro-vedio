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

vi.mock('../account-store', () => ({
    accountFor: vi.fn(() => undefined),
    getAccountState: vi.fn(() => ({ accounts: [] })),
    subscribeAccounts: vi.fn(() => () => {}),
}));

import { apiGet, apiPost } from '../api';
import { accountFor, getAccountState } from '../account-store';

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

    it('/api/v1/auth/accounts 被擋下，錯誤訊息指向 host.accounts', async () => {
        const host = createHost('test', { onSelectCode: () => {} });
        vi.mocked(apiGet).mockClear();

        await expect(
            host.api.get('/api/v1/auth/accounts'),
        ).rejects.toThrow(/host\.accounts/);
        expect(vi.mocked(apiGet)).not.toHaveBeenCalled();
    });

    it('/api/v1/auth/ca_expiretime 被擋下（含 query string）', async () => {
        const host = createHost('test', { onSelectCode: () => {} });
        vi.mocked(apiGet).mockClear();

        await expect(
            host.api.get('/api/v1/auth/ca_expiretime?person_id=A123456789'),
        ).rejects.toThrow(/host\.accounts/);
        expect(vi.mocked(apiGet)).not.toHaveBeenCalled();
    });
});

describe('createHost accounts', () => {
    it('current() 的投影不含 person_id 與 username', async () => {
        vi.mocked(accountFor).mockReturnValueOnce({
            account_type: 'S',
            person_id: 'A123456789',
            broker_id: '9A92',
            account_id: '9802004',
            signed: true,
            username: '王小明',
        });
        const host = createHost('test', { onSelectCode: () => {} });

        const acc = await host.accounts.current('S');

        expect(acc).toEqual({
            account_type: 'S',
            broker_id: '9A92',
            account_id: '9802004',
            signed: true,
        });
        expect(acc).not.toBeNull();
        expect(acc && 'person_id' in acc).toBe(false);
        expect(acc && 'username' in acc).toBe(false);
    });

    it('list() 的每一筆投影都不含 person_id 與 username', async () => {
        vi.mocked(getAccountState).mockReturnValueOnce({
            accounts: [
                {
                    account_type: 'S',
                    person_id: 'A123456789',
                    broker_id: '9A92',
                    account_id: '9802004',
                    signed: true,
                    username: '王小明',
                },
            ],
            selectedStock: null,
            selectedFutures: null,
            loaded: true,
        });
        const host = createHost('test', { onSelectCode: () => {} });

        const list = await host.accounts.list();

        expect(list).toHaveLength(1);
        const [first] = list;
        expect(first).toBeDefined();
        expect(first && 'person_id' in first).toBe(false);
        expect(first && 'username' in first).toBe(false);
    });

    it('accountFor 回 undefined 時 current() 回 null（讓伺服器挑預設）', async () => {
        vi.mocked(accountFor).mockReturnValueOnce(undefined);
        const host = createHost('test', { onSelectCode: () => {} });

        await expect(host.accounts.current('F')).resolves.toBeNull();
    });
});
