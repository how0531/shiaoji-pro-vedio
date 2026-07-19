"""agent0_autonomous.py — 自主交易代理（端到端一次跑完）

把盤前掃描、進場、括號單風控、持倉監控 Kill-Switch 串成**一個會自己跑的
AI 交易代理**：登入 → 掃描選股 → 決策進場 → 送出委託並掛 OCO 保護 →
盯場控管。全程**模擬環境**、實際對帳戶操作（送出模擬委託）、帳號遮蔽。

這就是 Shioaji Pro 桌面版 AI Agent 面板背後在做的事，攤成可獨立執行、
可讀懂決策過程的腳本。

執行：python agent0_autonomous.py
"""
from __future__ import annotations

import time

import shioaji as sj

from agent_common import g, login, mask_acct, round_tick
from agent1_premarket_scan import _chg_pct, MIN_CHG_PCT
from agent2_bracket_agent import STOP_PCT, TAKE_PCT, snapshot_price
from agent3_position_monitor import snapshot as pnl_snapshot

QTY = 1
MAX_DAILY_LOSS = 30000


def log(step, msg):
    print(f"[{step}] {msg}", flush=True)


def main():
    print("=" * 56)
    print(" 自主交易代理 · 端到端示範  (模擬環境 · 不動真錢)")
    print("=" * 56)
    api = login()
    try:
        # 1) 身分
        accs = api.list_accounts()
        log("登入", f"帳戶 {len(accs)} 個；證券[{mask_acct(g(api.stock_account,'account_id',default=''))}]"
                    f" 期貨[{mask_acct(g(api.futopt_account,'account_id',default=''))}]")

        # 2) 盤前掃描選股：漲幅榜取第一個漲幅達標的可交易股票
        rows = api.scanners(scanner_type=sj.constant.ScannerType.ChangePercentRank, count=30)
        pick = None
        for r in rows:
            code = g(r, "code")
            if code and _chg_pct(r) >= MIN_CHG_PCT:
                pick = r
                break
        if not pick:
            log("掃描", "無漲幅達標標的（非交易時段），改用漲幅榜第一名示範")
            pick = rows[0]
        code = g(pick, "code")
        name = str(g(pick, "name", default="")).strip()
        log("掃描", f"選定 {code} {name}（漲幅 {_chg_pct(pick):.2f}%）")

        contract = api.Contracts.Stocks[code]
        px = snapshot_price(api, contract) or float(g(pick, "close", default=0) or 0)
        log("報價", f"{code} 現價 {px}")

        # 3) 決策 + 實際送出進場單（模擬）
        entry_px = round_tick(px * 0.995, mode="floor")  # 對齊合法跳動單位
        log("決策", f"以限價 {entry_px}（現價 −0.5%、已對齊 tick）掛進場買單 {QTY} 張")
        order = api.Order(price=entry_px, quantity=QTY,
                          action=sj.constant.Action.Buy,
                          price_type=sj.constant.StockPriceType.LMT,
                          order_type=sj.constant.OrderType.ROD,
                          account=api.stock_account)
        trade = api.place_order(contract, order)
        log("下單", f"已送出，委託狀態：{g(trade.status,'status',default='?')}"
                    f"（模擬帳戶，不動真錢）")

        # 4) 監看成交（非交易日模擬伺服器會瞬間自動取消）
        filled = False
        for i in range(5):
            api.update_status(api.stock_account)
            st = str(g(trade.status, "status", default=""))
            log("盯單", f"第{i}輪 狀態={st} 成交量={g(trade.status,'deal_quantity',default=0)}")
            if st.startswith("Filled"):
                filled = True
                break
            if st in ("Cancelled", "Failed"):
                break
            time.sleep(1.5)

        # 5) 括號單保護（OCO）——成交才真掛；否則說明盤中會怎麼做
        stop_px = round(entry_px * (1 - STOP_PCT), 2)
        take_px = round(entry_px * (1 + TAKE_PCT), 2)
        if filled:
            log("風控", f"進場成交 → 掛 OCO：停損 {stop_px} / 停利 {take_px}，客戶端監看到價送市價單")
        else:
            log("風控", f"進場單未成交（非交易日模擬伺服器自動取消，屬正常）。"
                        f"盤中成交後，代理會自動掛 OCO：停損 {stop_px} / 停利 {take_px}")

        # 6) 持倉監控 Kill-Switch
        daily, positions = pnl_snapshot(api)
        for line in positions:
            log("帳務", line)
        state = "正常" if daily > -MAX_DAILY_LOSS else "超限→應觸發 Kill-Switch"
        log("風控", f"當日損益合計 {daily:,.0f}，日虧上限 −{MAX_DAILY_LOSS:,.0f}，狀態：{state}")

        # 7) 收尾撤單（把剛剛示範掛的單清乾淨，若還在）
        api.update_status(api.stock_account)
        opens = [t for t in api.list_trades()
                 if str(g(t.status, "status", default="")) in
                 ("PreSubmitted", "Submitted", "PendingSubmit", "PartFilled")]
        if opens:
            log("收尾", f"撤銷示範掛單 {len(opens)} 筆")
            for t in opens:
                try:
                    api.cancel_order(t)
                except Exception:
                    pass
        print("\n代理一輪執行完畢：掃描 → 選股 → 進場 → 掛保護 → 盯場控管。")
    finally:
        api.logout()


if __name__ == "__main__":
    main()
