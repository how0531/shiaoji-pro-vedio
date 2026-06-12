// src/lib/features.ts — feature flags + tiered entitlements (public
// framework). Closed-source features live in the private modules repo and
// surface through the '@modules' manifest; this file decides WHO can use
// WHAT: every gated feature declares a required tier, the current user's
// tier comes from the closed resolver (open builds default to 'free'),
// and <FeatureGate>/useFeature() gate the UI.
//
// 規則：公開 repo 上的程式碼都是可開源的；要閉源的功能放私有 modules/，
// 要分級的功能在這裡掛 flag。

import { useSyncExternalStore } from 'react';
import { closedModules } from '@modules';
import { fetchAccounts } from './shioaji';

export type Tier = 'free' | 'vip';

// the closed manifest shape (implemented in the private repo; stubbed in
// src/modules-stub for open-source builds)
export interface ClosedModules {
    resolveTier?: (personId: string | null) => Promise<Tier>;
    agent?: {
        Panel: React.ComponentType;
        ensureScheduler: () => void;
    };
}

export interface FeatureDef {
    key: string;
    name: string;
    tier: Tier; // minimum tier required
    closed?: boolean; // implementation lives in the private modules repo
    desc: string;
}

export const FEATURES: FeatureDef[] = [
    {
        key: 'agent',
        name: 'AI Agent',
        tier: 'vip',
        closed: true,
        desc: '多供應商 agentic 對話、技能市集、排程任務、操作觀察學習',
    },
    // 之後要分級的功能（開源或閉源皆可）在這裡加一筆，UI 用
    // <FeatureGate feature='key'> 包起來即可
];

// ---- current tier store ----

let tier: Tier = 'free';
let resolved = false;
const listeners = new Set<() => void>();

async function resolve() {
    if (resolved) return;
    resolved = true;
    let personId: string | null = null;
    try {
        personId = (await fetchAccounts())[0]?.person_id ?? null;
    } catch {
        // server not up yet — resolver may not need it
    }
    try {
        const next = await closedModules.resolveTier?.(personId);
        if (next) tier = next;
    } catch {
        // keep default
    }
    listeners.forEach((l) => l());
}

export function getTier(): Tier {
    void resolve();
    return tier;
}

export function useTier(): Tier {
    return useSyncExternalStore((l) => {
        listeners.add(l);
        void resolve();
        return () => {
            listeners.delete(l);
        };
    }, getTier);
}

export type FeatureState =
    | { enabled: true }
    | { enabled: false; reason: 'vip-required' | 'desktop-only' };

export function featureState(key: string, currentTier: Tier): FeatureState {
    const def = FEATURES.find((f) => f.key === key);
    if (!def) return { enabled: true }; // unknown key — never block
    if (def.closed && !(key in closedModules)) {
        return { enabled: false, reason: 'desktop-only' };
    }
    if (def.tier === 'vip' && currentTier !== 'vip') {
        return { enabled: false, reason: 'vip-required' };
    }
    return { enabled: true };
}

export function useFeature(key: string): FeatureState {
    const currentTier = useTier();
    return featureState(key, currentTier);
}

// closed module accessors (undefined in open-source builds)
export const agentModule = closedModules.agent;
