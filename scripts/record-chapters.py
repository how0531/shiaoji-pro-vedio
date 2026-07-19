# record-chapters.py — record tutorial chapters 1/3/4 as separate videos,
# driving the live app (SIMULATION ONLY — aborts if the 模擬環境 badge is
# missing). Prints scene timestamps for editing. Chapter 2 (onboarding) is
# desktop-only and not recordable from the web build.
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

# Windows console defaults to cp950 which chokes on ▶ — force utf-8
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
BASE = "http://localhost:5173"
W, H = 1920, 1080


class Rec:
    def __init__(self, page, t0):
        self.page = page
        self.t0 = t0

    def scene(self, label, hold=0.0):
        print(f"[{time.time()-self.t0:6.1f}s] ▶ {label}", flush=True)
        if hold:
            time.sleep(hold)

    def dismiss(self):
        """Close any open popover/palette: click its backdrop if present."""
        for sel in ("[class*='popoverBackdrop']", "[class*='paletteBackdrop']",
                    "[class*='backdrop']"):
            bd = self.page.locator(sel)
            if bd.count():
                try:
                    bd.last.click(timeout=2000, force=True)
                    time.sleep(0.4)
                except Exception:
                    pass
        self.page.keyboard.press("Escape")
        time.sleep(0.3)

    def add_panel(self, name):
        self.dismiss()
        self.page.get_by_role("button", name="＋ 新增面板").click(timeout=8000)
        time.sleep(0.8)
        self.page.locator("button", has_text=name).last.click(timeout=8000)
        time.sleep(1.2)
        self.dismiss()

    def close_menu(self):
        self.dismiss()

    def jump(self, code):
        """⌘K jump to a symbol (also demos the hotkey on video)."""
        self.dismiss()
        self.page.keyboard.press("Control+KeyK")
        time.sleep(0.8)
        self.page.keyboard.type(code, delay=90)
        time.sleep(1.5)
        self.page.keyboard.press("Enter")
        time.sleep(2)
        self.dismiss()  # ensure the palette is gone before next action


def new_ctx(browser, subdir):
    out = ROOT / "recordings" / subdir
    out.mkdir(parents=True, exist_ok=True)
    ctx = browser.new_context(
        viewport={"width": W, "height": H},
        record_video_dir=str(out),
        record_video_size={"width": W, "height": H},
        color_scheme="dark",
        locale="zh-TW",
        timezone_id="Asia/Taipei",
    )
    # mask account IDs/names in every recording (privacy mode, video-safe)
    ctx.add_init_script("localStorage.setItem('sj-pro-privacy-mode','1')")
    return ctx, out


def open_app(ctx, code="2330"):
    """Load the app, gate on the sim badge, and select a tradable symbol —
    a fresh profile has an empty watchlist and may default to an index
    (indices can't be traded, so the order ticket shows no buy button)."""
    page = ctx.new_page()
    page.goto(BASE)
    time.sleep(14)
    if page.get_by_text("模擬環境", exact=True).count() == 0:
        raise RuntimeError("模擬環境 badge missing — refusing to interact")
    r = Rec(page, time.time())
    if code:
        try:
            r.jump(code)
        except Exception as e:
            print("   · initial jump skipped:", e, flush=True)
    return page


def try_(label, fn):
    try:
        fn()
    except Exception as e:
        print(f"   · {label} skipped: {e}", flush=True)


# ────────────────────────── Chapter 1 · 介紹 (~90s) ──────────────────────────
def chapter1(browser):
    ctx, out = new_ctx(browser, "ch1-intro")
    page = open_app(ctx)
    r = Rec(page, time.time())

    r.scene("seg-01 hero 全景（模擬環境徽章）", 8)

    r.scene("seg-02 頂部列導覽 hover")
    try_("hover badge", lambda: page.get_by_text("模擬環境", exact=True).first.hover(timeout=6000))
    time.sleep(3)
    try_("hover 基差", lambda: page.get_by_text("基差", exact=True).first.hover(timeout=6000))
    time.sleep(3)

    r.scene("seg-03 版面選單（預設版型清單）")
    r.dismiss()
    try_("open 版面", lambda: page.get_by_role("button", name="版面").first.click(timeout=6000))
    time.sleep(4)
    r.close_menu()

    r.scene("seg-04a 風控選單")
    try_("open 風控", lambda: page.get_by_role("button", name="風控").first.click(timeout=6000))
    time.sleep(3.5)
    r.close_menu()

    r.scene("seg-04b ＋新增面板選單（面板清單）")
    try_("open addmenu", lambda: page.get_by_role("button", name="＋ 新增面板").click(timeout=6000))
    time.sleep(3.5)
    r.close_menu()

    r.scene("seg-05/06 徽章特寫留白 + 收尾全景", 8)

    page.close()
    ctx.close()
    print("ch1 videos:", [v.name for v in out.glob("*.webm")], flush=True)


# ─────────────────────── Chapter 3 · 功能介紹 (~4min) ───────────────────────
def chapter3(browser):
    ctx, out = new_ctx(browser, "ch3-features")
    page = open_app(ctx)
    r = Rec(page, time.time())

    r.scene("3-1 自選清單：加入商品並點選連動", 2)
    def watchlist_flow():
        inp = page.get_by_placeholder("股票、期貨或指數（如 台積電期）")
        for code in ("2330", "2317"):
            inp.first.fill(code, timeout=6000)
            time.sleep(1.2)   # let suggestions show on video
            inp.first.press("Enter")
            time.sleep(1.5)
        page.get_by_text("2330", exact=True).first.click(timeout=6000)
    try_("watchlist add+click", watchlist_flow)
    time.sleep(4)

    r.scene("3-2 ⌘K 跳轉 TXFR1（示範快捷鍵）")
    try_("jump TXFR1", lambda: r.jump("TXFR1"))
    time.sleep(3)

    r.scene("3-3 K線圖：切週期 1m/15m/1D")
    for tf in ["1m", "15m", "1D", "5m"]:
        try_(f"tf {tf}", lambda tf=tf: page.get_by_role("button", name=tf, exact=True).first.click(timeout=6000))
        time.sleep(2.5)

    r.scene("3-4 K線圖：往左拖回溯歷史")
    def drag_history():
        box = page.locator("canvas").nth(0).bounding_box()
        if not box:
            raise RuntimeError("no chart canvas")
        cx, cy = box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5
        for _ in range(3):
            page.mouse.move(cx, cy)
            page.mouse.down()
            page.mouse.move(cx + 420, cy, steps=14)
            page.mouse.up()
            time.sleep(1.2)
    try_("drag history", drag_history)
    time.sleep(2)

    r.scene("3-5 五檔（點價帶入下單）", 4)

    r.scene("3-6 成交明細 + 分價量表")
    try_("add 分價量表", lambda: r.add_panel("分價量表"))
    time.sleep(4)

    r.scene("3-7 下單面板：兩段式確認（arm 不送出）")
    def arm_ticket():
        buy = page.get_by_role("button", name="買進下單")
        if buy.count() == 0:
            raise RuntimeError("no 買進下單 button")
        buy.first.click()  # step 1: arm only — do NOT confirm
        time.sleep(3)
        page.keyboard.press("Escape")
    try_("arm ticket", arm_ticket)
    time.sleep(2)

    r.scene("3-8 閃電下單：解鎖 + 觀察價格梯")
    try_("add flash", lambda: r.add_panel("閃電下單"))
    def enable_flash():
        en = page.get_by_role("button", name="啟用閃電下單")
        if en.count() > 0:
            en.first.click()
            time.sleep(3)
        page.keyboard.press("Escape")  # re-lock for safety on video
    try_("enable flash", enable_flash)
    time.sleep(3)

    r.scene("3-9 排行榜（複選）")
    try_("scanner 複選", lambda: page.get_by_role("button", name="複選", exact=True).first.click())
    time.sleep(4)

    r.scene("3-10 類股熱力圖")
    try_("add heatmap", lambda: r.add_panel("類股熱力圖"))
    time.sleep(5)

    r.scene("3-11 個股籌碼卡")
    try_("jump 2330", lambda: r.jump("2330"))
    try_("add chips", lambda: r.add_panel("籌碼資訊"))
    time.sleep(5)

    r.scene("3-12 選擇權 T 字 + 損益圖")
    try_("add optchain", lambda: r.add_panel("選擇權 T 字"))
    time.sleep(4)
    try_("add payoff", lambda: r.add_panel("選擇權損益圖"))
    time.sleep(4)

    r.scene("3-13 行情回放")
    try_("add replay", lambda: r.add_panel("行情回放"))
    time.sleep(3)
    def play_replay():
        btn = page.get_by_role("button", name="播放")
        if btn.count() == 0:
            raise RuntimeError("no 播放 (likely 無可回放 on non-trading day)")
        btn.first.click()
        time.sleep(6)
    try_("play replay", play_replay)
    time.sleep(2)

    r.scene("3-14 收尾全景", 5)
    page.close()
    ctx.close()
    print("ch3 videos:", [v.name for v in out.glob("*.webm")], flush=True)


# ────────────────── Chapter 4 · 面板拖曳與功能細節 (~4min) ──────────────────
def chapter4(browser):
    ctx, out = new_ctx(browser, "ch4-panels")
    page = open_app(ctx)
    r = Rec(page, time.time())

    r.scene("4-1 ＋新增面板：加一張 K 線圖（多開）")
    try_("add chart", lambda: r.add_panel("K 線圖"))
    time.sleep(3)

    r.scene("4-2 拖曳面板標題列移動")
    def drag_panel():
        handles = page.locator(".drag-handle")
        n = handles.count()
        if n == 0:
            raise RuntimeError("no drag handles")
        box = handles.nth(n - 1).bounding_box()
        if not box:
            raise RuntimeError("no box")
        sx, sy = box["x"] + box["width"] * 0.4, box["y"] + box["height"] / 2
        page.mouse.move(sx, sy)
        page.mouse.down()
        page.mouse.move(sx - 500, sy - 250, steps=22)
        time.sleep(0.4)
        page.mouse.up()
    try_("drag panel", drag_panel)
    time.sleep(3)

    r.scene("4-3 連動→鎖定商品（點連動鈕、輸代碼）")
    def pin_panel():
        btn = page.get_by_title("跟隨自選清單選擇；點擊鎖定目前商品")
        if btn.count() == 0:
            raise RuntimeError("no link button")
        btn.last.click()
        time.sleep(2)
        inputs = page.locator("input")
        # the pin code input appears in that panel's title bar; type a code
        for i in range(inputs.count()):
            el = inputs.nth(i)
            if (el.get_attribute("value") or "").upper() in ("TXFR1", "2330"):
                el.fill("2330")
                el.press("Enter")
                return
    try_("pin panel", pin_panel)
    time.sleep(3)

    r.scene("4-4 恢復連動")
    def unpin():
        btn = page.get_by_title("已鎖定；點擊恢復連動")
        if btn.count():
            btn.last.click()
    try_("unpin", unpin)
    time.sleep(2)

    r.scene("4-5 版面選單：套用『當沖交易』預設")
    try_("open 版面", lambda: page.get_by_role("button", name="版面").first.click())
    time.sleep(2)
    try_("apply 當沖交易", lambda: page.get_by_role("button", name="當沖交易").first.click())
    time.sleep(6)

    r.scene("4-6 K線圖：切到停損模式在圖上掛觸價（虛線）")
    try_("jump TXFR1", lambda: r.jump("TXFR1"))
    def chart_stop():
        stop = page.locator("button", has_text="停損")
        if stop.count() == 0:
            raise RuntimeError("no 停損 mode button")
        stop.first.click()
        time.sleep(1)
        box = page.locator("canvas").nth(0).bounding_box()
        if not box:
            raise RuntimeError("no canvas")
        page.mouse.click(box["x"] + box["width"] * 0.7, box["y"] + box["height"] * 0.72)
        time.sleep(3)
    try_("chart stop-line", chart_stop)
    time.sleep(2)

    r.scene("4-7 取消觸價線（若清單有小叉）")
    def cancel_trigger():
        # trigger rows expose small ✕ buttons in the chart overlay list
        xs = page.get_by_role("button", name="✕")
        if xs.count():
            xs.last.click()
    try_("cancel trigger", cancel_trigger)
    time.sleep(2)

    r.scene("4-8 閃電下單細節：解鎖→點價買（模擬）→order chip→全刪")
    try_("add flash", lambda: r.add_panel("閃電下單"))
    def flash_flow():
        en = page.get_by_role("button", name="啟用閃電下單")
        if en.count() == 0:
            raise RuntimeError("no enable button")
        en.first.click()
        time.sleep(2.5)
        # click a bid cell near mid-ladder: use the ladder's grid cells
        ladder = page.locator("canvas")  # flash ladder may be DOM, fallback: skip
        cells = page.locator("[class*='bidCell'], [class*='cellBuy']")
        if cells.count():
            cells.nth(cells.count() // 2).click()
            time.sleep(3)
        allcancel = page.get_by_role("button", name="全刪")
        if allcancel.count():
            allcancel.first.click()
            time.sleep(2)
        page.keyboard.press("Escape")  # relock
    try_("flash flow", flash_flow)
    time.sleep(3)

    r.scene("4-9 Esc×2 全刪單示範（提示 toast）")
    page.keyboard.press("Escape")
    time.sleep(0.2)
    page.keyboard.press("Escape")
    time.sleep(3)

    r.scene("4-10 儲存版面 + 收尾", 4)
    try_("open 版面2", lambda: page.get_by_role("button", name="版面").first.click())
    time.sleep(3)
    r.close_menu()
    time.sleep(3)

    page.close()
    ctx.close()
    print("ch4 videos:", [v.name for v in out.glob("*.webm")], flush=True)


# ────────────── Chapter 5 · 端到端實戰：選股→下單→刪單 (~90s) ──────────────
def chapter5(browser):
    ctx, out = new_ctx(browser, "ch5-walkthrough")
    page = open_app(ctx)
    r = Rec(page, time.time())

    r.scene("5-1 排行榜複選挑一檔", 2)
    try_("scanner 複選", lambda: page.get_by_role("button", name="複選", exact=True).first.click())
    time.sleep(3)

    r.scene("5-2 選定標的連動全終端（⌘K 或排行點列）")
    def pick_first_row():
        rows = page.locator("[class*='scanner'] [class*='row'], [class*='moverRow']")
        if rows.count():
            rows.first.click(timeout=5000)
        else:
            r.jump("2330")  # non-trading day: scanner may be empty
    try_("pick row", pick_first_row)
    time.sleep(4)

    r.scene("5-3 看 K 線與五檔（連動後）", 5)

    r.scene("5-4 籌碼卡確認可當沖/處置")
    try_("add chips", lambda: r.add_panel("籌碼資訊"))
    time.sleep(4)

    r.scene("5-5 下單面板：填價量→兩段式確認→送出（模擬單）")
    def full_order():
        # nudge price away from market so the LMT order rests (visible later)
        minus = page.get_by_role("button", name="−")
        if minus.count():
            for _ in range(3):
                minus.first.click()
                time.sleep(0.3)
        buy = page.get_by_role("button", name="買進下單")
        if buy.count() == 0:
            raise RuntimeError("no 買進下單")
        buy.first.click()          # step 1: arm
        time.sleep(2.5)
        confirm = page.locator("button", has_text="確認買進")
        if confirm.count():
            confirm.first.click()  # step 2: send (SIMULATION)
        time.sleep(4)
    try_("full order", full_order)

    r.scene("5-6 在持倉/委託面板看到這筆委託", 5)

    r.scene("5-7 Esc×2 全刪單（真的有單可刪）")
    page.keyboard.press("Escape")
    time.sleep(0.3)
    page.keyboard.press("Escape")
    time.sleep(4)

    r.scene("5-8 收尾", 3)
    page.close()
    ctx.close()
    print("ch5 videos:", [v.name for v in out.glob("*.webm")], flush=True)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, fn in [("CH1", chapter1), ("CH3", chapter3), ("CH4", chapter4), ("CH5", chapter5)]:
            print(f"===== {name} START =====", flush=True)
            try:
                fn(browser)
            except Exception as e:
                print(f"!! {name} failed: {e}", flush=True)
            print(f"===== {name} END =====", flush=True)
        browser.close()
    print("ALL DONE", flush=True)


if __name__ == "__main__":
    sys.exit(main())
