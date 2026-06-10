// src/lib/trade.ts — one-shot order helper + in-app notification channel

import { placeFuturesOrder, placeStockOrder } from './shioaji';
import type { ContractBase } from './types/contract';
import type { Action, Trade } from './types/order';

export interface AppNotice {
    kind: 'ok' | 'err' | 'info';
    title: string;
    body: string;
}

const noticeListeners = new Set<(n: AppNotice) => void>();

export function onNotice(listener: (n: AppNotice) => void) {
    noticeListeners.add(listener);
    return () => {
        noticeListeners.delete(listener);
    };
}

export function notify(n: AppNotice) {
    noticeListeners.forEach((l) => l(n));
}

export function isFuturesContract(contract: ContractBase): boolean {
    return (
        contract.security_type === 'FUT' || contract.security_type === 'OPT'
    );
}

// price === null → market order (futures MKT/IOC, stocks MKT/IOC)
export async function placeQuickOrder(
    contract: ContractBase,
    action: Action,
    price: number | null,
    quantity: number,
): Promise<Trade> {
    const market = price === null;
    const trade = isFuturesContract(contract)
        ? await placeFuturesOrder(contract, {
              action,
              price: market ? 0 : price,
              quantity,
              price_type: market ? 'MKT' : 'LMT',
              order_type: market ? 'IOC' : 'ROD',
              octype: 'Auto',
          })
        : await placeStockOrder(contract, {
              action,
              price: market ? 0 : price,
              quantity,
              price_type: market ? 'MKT' : 'LMT',
              order_type: market ? 'IOC' : 'ROD',
              order_lot: 'Common',
          });
    return trade;
}
