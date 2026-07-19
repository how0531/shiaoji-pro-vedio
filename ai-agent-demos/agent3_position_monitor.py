"""agent3_position_monitor.py — 持倉監控 Kill-Switch 代理

任務：持續監看帳戶的未實現＋已實現損益，一旦當日虧損超過上限，就自動觸發
Kill-Switch——撤掉所有還沒成交的委託並示警。這重現 Shioaji Pro 的風控
Kill Switch / 日虧上限（桌面版 AI Agent 的「盯場」型自動任務）。

執行：
  python agent3_position_monitor.py --max-loss 30000 --once
  python agent3_position_monitor.py --max-loss 30000 --interval 10   # 持續監看
"""
from __future__ import annotations

import argparse
import time

from agent_common import g, login, mask_acct


def sum_unrealized(api, account) -> float:
    total = 0.0
    try:
        for p in api.list_positions(account):
            total += float(g(p, "pnl", "unrealized_pnl", default=0) or 0)
    except Exception as e:
        print("  ! 讀持倉失敗:", repr(e)[:120])
    return total


def sum_realized_today(api, account) -> float:
    total = 0.0
    try:
        for r in api.list_profit_loss(account):
            total += float(g(r, "pnl", "profit_loss", default=0) or 0)
    except Exception:
        pass
    return total


def list_open_trades(api):
    open_ = []
    for acc in (api.stock_account, api.futopt_account):
        if not acc:
            continue
        try:
            api.update_status(acc)
        except Exception:
            pass
    for t in api.list_trades():
        st = str(g(t.status, "status", default=""))
        if st in ("PreSubmitted", "Submitted", "PartFilled", "PendingSubmit"):
            open_.append(t)
    return open_


def kill_switch(api, reason):
    print(f"\n🛑 KILL-SWITCH 觸發：{reason}")
    opens = list_open_trades(api)
    print(f"  掛單中委託 {len(opens)} 筆 → 全部撤銷")
    for t in opens:
        try:
            api.cancel_order(t)
            print(f"    撤：{g(t.contract,'code',default='?')} {g(t.order,'quantity',default='')}")
        except Exception as e:
            print("    撤單失敗:", repr(e)[:80])
    print("  （盤中亦可在此一併平倉／鎖定新單；本示範以撤單＋示警為主）")
    print("  \a")  # 終端提示音


def snapshot(api):
    positions = []
    daily = 0.0
    for tag, acc in (("證", api.stock_account), ("期", api.futopt_account)):
        if not acc:
            continue
        u = sum_unrealized(api, acc)
        r = sum_realized_today(api, acc)
        daily += u + r
        try:
            n = len(api.list_positions(acc))
        except Exception:
            n = 0
        positions.append(f"{tag}[{mask_acct(g(acc,'account_id',default=''))}] 持倉{n}檔 未實現{u:,.0f} 已實現{r:,.0f}")
    return daily, positions


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-loss", type=float, default=30000, help="日虧上限（元，正數）")
    ap.add_argument("--interval", type=int, default=10)
    ap.add_argument("--once", action="store_true")
    args = ap.parse_args()

    print(f"== 持倉監控 Kill-Switch 代理 ==  日虧上限 {args.max_loss:,.0f}（模擬環境）")
    api = login()
    try:
        while True:
            daily, positions = snapshot(api)
            for line in positions:
                print("  " + line)
            status = "正常" if daily > -args.max_loss else "超限"
            print(f"  當日損益合計：{daily:,.0f}　狀態：{status}")
            if daily <= -args.max_loss:
                kill_switch(api, f"當日虧損 {daily:,.0f} 已達上限 −{args.max_loss:,.0f}")
                break
            if args.once:
                print("  （--once 單次檢查完畢；持續監看請去掉 --once）")
                break
            time.sleep(args.interval)
    finally:
        api.logout()


if __name__ == "__main__":
    main()
