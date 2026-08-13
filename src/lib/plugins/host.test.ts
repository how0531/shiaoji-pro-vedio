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
    getThemeSettings: vi.fn(() => ({ mode: 'light', convention: 'intl' })),
    getChartColors: vi.fn(() => ({ up: '#00cc00', down: '#cc0000' })),
}));

vi.mock('../account-store', () => ({
    accountFor: vi.fn(() => undefined),
    getAccountState: vi.fn(() => ({ accounts: [] })),
    selectAccount: vi.fn(),
    subscribeAccounts: vi.fn(() => () => {}),
}));

import { apiGet, apiPost } from '../api';
import { accountFor, getAccountState, selectAccount } from '../account-store';

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

describe('createHost ui.theme', () => {
    // v1 就有的 5 個欄位是外掛的既有契約，改名或改語意會讓已發佈的外掛
    // 整片破圖，所以鎖住名稱與來源。
    it('既有 5 個欄位沒被改名，值仍來自 theme-store', () => {
        const host = createHost('test', { onSelectCode: () => {} });

        const t = host.ui.theme();

        expect(t.mode).toBe('light');
        expect(t.up).toBe('#00cc00');
        expect(t.down).toBe('#cc0000');
        expect(t.text).toBe('#1a1a1a');
        expect(t.bg).toBe('#ffffff');
    });

    it('新增的顏色 token 都有值', () => {
        const host = createHost('test', { onSelectCode: () => {} });

        const t = host.ui.theme();

        const colorKeys = [
            'panel',
            'panelRaised',
            'inset',
            'hoverBg',
            'textMuted',
            'border',
            'borderStrong',
            'borderSubtle',
            'accent',
            'accentSoft',
            'upSoft',
            'downSoft',
            'flat',
            'success',
            'danger',
            'warning',
        ] as const;
        for (const key of colorKeys) {
            expect(t[key], key).toBeTruthy();
            // 顏色一律是 CSS 變數參照，主題切換時外掛不用重呼叫就跟著變
            expect(t[key], key).toMatch(/^var\(--/);
        }
    });

    it('convention 跟著 theme-store 走', () => {
        const host = createHost('test', { onSelectCode: () => {} });

        expect(host.ui.theme().convention).toBe('intl');
    });

    it('字族、字級、間距、圓角都有值', () => {
        const host = createHost('test', { onSelectCode: () => {} });

        const t = host.ui.theme();

        for (const key of ['display', 'mono', 'body'] as const) {
            expect(t.font[key], key).toBeTruthy();
        }
        for (const key of [
            'kpi',
            'stat',
            'total',
            'body',
            'label',
            'header',
            'micro',
        ] as const) {
            // 字級是 rem 字面值，跟著使用者的字級縮放走
            expect(t.fontSize[key], key).toMatch(/rem$/);
        }
        for (const key of ['xs', 'sm', 'md', 'lg', 'xl'] as const) {
            expect(t.space[key], key).toBeTruthy();
        }
        for (const key of ['sm', 'md', 'lg'] as const) {
            expect(t.radius[key], key).toBeTruthy();
        }
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

describe('createHost accounts.select', () => {
    it('select 成功後 accountFor 會回新帳戶', async () => {
        const fullAccount = {
            account_type: 'S',
            person_id: 'A123456789',
            broker_id: '9A9J',
            account_id: '9805600',
            signed: true,
            username: '王小明',
        };
        vi.mocked(getAccountState).mockReturnValueOnce({
            accounts: [fullAccount],
            selectedStock: null,
            selectedFutures: null,
            loaded: true,
        });
        vi.mocked(selectAccount).mockClear();
        const host = createHost('test', { onSelectCode: () => {} });

        await host.accounts.select({
            account_type: 'S',
            broker_id: '9A9J',
            account_id: '9805600',
            signed: true,
        });

        expect(vi.mocked(selectAccount)).toHaveBeenCalledWith(fullAccount);

        // selectAccount 是真正的全域 store，這裡的 mock 只驗證 host 有把
        // 找回來的完整 Account 交給它；current() 會回什麼則由
        // accountFor（同樣被 mock）決定，模擬 store 已切換後的狀態。
        vi.mocked(accountFor).mockReturnValueOnce(fullAccount);
        await expect(host.accounts.current('S')).resolves.toEqual({
            account_type: 'S',
            broker_id: '9A9J',
            account_id: '9805600',
            signed: true,
        });
    });

    it('select 傳入不存在的帳戶會 reject', async () => {
        vi.mocked(getAccountState).mockReturnValueOnce({
            accounts: [],
            selectedStock: null,
            selectedFutures: null,
            loaded: true,
        });
        vi.mocked(selectAccount).mockClear();
        const host = createHost('test', { onSelectCode: () => {} });

        await expect(
            host.accounts.select({
                account_type: 'S',
                broker_id: '9A9J',
                account_id: '9805600',
                signed: true,
            }),
        ).rejects.toThrow(/找不到/);
        expect(vi.mocked(selectAccount)).not.toHaveBeenCalled();
    });

    it('select 傳入未 signed 的帳戶會 reject', async () => {
        const unsignedAccount = {
            account_type: 'S',
            person_id: 'A123456789',
            broker_id: '9A9J',
            account_id: '9805600',
            signed: false,
            username: '王小明',
        };
        vi.mocked(getAccountState).mockReturnValueOnce({
            accounts: [unsignedAccount],
            selectedStock: null,
            selectedFutures: null,
            loaded: true,
        });
        vi.mocked(selectAccount).mockClear();
        const host = createHost('test', { onSelectCode: () => {} });

        await expect(
            host.accounts.select({
                account_type: 'S',
                broker_id: '9A9J',
                account_id: '9805600',
                signed: false,
            }),
        ).rejects.toThrow(/簽署/);
        expect(vi.mocked(selectAccount)).not.toHaveBeenCalled();
    });
});
