// src/lib/runtime.ts — environment detection (zero dependencies; safe to
// import from anywhere without cycles)

export const isTauri =
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// The shioaji server may run on a non-default port when 8080 is occupied —
// the chosen port is persisted here and read by every API/SSE consumer.
const PORT_KEY = 'sj-pro-api-port';

export function getApiPort(): number {
    try {
        const p = Number(localStorage.getItem(PORT_KEY));
        if (Number.isInteger(p) && p > 0 && p < 65536) return p;
    } catch {
        // storage unavailable
    }
    return 8080;
}

// returns true when the port actually changed (caller should reload)
export function setApiPort(port: number): boolean {
    const changed = getApiPort() !== port;
    try {
        localStorage.setItem(PORT_KEY, String(port));
    } catch {
        // storage unavailable
    }
    return changed;
}

// In Tauri the frontend is served from tauri://localhost — API calls must
// target the local shioaji server explicitly.
export function getApiBase(): string {
    const env = import.meta.env.VITE_API_BASE as string | undefined;
    if (env) return env;
    return isTauri ? `http://127.0.0.1:${getApiPort()}` : '';
}
