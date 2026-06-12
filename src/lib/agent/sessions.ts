// src/lib/agent/sessions.ts — chat session persistence: every conversation
// autosaves; sessions can be resumed, forked (whole or from a message), and
// deleted — Claude Code / Codex style. Provider-agnostic: a session started
// on Claude can resume on Codex; tool results are NOT replayed (market data
// goes stale — the agent re-queries live instead).
//
// Storage: on desktop (Tauri) sessions live in a real file on disk
// (sessions.json in the app data dir, via plugin-store) so they survive,
// sync across windows, and aren't bound by the localStorage quota. In the
// browser preview we fall back to localStorage. The in-memory cache keeps
// the read API synchronous; disk hydrate/flush happen async around it.

import { isTauri } from '../runtime';
import type { AgentBlock, AgentProvider } from './types';

export interface ChatTurn {
    role: 'user' | 'assistant';
    blocks: AgentBlock[];
}

export interface ChatSession {
    id: string;
    title: string;
    provider: AgentProvider;
    model: string;
    createdAt: number;
    updatedAt: number;
    turns: ChatTurn[];
}

const KEY = 'sj-agent-sessions-v1';
const CURRENT_KEY = 'sj-agent-current-session';
const STORE_FILE = 'sessions.json';
const MAX_SESSIONS = 60;
const MAX_TURNS = 300;

let cache: ChatSession[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function sanitize(arr: unknown): ChatSession[] {
    return Array.isArray(arr)
        ? (arr as ChatSession[]).filter(
              (s) => s && typeof s.id === 'string' && Array.isArray(s.turns),
          )
        : [];
}

// ---- disk-backed store (desktop) ----

let storePromise: Promise<unknown> | null = null;
async function tauriStore() {
    if (!storePromise) {
        storePromise = import('@tauri-apps/plugin-store').then(
            ({ LazyStore }) => new LazyStore(STORE_FILE),
        );
    }
    return storePromise as Promise<{
        get<T>(k: string): Promise<T | undefined>;
        set(k: string, v: unknown): Promise<void>;
        save(): Promise<void>;
    }>;
}

// load persisted sessions into the cache once at startup
export async function hydrateSessions(): Promise<void> {
    if (hydrated) return;
    let fromDisk: ChatSession[] = [];
    try {
        if (isTauri) {
            const store = await tauriStore();
            fromDisk = sanitize(await store.get<ChatSession[]>('sessions'));
        } else {
            fromDisk = sanitize(JSON.parse(localStorage.getItem(KEY) || '[]'));
        }
    } catch {
        fromDisk = [];
    }
    // merge by id — anything saved before disk finished loading wins if newer
    const byId = new Map<string, ChatSession>();
    for (const s of fromDisk) byId.set(s.id, s);
    for (const s of cache) {
        const prev = byId.get(s.id);
        if (!prev || s.updatedAt >= prev.updatedAt) byId.set(s.id, s);
    }
    const hadPending = cache.length > 0;
    cache = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    hydrated = true;
    if (hadPending) void flush(); // persist the merge
    listeners.forEach((l) => l());
}

export function isHydrated(): boolean {
    return hydrated;
}

// serialize disk writes — coalesce rapid autosaves into one flush
let flushing = false;
let flushAgain = false;
async function flush() {
    if (flushing) {
        flushAgain = true;
        return;
    }
    flushing = true;
    try {
        if (isTauri) {
            const store = await tauriStore();
            await store.set('sessions', cache);
            await store.save();
        } else {
            for (let keep = cache.length; keep >= 1; keep = Math.floor(keep / 2)) {
                try {
                    localStorage.setItem(KEY, JSON.stringify(cache.slice(0, keep)));
                    break;
                } catch {
                    // quota — halve and retry
                }
            }
        }
    } finally {
        flushing = false;
        if (flushAgain) {
            flushAgain = false;
            void flush();
        }
    }
}

function load(): ChatSession[] {
    return cache;
}

function persist() {
    // newest first, capped
    cache.sort((a, b) => b.updatedAt - a.updatedAt);
    cache = cache.slice(0, MAX_SESSIONS);
    void flush();
    listeners.forEach((l) => l());
}

// kick off disk load immediately (no-op until first await resolves)
void hydrateSessions();

export function subscribeSessions(l: () => void): () => void {
    listeners.add(l);
    return () => {
        listeners.delete(l);
    };
}

export function listSessions(): ChatSession[] {
    return [...load()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSession(id: string): ChatSession | null {
    return load().find((s) => s.id === id) ?? null;
}

export function newSessionId(): string {
    return `cs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function titleFrom(turns: ChatTurn[]): string {
    for (const t of turns) {
        if (t.role !== 'user') continue;
        const text = t.blocks
            .map((b) => (b.type === 'text' ? b.text : ''))
            .join(' ')
            .trim();
        if (text) return text.length > 26 ? `${text.slice(0, 26)}…` : text;
    }
    return '新對話';
}

export function saveSession(
    s: Omit<ChatSession, 'title' | 'updatedAt'> & { title?: string },
) {
    const all = load();
    const turns = s.turns.slice(-MAX_TURNS);
    const existing = all.find((x) => x.id === s.id);
    const next: ChatSession = {
        ...s,
        turns,
        title: s.title || existing?.title || titleFrom(turns),
        updatedAt: Date.now(),
        createdAt: existing?.createdAt ?? s.createdAt,
    };
    if (existing) Object.assign(existing, next);
    else all.push(next);
    persist();
}

export function deleteSession(id: string) {
    cache = load().filter((s) => s.id !== id);
    if (getCurrentSessionId() === id) setCurrentSessionId('');
    persist();
}

// fork: duplicate a session (optionally only up to turn index, exclusive)
export function forkSession(id: string, uptoTurn?: number): ChatSession | null {
    const src = getSession(id);
    if (!src) return null;
    const turns =
        uptoTurn === undefined
            ? structuredClone(src.turns)
            : structuredClone(src.turns.slice(0, uptoTurn));
    const fork: ChatSession = {
        ...src,
        id: newSessionId(),
        title: `${(src.title || titleFrom(src.turns)).replace(/（分岔）$/, '')}（分岔）`,
        turns,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    load().push(fork);
    persist();
    return fork;
}

export function getCurrentSessionId(): string {
    try {
        return localStorage.getItem(CURRENT_KEY) ?? '';
    } catch {
        return '';
    }
}

export function setCurrentSessionId(id: string) {
    try {
        if (id) localStorage.setItem(CURRENT_KEY, id);
        else localStorage.removeItem(CURRENT_KEY);
    } catch {
        // session only
    }
}

// flatten saved turns into provider-agnostic replay history; tool calls are
// noted by name only — results are stale market data the agent re-queries
export function historyForPreload(
    turns: ChatTurn[],
): { role: 'user' | 'assistant'; text: string }[] {
    const out: { role: 'user' | 'assistant'; text: string }[] = [];
    for (const t of turns) {
        const parts: string[] = [];
        for (const b of t.blocks) {
            if (b.type === 'text' && b.text.trim()) parts.push(b.text.trim());
            else if (b.type === 'tool') parts.push(`（呼叫了 ${b.name}）`);
            else if (b.type === 'proposal')
                parts.push(
                    `（提案：${b.proposal.action === 'Buy' ? '買' : '賣'} ${b.proposal.code} × ${b.proposal.quantity}）`,
                );
        }
        const text = parts.join('\n');
        if (!text) continue;
        const last = out[out.length - 1];
        if (last && last.role === t.role) last.text += `\n${text}`;
        else out.push({ role: t.role, text });
    }
    return out;
}
