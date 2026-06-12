# scripts/capture-landing-shots4.py — pass 4: dual-chart hero (加權 + 台指期)
# with privacy mode, to show off completeness on the landing page.
# Run: uv run --python 3.12 --with playwright==1.52.0 python scripts/capture-landing-shots4.py

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "docs"
BASE = "http://localhost:5173"

WS = {
    "blocks": [
        {"id": "watchlist-0", "type": "watchlist", "pin": None},
        {"id": "movers-0", "type": "movers", "pin": None},
        {"id": "chart-a", "type": "chart", "pin": None},
        {"id": "chart-b", "type": "chart", "pin": "TXFR1"},
        {"id": "dock-0", "type": "dock", "pin": None},
        {"id": "depth-0", "type": "depth", "pin": None},
        {"id": "ticket-0", "type": "ticket", "pin": None},
        {"id": "tape-0", "type": "tape", "pin": None},
    ],
    "layout": [
        {"i": "watchlist-0", "x": 0, "y": 0, "w": 4, "h": 14, "minW": 3, "minH": 6},
        {"i": "movers-0", "x": 0, "y": 14, "w": 4, "h": 11, "minW": 3, "minH": 5},
        {"i": "chart-a", "x": 4, "y": 0, "w": 8, "h": 13, "minW": 6, "minH": 7},
        {"i": "chart-b", "x": 12, "y": 0, "w": 8, "h": 13, "minW": 6, "minH": 7},
        {"i": "dock-0", "x": 4, "y": 13, "w": 16, "h": 12, "minW": 6, "minH": 5},
        {"i": "depth-0", "x": 20, "y": 0, "w": 4, "h": 7, "minW": 4, "minH": 7},
        {"i": "ticket-0", "x": 20, "y": 7, "w": 4, "h": 11, "minW": 4, "minH": 10},
        {"i": "tape-0", "x": 20, "y": 18, "w": 4, "h": 7, "minW": 3, "minH": 4},
    ],
}


def seed(page, mode):
    page.goto(BASE)
    page.evaluate(
        """([ws, mode]) => {
            localStorage.setItem('sj-pro-workspace-v2', ws);
            localStorage.setItem('sj-pro-watchlist-spark', '1');
            localStorage.setItem('sj-pro-privacy-mode', '1');
            localStorage.setItem('sj-pro-privacy-money', '1');
            localStorage.setItem('sj-pro-theme', JSON.stringify({mode, convention:'tw', fontScale:1}));
        }""",
        [json.dumps(WS), mode],
    )
    page.reload()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for mode, scheme, fname in [
            ("dark", "dark", "shot-terminal-dark.png"),
            ("light", "light", "shot-terminal-light.png"),
        ]:
            ctx = browser.new_context(
                viewport={"width": 1600, "height": 1000},
                device_scale_factor=2,
                color_scheme=scheme,
                locale="zh-TW",
                timezone_id="Asia/Taipei",
            )
            page = ctx.new_page()
            seed(page, mode)
            print("waiting for live data...", mode)
            time.sleep(18)
            page.screenshot(path=str(OUT / fname))
            print("saved", fname)
            ctx.close()
        browser.close()


if __name__ == "__main__":
    sys.exit(main())
