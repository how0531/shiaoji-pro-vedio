"""agent2_bracket_agent.py — 括號單自動風控代理

任務：對指定商品送出進場單 → 監看成交 → 一成交就自動掛上一組 OCO 保護：
停損（觸價→市價）與停利（觸價→市價），任一邊觸發就送出、並停止另一邊。
這重現 Shioaji Pro「括號單／客戶端觸價」的邏輯——保護單在本機監看行情、
到價才送市價單（跟桌面版 AI Agent 的自動風控技能同一套思路）。

兩種模式：
  live（預設）：真的送出進場限價單並回報狀態（盤中會成交後啟動 OCO；
               非交易日模擬伺服器會瞬間自動取消，屬正常）。
  --demo      ：假設已於現價成交，直接跑 OCO 監看迴圈（讀快照判斷到價），
               在非交易日也能示範「到價才送單」的完整決策流程。

執行：
  python agent2_bracket_agent.py 2317 --qty 1
  python agent2_bracket_agent.py 2317 --demo
"""
from __future__ import annotations

import argparse
import time

import shioaji as sj

from agent_common import g, login, round_tick

STOP_PCT = 0.03      # 停損：進場價 −3%
TAKE_PCT = 0.05      # 停利：進場價 +5%
POLL_SEC = 3
MAX_LOOP = 20        # demo 監看迴圈上限


def snapshot_price(api, contract) -> float | None:
    try:
        s = api.snapshots([contract])[0]
        return float(g(s, "close", "price", default=0) or 0) or None
    except Exception:
        return None


def market_sell(api, contract, qty):
    """送出市價賣出（保護性出場）。"""
    order = api.Order(
        price=0, quantity=qty,
        action=sj.constant.Action.Sell,
        price_type=sj.constant.StockPriceType.MKT,
        order_type=sj.constant.OrderType.IOC,
        account=api.stock_account,
    )
    return api.place_order(contract, order)


def run_oco(api, contract, qty, entry_px):
    stop_px = round(entry_px * (1 - STOP_PCT), 2)
    take_px = round(entry_px * (1 + TAKE_PCT), 2)
    print(f"  掛上 OCO 保護：停損 {stop_px}（−{STOP_PCT*100:.0f}%）／停利 {take_px}（+{TAKE_PCT*100:.0f}%）")
    print(f"  客戶端監看行情中……（每 {POLL_SEC}s 檢查一次；只在程式開著時有效）")
    for i in range(MAX_LOOP):
        px = snapshot_price(api, contract)
        if px is None:
            print(f"    [{i}] 取不到即時價（非交易時段），略過"); time.sleep(POLL_SEC); continue
        print(f"    [{i}] 現價 {px}")
        if px <= stop_px:
            print(f"  ▼ 觸發停損（{px} ≤ {stop_px}）→ 送出市價賣出")
            market_sell(api, contract, qty); return "stop"
        if px >= take_px:
            print(f"  ▲ 觸發停利（{px} ≥ {take_px}）→ 送出市價賣出")
            market_sell(api, contract, qty); return "take"
        time.sleep(POLL_SEC)
    print("  監看迴圈結束（示範上限），未觸價。")
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("code", nargs="?", default="2317")
    ap.add_argument("--qty", type=int, default=1)
    ap.add_argument("--demo", action="store_true", help="假設已成交，直接跑 OCO 邏輯")
    args = ap.parse_args()

    print(f"== 括號單自動風控代理 ==  商品 {args.code} × {args.qty}（模擬環境）")
    api = login()
    try:
        contract = api.Contracts.Stocks[args.code]
        if contract is None:
            print("找不到商品"); return
        px = snapshot_price(api, contract) or float(g(contract, "reference", default=0) or 0)
        print(f"參考現價：{px}")

        if args.demo:
            print("[demo] 假設進場單已於現價成交，啟動 OCO 保護：")
            run_oco(api, contract, args.qty, px)
            return

        # live：送出進場限價單（略低於現價，模擬掛單等成交）
        entry_px = round_tick(px * 0.995, mode="floor") if px else 0
        order = api.Order(
            price=entry_px, quantity=args.qty,
            action=sj.constant.Action.Buy,
            price_type=sj.constant.StockPriceType.LMT,
            order_type=sj.constant.OrderType.ROD,
            account=api.stock_account,
        )
        trade = api.place_order(contract, order)
        print(f"送出進場單 @ {entry_px}，狀態：{g(trade.status, 'status', default='?')}")
        # 監看成交
        for i in range(10):
            api.update_status(api.stock_account)
            st = g(trade.status, "status", default="")
            deal = g(trade.status, "deal_quantity", default=0)
            print(f"  [{i}] 狀態={st} 成交量={deal}")
            if str(st) in ("Filled", "Filled ") or (deal and int(deal) >= args.qty):
                print("進場成交！啟動 OCO 保護：")
                run_oco(api, contract, args.qty, entry_px)
                break
            if str(st) in ("Cancelled", "Failed"):
                print("進場單已取消/失敗（非交易日模擬伺服器會瞬間自動取消，屬正常）。")
                print("→ 若在盤中成交，接下來就會自動掛上 OCO 停損停利（見 --demo 模式）。")
                break
            time.sleep(2)
    finally:
        api.logout()


if __name__ == "__main__":
    main()
