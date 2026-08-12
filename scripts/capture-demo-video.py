# scripts/capture-demo-video.py — record a DEMO VIDEO of the live app driving
# itself through the intro-video storyboard, using Playwright's built-in video
# recorder. Same pattern as capture-landing-shots.py, but records .webm instead
# of stills. The clip is your "實際操作的畫面" for the intro video — no manual
# clicking, runs against the SIMULATION server so no real money moves.
#
# Prereq (on YOUR machine, not here):
#   1) shioaji server start           # simulation mode, :8080
#   2) pnpm dev                        # app on :5173 (proxies /api -> :8080)
#   3) uv run --with playwright python3 scripts/capture-demo-video.py
#      (first run also: uv run --with playwright playwright install chromium)
#
# Output:
#   docs/demo-raw/<random>.webm   ← one continuous recording
#   console prints each scene's START timestamp so you can cut in your editor.
#
# Convert to mp4 (needs ffmpeg):
#   ffmpeg -i docs/demo-raw/*.webm -c:v libx264 -crf 18 -pix_fmt yuv420p demo.mp4
#
# The scene timings mirror video-assets/影片腳本與分鏡.md. Tune the SETTLE /
# HOLD constants to match your narration pace; everything is paced by sleeps so
# the recording lands close to the storyboard without post-trimming.

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "docs" / "demo-raw"
OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:5173"

W, H = 1920, 1080            # 16:9 for the main cut
DATA_WAIT = 16               # seconds to let live data warm up before recording
t0 = None                    # recording start wall-clock, set after data warmup


def scene(label, hold):
    """Print the scene's start offset (for editor cut points), then hold."""
    off = time.time() - t0 if t0 else 0.0
    print(f"[{off:6.1f}s] ▶ {label}")
    time.sleep(hold)


def add_panel(page, name):
    """Open the ＋新增面板 menu and add the panel whose label contains `name`."""
    page.get_by_role("button", name="＋ 新增面板").click()
    time.sleep(0.5)
    page.locator("button", has_text=name).last.click()   # may carry （已存在）
    time.sleep(1.0)


def try_click_text(page, text, exact=True, pause=1.5):
    try:
        page.get_by_text(text, exact=exact).first.click()
        time.sleep(pause)
        return True
    except Exception as e:
        print(f"   · click '{text}' skipped: {e}")
        return False


def open_header_menu(page, name, pause=1.5):
    try:
        page.get_by_role("button", name=name).first.click()
        time.sleep(pause)
        return True
    except Exception as e:
        print(f"   · header menu '{name}' skipped: {e}")
        return False


def main():
    global t0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": W, "height": H},
            record_video_dir=str(OUT),
            record_video_size={"width": W, "height": H},
            device_scale_factor=1,
            color_scheme="dark",
            locale="zh-TW",
            timezone_id="Asia/Taipei",
        )
        page = ctx.new_page()
        page.goto(BASE)
        print("warming up live data…")
        time.sleep(DATA_WAIT)
        t0 = time.time()

        # Scene 2 — hero: default dark terminal, let it breathe
        scene("Hero — 終端全景（模擬環境徽章）", 6)

        # Scene 3 — 盤前掃描: heatmap drill-in
        scene("盤前 — 類股熱力圖", 1)
        add_panel(page, "類股熱力圖")
        time.sleep(4)                      # sectors load
        # drill into the strongest sector tile (first tile in the overview)
        try:
            page.locator("canvas").first.click(position={"x": 80, "y": 60})
        except Exception as e:
            print("   · heatmap drill skipped:", e)
        time.sleep(4)

        # Scene 3b — 排行榜 (usually already in the default left column)
        scene("盤前 — 排行榜 Scanner", 4)

        # link a futures symbol so downstream trade panels target TXFR1
        try_click_text(page, "TXFR1", exact=True, pause=2)

        # Scene 4 — K 線圖與圖表交易 (chart is in the default layout)
        scene("K 線圖 — 點價下單 / 拖曳改價 / 圖上停損停利", 10)
        # (chart interactions like drag-to-modify are best re-recorded by hand
        #  for a hero close-up; this holds on the live chart as B-roll.)

        # Scene 5 — 閃電下單
        scene("閃電下單 — 解鎖 + 點價（左買右賣）", 1)
        add_panel(page, "閃電下單")
        time.sleep(1.5)
        en = page.get_by_role("button", name="啟用閃電下單")
        if en.count() > 0:
            en.first.click()               # arm the safety lock
            time.sleep(3)
        time.sleep(4)                      # hold on the live ladder

        # Scene 6 — 選擇權 T 字 + 損益圖
        scene("選擇權 — T 字報價", 1)
        add_panel(page, "選擇權 T 字")
        time.sleep(3)
        scene("選擇權 — 到期損益圖", 1)
        add_panel(page, "選擇權損益圖")
        time.sleep(3)

        # Scene 7 — 帳務 + 隱私模式（金額遮蔽）
        scene("帳務 — 開『主題』選單切換金額遮蔽", 1)
        if open_header_menu(page, "主題"):
            try_click_text(page, "金額遮蔽", exact=False, pause=2)
            page.keyboard.press("Escape")  # close menu
            time.sleep(2)

        # Scene 8 — 安全：風控 Kill Switch 選單
        scene("安全 — 風控 Kill Switch 選單", 1)
        if open_header_menu(page, "風控"):
            time.sleep(3)
            page.keyboard.press("Escape")
            time.sleep(1)

        # Scene 9 — 收尾全景（CTA 字卡在剪輯時疊上）
        scene("收尾 — 終端全景（CTA 疊字）", 6)

        print("finishing… saving video")
        page.close()                       # flush the video file
        ctx.close()
        browser.close()

        vids = sorted(OUT.glob("*.webm"))
        if vids:
            print("saved:", vids[-1])
            print("convert: ffmpeg -i", vids[-1].name,
                  "-c:v libx264 -crf 18 -pix_fmt yuv420p demo.mp4")


if __name__ == "__main__":
    sys.exit(main())
