"""agent1_premarket_scan.py — 盤前掃描播報代理

任務：抓漲幅 / 量 / 額三張排行 → 交叉篩出「量價俱足」的候選（三榜都上、
且過門檻）→ 依序打分 → 產出一段口語化的盤前播報，並選出前 N 檔當自選候選。

這就是 AI Agent 面板裡「盤前掃描」技能的核心邏輯，改寫成可獨立執行的腳本。
跑在模擬環境，純讀取、不下單。

執行：python agent1_premarket_scan.py
"""
from __future__ import annotations

import shioaji as sj

from agent_common import g, login

# 篩選門檻（可調）
MIN_CHG_PCT = 2.0        # 漲幅 ≥ 2%
MIN_VOLUME = 1000        # 成交量（張）≥ 1000
MIN_AMOUNT = 5e7         # 成交額（元）≥ 5000 萬
TOP_N = 8                # 最後挑幾檔


def _chg_pct(row) -> float:
    """漲幅% = 漲跌額 ÷ 昨收；昨收 = 現價 − 漲跌額。"""
    close = float(g(row, "close", default=0) or 0)
    dp = float(g(row, "change_price", default=0) or 0)
    prev = close - dp
    return (dp / prev * 100.0) if prev else 0.0


def _rows(api, scanner_type, count=100):
    try:
        return api.scanners(scanner_type=scanner_type, count=count)
    except Exception as e:
        print(f"  ! {scanner_type} 取得失敗: {e!r}")
        return []


def main() -> None:
    print("== 盤前掃描播報代理 ==  (模擬環境)")
    api = login()
    try:
        chg = _rows(api, sj.constant.ScannerType.ChangePercentRank)
        vol = _rows(api, sj.constant.ScannerType.VolumeRank)
        amt = _rows(api, sj.constant.ScannerType.AmountRank)
        print(f"排行載入：漲幅 {len(chg)}、量 {len(vol)}、額 {len(amt)} 檔")

        # 以 code 建索引
        def idx(rows):
            return {g(r, "code"): r for r in rows if g(r, "code")}
        ic, iv, ia = idx(chg), idx(vol), idx(amt)

        # 交叉：三榜聯集後，逐檔用各榜資料組出 (漲幅%, 量, 額)
        cand = []
        for code in set(ic) | set(iv) | set(ia):
            r = ic.get(code) or iv.get(code) or ia.get(code)
            name = str(g(r, "name", default="")).strip()
            chg_pct = _chg_pct(r)
            volume = float(g(r, "total_volume", default=0) or 0)     # 張
            amount = float(g(r, "total_amount", default=0) or 0)     # 元
            if chg_pct >= MIN_CHG_PCT and volume >= MIN_VOLUME and amount >= MIN_AMOUNT:
                # 綜合分數：漲幅、量、額各自標準化後相加（簡單版）
                score = chg_pct + volume / 1e4 + amount / 1e9
                cand.append(dict(code=code, name=name, chg=chg_pct,
                                 vol=volume, amt=amount, score=score))

        cand.sort(key=lambda x: x["score"], reverse=True)
        picks = cand[:TOP_N]

        # 播報
        print("\n---------- 盤前播報 ----------")
        if not picks:
            print("今日排行資料量價未過門檻（可能為非交易時段）；已列出漲幅榜前幾名供參考：")
            for r in chg[:TOP_N]:
                print(f"  {g(r,'code')} {str(g(r,'name','')).strip()}  "
                      f"漲幅 {_chg_pct(r):.2f}%  量 {g(r,'total_volume',default=0):.0f}張")
        else:
            print(f"符合『量價俱足』（漲幅≥{MIN_CHG_PCT}%、量≥{MIN_VOLUME}張、"
                  f"額≥{MIN_AMOUNT/1e8:.1f}億）共 {len(cand)} 檔，精選前 {len(picks)}：")
            for i, r in enumerate(picks, 1):
                print(f"  {i}. {r['code']} {r['name']}  漲幅 {r['chg']:.2f}%  "
                      f"量 {r['vol']:.0f}張  額 {r['amt']/1e8:.1f}億")
            hot = "、".join(f"{r['code']}{r['name']}" for r in picks[:3])
            print(f"\n一句話總結：今天資金明顯往 {hot} 這幾檔集中，"
                  f"開盤可留意是否延續強勢；已將前 {len(picks)} 檔列為自選候選。")

        # 候選清單（可餵給下一個代理或加入 Shioaji 自選）
        print("\n自選候選代碼：", [r["code"] for r in picks] or [g(r, "code") for r in chg[:TOP_N]])
    finally:
        api.logout()


if __name__ == "__main__":
    main()
