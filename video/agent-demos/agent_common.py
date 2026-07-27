"""agent_common.py — 共用登入與工具，供三個 AI 交易代理示範使用。

這些示範重現「Shioaji Pro 桌面版 AI Agent」面板背後在做的事：
用程式驅動 Shioaji API 完成盤前掃描、括號單風控、持倉監控等 agentic 任務。
全部跑在**模擬環境（simulation=True）**，不動真錢。

用法：
    from agent_common import login
    api = login()          # 讀同層或上層 .env 的 SJ_API_KEY / SJ_SEC_KEY
    ...
    api.logout()
"""
from __future__ import annotations

import os
from pathlib import Path

import shioaji as sj


def _load_env() -> dict:
    """從 .env 讀金鑰（找當前層、上一層；找不到再吃系統環境變數）。"""
    env: dict[str, str] = {}
    for base in (Path.cwd(), Path(__file__).resolve().parent, Path(__file__).resolve().parent.parent):
        f = base / ".env"
        if f.exists():
            for line in f.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    env.setdefault(k.strip(), v.strip())
    for k in ("SJ_API_KEY", "SJ_SEC_KEY"):
        env.setdefault(k, os.environ.get(k, ""))
    if not env.get("SJ_API_KEY") or not env.get("SJ_SEC_KEY"):
        raise SystemExit("找不到 SJ_API_KEY / SJ_SEC_KEY（請放在 .env 或環境變數）")
    return env


def login(fetch_contract: bool = True) -> sj.Shioaji:
    """登入模擬環境，回傳已登入的 api。"""
    env = _load_env()
    api = sj.Shioaji(simulation=True)
    api.login(api_key=env["SJ_API_KEY"], secret_key=env["SJ_SEC_KEY"],
              fetch_contract=fetch_contract)
    return api


def g(obj, *names, default=None):
    """容錯取屬性（SDK 欄位名跨版本略有差異時用）。"""
    for n in names:
        v = getattr(obj, n, None)
        if v is not None:
            return v
    return default


def mask_acct(account_id: str) -> str:
    """遮蔽帳號（示範輸出/截圖用，只留末兩碼）。"""
    s = str(account_id)
    return ("•" * max(0, len(s) - 2)) + s[-2:] if len(s) >= 2 else "••"


def tick_size(price: float) -> float:
    """台股股票跳動單位（tick）。"""
    if price < 10:
        return 0.01
    if price < 50:
        return 0.05
    if price < 100:
        return 0.1
    if price < 500:
        return 0.5
    if price < 1000:
        return 1.0
    return 5.0


def round_tick(price: float, mode: str = "nearest") -> float:
    """把價格對齊到合法跳動單位（下單前必做，否則被擋 op_code 88）。"""
    t = tick_size(price)
    import math
    n = {"floor": math.floor, "ceil": math.ceil}.get(mode, round)(price / t)
    return round(n * t, 2)
