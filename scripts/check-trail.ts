// scripts/check-trail.ts — 移動停損純數學自測（src/lib/trail.ts）
//
// 跑法：node scripts/check-trail.ts
// 全過 → exit 0；任何斷言失敗 → 列出並 exit 1。
// 方向約定：Sell 出場保護多單（追高、停在下方）；Buy 出場保護空單（追低、停在上方）。

import { nextPeak, trailHit, trailStopPrice } from '../src/lib/trail.ts';

let fails = 0;
function assert(cond: boolean, msg: string) {
    if (!cond) {
        fails++;
        console.log(`[FAIL] ${msg}`);
    } else {
        console.log(`[ok]   ${msg}`);
    }
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// --- 峰值 ratchet：只往有利方向動，不回頭 ---
assert(nextPeak('Sell', 110, 115) === 115, '多單追高：115 > 110 → 115');
assert(nextPeak('Sell', 110, 108) === 110, '多單追高：108 < 110 → 峰值不降，仍 110');
assert(nextPeak('Buy', 90, 85) === 85, '空單追低：85 < 90 → 85');
assert(nextPeak('Buy', 90, 93) === 90, '空單追低：93 > 90 → 峰值不升，仍 90');

// --- 停損價方向：多單停在下方、空單停在上方 ---
assert(near(trailStopPrice('Sell', 110, 3), 106.7), '多單 峰110 回撤3% → 停 106.7（下方）');
assert(near(trailStopPrice('Buy', 90, 3), 92.7), '空單 峰90 回撤3% → 停 92.7（上方）');

// --- 觸發判定 ---
assert(trailHit('Sell', 106.7, 106.7) === true, '多單：價=停損 → 觸發');
assert(trailHit('Sell', 106.8, 106.7) === false, '多單：價>停損 → 不觸發');
assert(trailHit('Buy', 92.7, 92.7) === true, '空單：價=停損 → 觸發');
assert(trailHit('Buy', 92.6, 92.7) === false, '空單：價<停損 → 不觸發');

// --- 情境走一遍：多單 100 進場，回撤 3% ---
{
    const pct = 3;
    let peak = 100; // 進場參考
    // 漲到 110
    peak = nextPeak('Sell', peak, 110);
    assert(peak === 110, '多單情境：漲到110，峰=110');
    // 回檔到 107：停損=106.7，未觸發
    let stop = trailStopPrice('Sell', peak, pct);
    assert(!trailHit('Sell', 107, stop), '多單情境：107 > 106.7 → 抱住不出');
    // 再跌到 106：觸發市價賣
    assert(trailHit('Sell', 106, stop), '多單情境：106 ≤ 106.7 → 觸發出場');
    // 峰值不因回檔下降
    assert(nextPeak('Sell', peak, 106) === 110, '多單情境：回檔不改峰值');
}

// --- 情境走一遍：空單 100 進場，回撤 3% ---
{
    const pct = 3;
    let peak = 100;
    peak = nextPeak('Buy', peak, 90); // 跌到 90
    assert(peak === 90, '空單情境：跌到90，峰=90');
    const stop = trailStopPrice('Buy', peak, pct); // 92.7
    assert(!trailHit('Buy', 92, stop), '空單情境：92 < 92.7 → 抱住不回補');
    assert(trailHit('Buy', 93, stop), '空單情境：93 ≥ 92.7 → 觸發回補');
}

console.log('-'.repeat(40));
if (fails > 0) {
    console.log(`總結：${fails} 個斷言失敗`);
    process.exit(1);
}
console.log('總結：全部通過');
