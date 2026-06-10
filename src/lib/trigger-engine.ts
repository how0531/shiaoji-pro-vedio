// src/lib/trigger-engine.ts — client-side stop-loss / take-profit triggers.
// Watches the SSE tick stream; when a trigger's condition crosses, it fires
// a market order and removes itself. Triggers persist in localStorage but
// only run while the app is open (client-side engine).

import { useSyncExternalStore } from 'react';
import { ensureContract } from './contracts-cache';
import { onAnyTick } from './stream';
import { notify, placeQuickOrder } from './trade';
import type { Action } from './types/order';

export interface TriggerOrder {
    id: string;
    code: string; // display code (matches quote-store code)
    condition: 'below' | 'above'; // fire when last <= / >= price
    price: number;
    action: Action;
    quantity: number;
    kind: 'stop' | 'take';
}

const STORAGE_KEY = 'sj-pro-triggers';

function load(): TriggerOrder[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) return arr as TriggerOrder[];
        }
    } catch {
        // corrupted — start clean
    }
    return [];
}

let triggers: TriggerOrder[] = load();
const listeners = new Set<() => void>();
const firing = new Set<string>();

function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(triggers));
    listeners.forEach((l) => l());
}

export function addTrigger(t: Omit<TriggerOrder, 'id'>): TriggerOrder {
    const trigger: TriggerOrder = {
        ...t,
        id: `tg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    triggers = [...triggers, trigger];
    persist();
    notify({
        kind: 'info',
        title: trigger.kind === 'stop' ? '⛔ 停損單已掛' : '🎯 停利單已掛',
        body: `${trigger.code} 觸價 ${trigger.condition === 'below' ? '≤' : '≥'} ${trigger.price} → 市價${trigger.action === 'Buy' ? '買' : '賣'} ${trigger.quantity}`,
    });
    return trigger;
}

export function removeTrigger(id: string) {
    triggers = triggers.filter((t) => t.id !== id);
    persist();
}

export function getTriggers(): TriggerOrder[] {
    return triggers;
}

export function useTriggers(): TriggerOrder[] {
    return useSyncExternalStore(
        (l) => {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        () => triggers,
    );
}

async function fire(t: TriggerOrder, lastPrice: number) {
    if (firing.has(t.id)) return;
    firing.add(t.id);
    removeTrigger(t.id);
    try {
        const contract = await ensureContract(t.code);
        const trade = await placeQuickOrder(
            contract,
            t.action,
            null,
            t.quantity,
        );
        notify({
            kind: 'ok',
            title: t.kind === 'stop' ? '⛔ 停損觸發' : '🎯 停利觸發',
            body: `${t.code} @${lastPrice} → 市價${t.action === 'Buy' ? '買' : '賣'} ${t.quantity} (${trade.status.status})`,
        });
    } catch (e) {
        notify({
            kind: 'err',
            title: '觸價單送單失敗',
            body: `${t.code} ${e instanceof Error ? e.message : String(e)}`,
        });
    } finally {
        firing.delete(t.id);
    }
}

let engineStarted = false;
export function startTriggerEngine() {
    if (engineStarted) return;
    engineStarted = true;
    onAnyTick((tick) => {
        if (triggers.length === 0) return;
        const price = Number(tick.close);
        if (!Number.isFinite(price)) return;
        for (const t of triggers) {
            if (t.code !== tick.code) continue;
            if (
                (t.condition === 'below' && price <= t.price) ||
                (t.condition === 'above' && price >= t.price)
            ) {
                void fire(t, price);
            }
        }
    });
}
