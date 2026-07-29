// src/lib/trail.ts — trailing-stop math (pure, no browser deps so it is
// unit-testable in node). A Sell exit protects a long: it ratchets the peak
// HIGH and stops BELOW it; a Buy exit protects a short: it ratchets the peak
// LOW and stops ABOVE it. Getting this direction wrong is a money bug, so the
// logic lives here behind scripts/check-trail.ts.

import type { Action } from './types/order';

// ratchet the peak in the favourable direction: long trails the high up,
// short trails the low down. The peak never moves against the position.
export function nextPeak(action: Action, peak: number, price: number): number {
    return action === 'Sell' ? Math.max(peak, price) : Math.min(peak, price);
}

// stop price derived from the running peak and the retracement percent.
export function trailStopPrice(
    action: Action,
    peak: number,
    trailPct: number,
): number {
    return action === 'Sell'
        ? peak * (1 - trailPct / 100)
        : peak * (1 + trailPct / 100);
}

// has price retraced through the stop? Sell fires when price falls to/through
// the stop below; Buy fires when price rises to/through the stop above.
export function trailHit(action: Action, price: number, stop: number): boolean {
    return action === 'Sell' ? price <= stop : price >= stop;
}
