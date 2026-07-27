# record-topics.py — generic, topic-driven, per-segment recorder for the
# Shioaji Pro tutorial series (v3 pipeline). Reads topics_spec.TOPICS, records
# ONE continuous 1920x1080 webm per topic while driving the live app, and
# writes scenes.json with per-segment [start,end) (video-time seconds) + live
# zoom bbox. assemble3.py consumes both.
#
# HARD RULES (baked in):
#   · SIMULATION ONLY. In app/terminal mode, gate on the 模擬環境 badge before
#     interacting (onboarding page is exempt — it has no badge yet).
#   · NEVER click 啟動並開始使用 (web build throws a raw TypeError). hover only.
#   · Key fields get demo_ FAKE strings only. Privacy mode on (accounts masked).
#
# Style-guide touches (風格指南.md):
#   · Virtual cursor injected page-side (16px white/black circle following the
#     mouse; #C0392B click ripple 400ms) — Playwright video has no OS cursor.
#   · All moves are smooth (page.mouse.move steps>=20); hover the target 0.3s
#     before clicking, to read like a real person.
#   · zoom segments: capture the live bbox at the right moment -> scenes.json,
#     and paint a 2px #D9A45B gold frame (+corner label) on the target for the
#     segment (removed at segment end). assemble3.py crops using the same bbox.
#
# Usage:  python scripts/record-topics.py t1-login
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
import topics_spec  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent
BASE = "http://localhost:5173"
W, H = 2560, 1440   # native 2K (device_scale_factor stays 1 → CSS px == video px)

FAKE_KEY = "demo_AAAAAAAAAAAAAAAAAAAAAAAA"          # visible, obviously fake
FAKE_SEC = "demo_secret_BBBBBBBBBBBBBBBBBBBBBBBB"    # masked behind dots anyway

GOLD = "#D9A45B"

# change C: opening ⌘K jump per topic mode (onboarding jumps inside t1-9).
MODE_SYMBOL = {"app-2317": "2317", "app-txf": "TXFR1", "app": "2330"}

# Page-side virtual cursor + click ripple (persists across SPA re-renders and
# navigations because it is added as an init script + self-heals on mousemove).
CURSOR_JS = r"""
(() => {
  if (window.__vc) return; window.__vc = true;
  const css = document.createElement('style');
  css.textContent = `
    #__vcur{position:fixed;z-index:2147483647;width:22px;height:22px;
      margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,255,255,.96);
      border:3px solid #111;box-shadow:0 1px 5px rgba(0,0,0,.55);
      pointer-events:none;left:-100px;top:-100px}
    .__vrip{position:fixed;z-index:2147483646;width:18px;height:18px;
      margin:-9px 0 0 -9px;border-radius:50%;border:3px solid #C0392B;
      pointer-events:none;animation:__vk .4s ease-out forwards}
    @keyframes __vk{from{transform:scale(1);opacity:.9}
      to{transform:scale(4.2);opacity:0}}`;
  const host = () => document.body || document.documentElement;
  const ensure = () => {
    if (!document.getElementById('__vcstyle')) { css.id='__vcstyle'; host().appendChild(css); }
    if (!document.getElementById('__vcur')) {
      const c=document.createElement('div'); c.id='__vcur'; host().appendChild(c);
    }
    return document.getElementById('__vcur');
  };
  const move = (x,y) => { const c=ensure(); c.style.left=x+'px'; c.style.top=y+'px'; };
  document.addEventListener('mousemove', e => move(e.clientX, e.clientY), true);
  document.addEventListener('mousedown', e => {
    const r=document.createElement('div'); r.className='__vrip';
    r.style.left=e.clientX+'px'; r.style.top=e.clientY+'px';
    host().appendChild(r); setTimeout(()=>r.remove(), 460);
  }, true);
  if (document.readyState !== 'loading') ensure();
  else document.addEventListener('DOMContentLoaded', ensure);
})();
"""


def est_dur(narration):
    """Rough spoken length so recorded footage lands near the TTS length
    (assembler retimes anyway; goal is k in ~0.7-1.4). zh-TW ~4.3 chars/s."""
    n = len("".join(ch for ch in narration if not ch.isspace()))
    return max(4.0, n / 4.3)


def _until(r, base, target, frac, cap=25.0):
    """Sleep until `frac` of the segment's spoken length has elapsed since the
    handler started (base = r.t() at handler entry). Lets a handler spread its
    visual events evenly across the narration so assemble3's uniform stretch
    keeps event order == narration order."""
    dt = base + target * frac - r.t()
    if dt > 0:
        time.sleep(min(dt, cap))


class R:
    def __init__(self, page, anchor):
        self.page = page
        self.anchor = anchor
        self.mark_time = None      # handler-set cut-start (skip loading/navi)
        self.cut_end_time = None   # handler-set cut-end (drop trailing re-mount)

    def mark(self):
        self.mark_time = self.t()

    def cut_end(self):
        self.cut_end_time = self.t()

    def t(self):
        return time.time() - self.anchor

    def log(self, msg):
        print(f"[{self.t():6.1f}s] {msg}", flush=True)

    def smooth_move(self, x, y, steps=26):
        self.page.mouse.move(x, y, steps=steps)

    def move_to(self, loc, hold=0.3):
        box = loc.bounding_box()
        if not box:
            raise RuntimeError("no bbox for move_to")
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        self.smooth_move(cx, cy)
        time.sleep(hold)
        return box

    def move_xy(self, x, y, hold=0.3):
        self.smooth_move(x, y)
        time.sleep(hold)

    def click_loc(self, loc, hold=0.3):
        self.move_to(loc, hold)
        loc.click(timeout=6000)

    def click_xy(self, x, y, hold=0.3):
        self.smooth_move(x, y)
        time.sleep(hold)
        self.page.mouse.click(x, y)

    def gold_frame(self, box, label, pad=8):
        """Paint a 2px gold frame (+corner label) around box; returns a token
        to remove it. box is a live bbox dict."""
        self.page.evaluate(
            """([b, pad, gold, label]) => {
                const d = document.createElement('div');
                d.className = '__vgold';
                Object.assign(d.style, {
                  position:'fixed', zIndex:2147483645, pointerEvents:'none',
                  left:(b.x-pad)+'px', top:(b.y-pad)+'px',
                  width:(b.w+2*pad)+'px', height:(b.h+2*pad)+'px',
                  border:'3px solid '+gold, borderRadius:'8px',
                  boxShadow:'0 0 0 1px rgba(0,0,0,.35)'});
                if (label) {
                  // 深色底膠囊：標籤疊到鄰近 UI 文字時仍可讀、不變成疊字
                  //（QC 抓過「融資成數」標籤壓到「正常」的化妝性問題）
                  const t = document.createElement('div');
                  t.textContent = label;
                  Object.assign(t.style, {position:'absolute', top:'-34px', left:'0',
                    font:'19px "Microsoft JhengHei",sans-serif', color:gold,
                    whiteSpace:'nowrap', padding:'2px 10px', borderRadius:'999px',
                    background:'rgba(10,18,32,.92)',
                    boxShadow:'0 0 0 1px rgba(217,164,91,.45)'});
                  d.appendChild(t);
                }
                (document.body||document.documentElement).appendChild(d);
            }""",
            [{"x": box["x"], "y": box["y"], "w": box["width"], "h": box["height"]},
             pad, GOLD, label],
        )

    def clear_frames(self):
        self.page.evaluate(
            "document.querySelectorAll('.__vgold').forEach(e=>e.remove())")

    # ── app-driving helpers (ported from the verified record-chapters.py) ──
    def dismiss(self):
        """Close any open popover/palette (backdrop-corner click). Only send a
        real Escape if a backdrop is still up — an unconditional Escape on a
        clean terminal pops the '再按一次 Esc 全部刪單' safety toast into frame."""
        # modal dialogs (技術指標 / 自訂指標編輯器) use a full-screen 'overlay'
        # whose corner-click fires onClose — clicking it closes the modal
        # WITHOUT an Escape (so no '再按一次 Esc 全部刪單' toast).
        for sel in ("[class*='popoverBackdrop']", "[class*='paletteBackdrop']",
                    "[class*='overlay']", "[class*='backdrop']"):
            bd = self.page.locator(sel)
            if bd.count():
                try:
                    bd.last.click(timeout=2000, force=True,
                                  position={"x": 8, "y": 8})
                    time.sleep(0.3)
                except Exception:
                    pass
        still = self.page.locator(
            "[class*='popoverBackdrop'], [class*='paletteBackdrop']")
        if still.count():
            self.page.keyboard.press("Escape")
            time.sleep(0.25)

    def scroll_top(self):
        self.page.evaluate("window.scrollTo(0,0)")
        time.sleep(0.5)

    def center(self, loc):
        """Scroll an element to the viewport's vertical center. Big singleton
        panels (T 字/損益圖/組合單) land at the bottom of the workspace with
        their body below the fold — centering makes the table/curve visible."""
        try:
            loc.evaluate(
                "el => el.scrollIntoView({block:'center', behavior:'instant'})")
            time.sleep(0.6)
        except Exception:
            try:
                loc.scroll_into_view_if_needed(timeout=3000)
                time.sleep(0.5)
            except Exception:
                pass

    def jump(self, code):
        """⌘K jump to a symbol (also demos the hotkey on video)."""
        self.dismiss()
        self.page.keyboard.press("Control+KeyK")
        time.sleep(0.8)
        self.page.keyboard.type(code, delay=85)
        time.sleep(1.4)
        self.page.keyboard.press("Enter")
        time.sleep(2.5)
        self.dismiss()

    def add_panel(self, name):
        """Add a panel by EXACT menu-item match, then toggle-close the menu and
        scroll the new panel into view (record-chapters proven recipe)."""
        self.dismiss()
        addbtn = self.page.get_by_role("button", name="＋ 新增面板")
        try:
            self.move_to(addbtn, hold=0.25)
        except Exception:
            pass
        addbtn.click(timeout=8000)
        time.sleep(0.8)
        item = self.page.get_by_role("button", name=name, exact=True)
        if item.count() == 0:
            item = self.page.locator("button", has_text=name)
        try:
            self.move_to(item.last, hold=0.2)
        except Exception:
            pass
        item.last.click(timeout=8000)
        time.sleep(1.2)
        bd = self.page.locator("[class*='popoverBackdrop']")
        if bd.count():
            try:
                self.page.get_by_role("button", name="＋ 新增面板").click(
                    timeout=3000, force=True)
                time.sleep(0.5)
            except Exception:
                pass
        self.dismiss()
        try:
            self.page.get_by_text(name, exact=False).last.scroll_into_view_if_needed(
                timeout=4000)
            time.sleep(0.7)
        except Exception:
            pass


# ─────────────────────────── T1 action handlers ───────────────────────────
# Each handler performs the segment's action with natural pacing and returns
# a zoom bbox dict {x,y,w,h} or None. The segment loop pads to est_dur.

def bbox_dict(box):
    return {"x": round(box["x"]), "y": round(box["y"]),
            "w": round(box["width"]), "h": round(box["height"])}


def live_bbox(loc):
    try:
        return loc.bounding_box(timeout=3000)
    except Exception:
        return None


def a_hold(page, r, seg):
    # gentle cursor drift across the wizard so the panorama isn't dead-still
    r.move_xy(960, 470, hold=0.4)
    r.move_xy(960, 620, hold=0.4)
    r.move_xy(960, 540, hold=0.3)
    return None


def a_sinopac_shots(page, r, seg):
    # picture is replaced by the sinopac-steps card in assembly; just idle on
    # the wizard panorama (no interaction).
    r.move_xy(960, 540, hold=0.5)
    return None


def a_type_api_key(page, r, seg):
    inp = page.get_by_placeholder("SJ_API_KEY")
    r.move_to(inp, hold=0.3)
    inp.click(timeout=6000)
    inp.fill("")
    inp.type(FAKE_KEY, delay=48)
    time.sleep(1.0)
    return None


def a_eye_toggle(page, r, seg):
    inp = page.get_by_placeholder("SJ_API_KEY")
    box = inp.bounding_box()
    zb = bbox_dict(box)
    # the field is stable — paint the gold frame now, held until segment end
    r.gold_frame(box, "API KEY")
    # eye button sits at the right end of the field
    ex, ey = box["x"] + box["width"] - 18, box["y"] + box["height"] / 2
    time.sleep(0.4)
    r.click_xy(ex, ey, hold=0.35)   # reveal
    time.sleep(4.2)                 # hold revealed (this is what the zoom shows)
    r.click_xy(ex, ey, hold=0.3)    # mask again
    time.sleep(1.4)
    return zb


def a_type_secret_key(page, r, seg):
    inp = page.get_by_placeholder("SJ_SEC_KEY")
    r.move_to(inp, hold=0.3)
    inp.click(timeout=6000)
    inp.fill("")
    inp.type(FAKE_SEC, delay=42)
    time.sleep(1.2)
    return None


def a_env_hold_sim(page, r, seg):
    sim = page.get_by_role("button", name="模擬環境")
    r.move_to(sim, hold=0.6)
    time.sleep(1.0)
    return None


def a_env_click_prod_and_back(page, r, seg):
    prod = page.get_by_role("button", name="正式環境")
    r.move_to(prod, hold=0.35)
    prod.click(timeout=6000)          # -> red warning + cert block appear
    time.sleep(1.2)
    # capture the SHIFTED layout so the zoom frames the warning too, and paint
    # the frame in THIS (prod) layout only
    pbox = prod.bounding_box()
    zb = bbox_dict(pbox)
    r.gold_frame(pbox, "正式環境")
    # HOLD in prod for the bulk of the narration (真金白銀/憑證檔/密碼 must be
    # said WHILE the warning is on screen); reserve ~4s for the switch-back
    # ("示範完，我切回模擬") at the very end.
    hold_prod = max(4.0, est_dur(seg["narration"]) - 5.5)
    time.sleep(hold_prod)
    r.clear_frames()                  # remove BEFORE the layout shifts back
    sim = page.get_by_role("button", name="模擬環境")
    r.move_to(sim, hold=0.35)
    sim.click(timeout=6000)           # back to simulation
    time.sleep(2.0)
    return zb


def a_hover_launch(page, r, seg):
    # RULE: hover only, never click.
    launch = page.get_by_text("啟動並開始使用")
    r.move_to(launch, hold=0.5)
    time.sleep(2.6)
    # ease the cursor off so nobody thinks the next click hits it
    r.move_xy(960, 760, hold=0.4)
    return None


def a_goto_terminal(page, r, seg):
    r.log("  · navigate to terminal")
    page.goto(BASE)
    # wait for load + gate on the sim badge before any interaction
    badge = page.get_by_text("模擬環境", exact=True)
    for _ in range(30):
        if badge.count() > 0:
            break
        time.sleep(0.5)
    if badge.count() == 0:
        raise RuntimeError("模擬環境 badge missing on terminal — refusing")
    time.sleep(2.5)
    # jump to a lively futures symbol so the panorama isn't the empty index
    page.keyboard.press("Control+KeyK")
    time.sleep(0.8)
    page.keyboard.type("TXFR1", delay=90)
    time.sleep(1.4)
    page.keyboard.press("Enter")
    time.sleep(3.0)
    page.keyboard.press("Escape")
    time.sleep(1.5)
    # terminal is now ready — this is where the usable footage begins (skip the
    # navigation/loading before it)
    r.mark()
    # zoom target = the top-left 模擬環境 badge (pick the top-most instance)
    zb = None
    best = None
    for i in range(badge.count()):
        b = badge.nth(i).bounding_box()
        if b and b["y"] < 40 and (best is None or b["y"] < best["y"]):
            best = b
    if best:
        zb = bbox_dict(best)
        r.gold_frame(best, "模擬環境")
    r.move_xy(600, 400, hold=0.4)     # keep cursor out of the badge crop
    time.sleep(7.0)                   # generous terminal hold -> enough footage
    return zb


# ─────────────────────── T2 · 版面 handlers ───────────────────────

def a_tour_header(page, r, seg):
    # sweep the top bar left→right, pausing on each control the ep will use
    r.scroll_top()
    seq = [("模擬環境", None), ("加權", None), ("帳號", "帳號"),
           ("風控", "風控"), ("＋ 新增面板", "新增面板"),
           ("版面", "版面"), ("主題", "主題")]
    for name, _ in seq:
        try:
            el = page.get_by_role("button", name=name).first
            if el.count() == 0:
                el = page.get_by_text(name, exact=True).first
            r.move_to(el, hold=0.55)
        except Exception:
            pass
    r.move_xy(300, 20, hold=0.4)
    return None


def a_open_add_menu(page, r, seg):
    r.dismiss()
    r.scroll_top()
    btn = page.get_by_role("button", name="＋ 新增面板")
    r.move_to(btn, hold=0.3)
    btn.click(timeout=8000)
    time.sleep(1.0)
    r.mark()                                   # footage from the open menu
    title = page.get_by_text("新增面板", exact=False).first
    tb = live_bbox(title)
    if tb:
        r.gold_frame(tb, "新增面板")
    # drift the cursor down the 24-item list so the whole menu reads
    r.move_xy(1500, 300, hold=0.6)
    r.move_xy(1500, 620, hold=0.6)
    time.sleep(1.6)
    r.clear_frames()
    r.dismiss()
    return None


def a_add_chart_panel(page, r, seg):
    r.add_panel("K 線圖")
    r.mark()                                   # footage = the settled new panel
    try:
        page.get_by_text("K 線圖", exact=False).last.scroll_into_view_if_needed(timeout=3000)
    except Exception:
        pass
    r.move_xy(900, 620, hold=0.5)
    time.sleep(1.8)
    return None


def a_drag_panel(page, r, seg):
    handles = page.locator(".drag-handle")
    n = handles.count()
    if n == 0:
        return None
    h = handles.nth(n - 1)
    try:
        h.scroll_into_view_if_needed(timeout=3000)
    except Exception:
        pass
    box = live_bbox(h)
    if not box:
        return None
    sx, sy = box["x"] + box["width"] * 0.4, box["y"] + box["height"] / 2
    r.smooth_move(sx, sy)
    time.sleep(0.5)
    page.mouse.down()
    page.mouse.move(sx - 480, sy - 230, steps=28)
    time.sleep(0.4)
    page.mouse.up()
    time.sleep(1.8)
    return None


def a_pin_unpin(page, r, seg):
    # Event order MUST match the narration, spread over the whole segment:
    #   (a) LINKED (blue chain) held through the opening → (b) click → PINNED
    #   (圖釘 + 標題列代碼框) held through the middle-back → (c) click → LINKED at
    #   the very end. assemble3 stretches the segment evenly to the narration
    #   length, so keeping the pinned state in the middle-back keeps it aligned.
    tgt_dur = est_dur(seg["narration"])
    base = r.t()
    btn = page.get_by_title("跟隨自選清單選擇；點擊鎖定目前商品")
    if btn.count() == 0:
        return None
    link_btn = btn.last
    try:
        link_btn.scroll_into_view_if_needed(timeout=3000)
    except Exception:
        pass
    box = live_bbox(link_btn)
    zb = bbox_dict(box) if box else None
    if box:
        r.gold_frame(box, "連動／鎖定")
    # (a) dwell on the 連動 button (標題列鏈結按鈕 / 預設是連動)
    r.move_to(link_btn, hold=0.5)
    _until(r, base, tgt_dur, 0.40)
    # (b) click → pinned; 標題列 grows a 代碼框; hold this through the middle-back
    #     (你看，標題列多出一個代碼框…指定這個面板只看哪一檔)
    try:
        link_btn.click(timeout=6000)           # → pinned (圖釘) + 代碼框 appears
    except Exception:
        pass
    time.sleep(0.5)                            # let the 代碼框 render
    _until(r, base, tgt_dur, 0.86)
    # (c) click 鎖定 → back to linked at the very end (再點一下，恢復連動)
    un = page.get_by_title("已鎖定；點擊恢復連動")
    if un.count():
        u = un.last
        try:
            r.move_to(u, hold=0.3)
        except Exception:
            pass
        try:
            u.click(timeout=6000)              # → back to linked
        except Exception:
            pass
    time.sleep(0.8)
    r.clear_frames()
    return zb


def a_apply_preset(page, r, seg):
    r.dismiss()
    r.scroll_top()
    btn = page.get_by_role("button", name="版面").first
    r.move_to(btn, hold=0.3)
    btn.click(timeout=6000)
    time.sleep(2.2)                            # SHOW the preset list (narration
    preset = page.get_by_role("button", name="當沖交易").first  # names it)
    r.move_to(preset, hold=0.6)
    preset.click(timeout=6000)                 # → whole page re-lays out
    time.sleep(3.6)
    r.dismiss()
    return None


def a_layout_save_menu(page, r, seg):
    r.dismiss()
    r.scroll_top()
    btn = page.get_by_role("button", name="版面").first
    r.move_to(btn, hold=0.3)
    btn.click(timeout=6000)
    time.sleep(1.2)
    inp = page.get_by_placeholder("版面名稱")
    if inp.count():
        try:
            r.move_to(inp.first, hold=0.3)
            inp.first.click(timeout=4000)
            inp.first.fill("")
            inp.first.type("我的當沖版", delay=70)
            time.sleep(0.8)
        except Exception:
            pass
    save = page.get_by_role("button", name="儲存", exact=True)
    if save.count():
        try:
            r.move_to(save.first, hold=0.4)
            save.first.click(timeout=4000)     # persists to localStorage (harmless)
            time.sleep(1.4)
        except Exception:
            pass
    r.dismiss()
    return None


# ─────────────────────── T3 · 看盤與選股 handlers ───────────────────────

def a_watchlist_add(page, r, seg):
    inp = page.get_by_placeholder("股票、期貨或指數（如 台積電期）")
    if inp.count() == 0:
        return None
    for code in ("2454", "2603"):
        try:
            r.move_to(inp.first, hold=0.25)
            inp.first.fill("")
            inp.first.type(code, delay=110)
            time.sleep(1.3)                    # let the suggestion dropdown show
            inp.first.press("Enter")
            time.sleep(1.6)
        except Exception:
            pass
    return None


def a_watchlist_click_other(page, r, seg):
    # click a different watchlist row → whole terminal links across
    row = page.get_by_text("2317", exact=True)
    if row.count() == 0:
        row = page.get_by_text("2454", exact=True)
    if row.count():
        try:
            r.move_to(row.first, hold=0.4)
            row.first.click(timeout=6000)
        except Exception:
            pass
    time.sleep(2.5)
    return None


def a_chart_timeframes(page, r, seg):
    # zoom on the 5m button; click through the period row
    zb = None
    five = page.get_by_role("button", name="5m", exact=True).first
    b = live_bbox(five)
    if b:
        zb = bbox_dict(b)
        r.gold_frame(b, "週期")
    for tf in ("1m", "15m", "60m", "1D", "5m"):
        el = page.get_by_role("button", name=tf, exact=True).first
        if el.count():
            try:
                r.move_to(el, hold=0.35)
                el.click(timeout=5000)
                time.sleep(1.1)
            except Exception:
                pass
    time.sleep(0.8)
    r.clear_frames()
    return zb


def a_chart_drag_history(page, r, seg):
    box = live_bbox(page.locator("canvas").first)
    if not box:
        return None
    cx, cy = box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5
    for _ in range(3):
        r.smooth_move(cx, cy)
        page.mouse.down()
        page.mouse.move(cx + 430, cy, steps=18)
        page.mouse.up()
        time.sleep(1.1)
    time.sleep(1.0)
    return None


def a_depth_on_txf(page, r, seg):
    r.jump("TXFR1")
    r.mark()                                   # skip the jump/load
    # trace the 五檔 four-column ladder so its structure reads on-camera: the
    # column headers (委量/BID/ASK/委量), down the five price rows, then the
    # Σ買/Σ賣 totals + 買賣力道 bar beneath. (probe: depth-ladder ladderRow x5)
    grid = page.locator("[class*='ladderRow']")
    gb = live_bbox(grid.first) if grid.count() else None
    if gb:
        cx = gb["x"] + gb["width"] / 2
        rh = gb["height"]
        r.move_xy(cx, gb["y"] - 8, hold=0.8)           # 委量/BID/ASK/委量 headers
        r.move_xy(cx, gb["y"] + rh * 2.5, hold=0.8)    # down the five price rows
        r.move_xy(cx, gb["y"] + rh * 5 + 34, hold=0.9)  # Σ買/Σ賣 + 買賣力道 bar
    else:
        r.move_xy(1717, 108, hold=0.8)
        r.move_xy(1717, 180, hold=0.8)
        r.move_xy(1717, 250, hold=0.9)
    time.sleep(2.2)
    return None


def a_add_volprofile(page, r, seg):
    r.add_panel("分價量表")
    r.mark()
    try:
        page.get_by_text("分價量表", exact=False).last.scroll_into_view_if_needed(timeout=3000)
    except Exception:
        pass
    r.move_xy(200, 700, hold=0.6)
    time.sleep(2.0)
    return None


def a_scanner_multi(page, r, seg):
    r.dismiss()
    r.scroll_top()
    multi = page.get_by_role("button", name="複選", exact=True).first
    if multi.count():
        try:
            r.move_to(multi, hold=0.4)
            multi.click(timeout=6000)          # expand the three thresholds
            time.sleep(1.0)
        except Exception:
            pass
    time.sleep(1.2)
    r.mark()                                   # footage = expanded 複選 + list
    # type the three thresholds so the "設漲幅/量/額" narration matches. Use
    # values that actually intersect to a non-empty 量價都夠 list (probe: 2/5/1
    # → 5 rows; the old 3 / 2000千張 / 5億 crossed to ZERO → nothing to click).
    inputs = page.locator("[class*='scanner'] input")
    vals = ["2", "5", "1"]                     # 漲幅≥2% / 量≥5千張 / 額≥1億
    for i in range(min(inputs.count(), 3)):
        try:
            el = inputs.nth(i)
            r.move_to(el, hold=0.2)
            el.fill("")
            el.type(vals[i], delay=70)
            time.sleep(0.4)
        except Exception:
            pass
    time.sleep(2.6)                            # let the filtered list settle
    # click a result row → the whole terminal links to it. Click the 代碼 cell:
    # the row centre lands on the 類股 chip, whose onClick stopPropagation-jumps
    # the heatmap instead of linking (scanner-panel_row + scCode verified).
    linked = False
    rows = page.locator("[class*='scanner-panel_row']")
    if rows.count():
        try:
            code_cell = rows.first.locator("[class*='scCode']").first
            r.move_to(code_cell, hold=0.4)
            code_cell.click(timeout=5000)
            time.sleep(2.6)
            linked = True
        except Exception:
            pass
    if not linked:
        # 複選 empty (or the click missed) → demo linkage from a watchlist row
        for c in ("2330", "2317", "2454", "2603"):
            el = page.get_by_text(c, exact=True)
            if el.count():
                try:
                    r.move_to(el.first, hold=0.4)
                    el.first.click(timeout=5000)
                    time.sleep(2.4)
                    break
                except Exception:
                    pass
    return None


def a_heatmap_drill(page, r, seg):
    r.add_panel("類股熱力圖")
    r.mark()
    try:
        page.get_by_text("類股總覽", exact=False).last.scroll_into_view_if_needed(timeout=3000)
    except Exception:
        pass
    time.sleep(1.5)
    r.move_xy(200, 780, hold=0.8)              # hover overview tiles (real color)
    time.sleep(1.6)
    # drill into a sector
    tiles = page.locator("button[title*='指數（']")
    if tiles.count():
        try:
            r.move_to(tiles.first, hold=0.4)
            tiles.first.click(timeout=5000)    # → sector (member stocks) layer
            time.sleep(2.4)
        except Exception:
            pass
    # back to overview
    back = page.get_by_text("← 總覽", exact=False)
    if back.count():
        try:
            r.move_to(back.first, hold=0.4)
            back.first.click(timeout=5000)
            time.sleep(1.8)
        except Exception:
            pass
    return None


def a_chips_card(page, r, seg):
    r.jump("2317")
    r.add_panel("籌碼資訊")
    r.mark()
    try:
        page.get_by_text("籌碼資訊", exact=False).last.scroll_into_view_if_needed(timeout=3000)
    except Exception:
        pass
    r.move_xy(200, 850, hold=0.8)
    time.sleep(2.4)
    return None


# ─────────────────────── T4 · 交易 handlers ───────────────────────

def _fill_price(page, r, val="230"):
    price = page.locator("xpath=//span[text()='價格']/following::input[1]")
    if price.count() == 0:
        return False
    try:
        r.move_to(price.first, hold=0.3)
    except Exception:
        pass
    price.first.click(timeout=6000)
    price.first.fill("")
    price.first.type(val, delay=130)
    time.sleep(1.0)
    return True


def a_ticket_tour(page, r, seg):
    r.scroll_top()
    # tour the ticket controls the narration names
    for name in ("買進 Buy", "賣出 Sell"):
        el = page.get_by_role("button", name=name).first
        if el.count():
            try:
                r.move_to(el, hold=0.6)
            except Exception:
                pass
    for label in ("價格", "數量", "價別", "效期"):
        el = page.get_by_text(label, exact=True).first
        if el.count():
            b = live_bbox(el)
            if b:
                r.move_xy(b["x"] + 90, b["y"] + b["height"] / 2, hold=0.7)
    time.sleep(1.5)
    return None


def a_ticket_two_step(page, r, seg):
    r.scroll_top()
    _fill_price(page, r, "230")
    time.sleep(0.5)
    zb = None
    buy = page.get_by_role("button", name="買進下單").first
    if buy.count():
        r.move_to(buy, hold=0.5)
        buy.click(timeout=6000)                # step 1: arm → 確認買進 …@230
        time.sleep(1.0)
    # frame the ARMED confirm button itself (capturing 買進下單's bbox BEFORE
    # arming landed on the 成交明細 panel below — QC MISMATCH). This is the
    # money shot: the button now reads 確認買進 …@230 (NOT sent).
    confirm = page.locator("button", has_text="確認買進").first
    cb = live_bbox(confirm) if confirm.count() else live_bbox(buy)
    if cb:
        zb = bbox_dict(cb)
        r.gold_frame(cb, "兩段式確認")
    # HOLD the armed state through the "按鈕變成確認買進…再點一下才送出" narration
    hold = max(3.0, est_dur(seg["narration"]) - 5.0)
    time.sleep(hold)
    r.clear_frames()
    page.keyboard.press("Escape")              # cancel WITHOUT sending
    time.sleep(1.0)
    return zb


def a_orders_tab(page, r, seg):
    # 訂單類型集：只解說「委託分頁怎麼看狀態」的觀念，不實際送單（非交易日送單會
    # 觸發 500 SolClient 錯誤畫面）。切到委託分頁、掃過狀態欄，旁白條件式帶四種狀態。
    r.scroll_top()
    r.mark()                                   # footage from the orders view
    tab = page.locator("button", has_text="委託 Orders")
    if tab.count():
        try:
            r.move_to(tab.first, hold=0.4)
            tab.first.click(timeout=6000)
            time.sleep(2.0)
        except Exception:
            pass
    r.move_xy(1300, 700, hold=0.8)             # gesture over the 狀態 column region
    time.sleep(2.4)
    return None


def a_chart_trade_modes(page, r, seg):
    # NON-TRADING-DAY SAFE: clicking the chart in 停損 mode fires the
    # 「尚未收到即時成交價」error toast (no live price). So we only SWITCH modes
    # to surface their on-chart hints — we NEVER click the chart. Order matches
    # the narration: (1) sweep the six modes → (2) warn on 點價買/點價賣 (one-
    # click send) → (3) switch to 停損 and hold its 「點擊價位掛停損」hint.
    tgt_dur = est_dur(seg["narration"])
    base = r.t()
    r.scroll_top()
    # (1) sweep the toolbar so all six modes read (游標…警示)
    for m in ("游標", "點價買", "點價賣", "停損", "停利", "警示"):
        el = page.get_by_role("button", name=m, exact=True).first
        if el.count():
            try:
                r.move_to(el, hold=0.35)
            except Exception:
                pass
    _until(r, base, tgt_dur, 0.30)
    # (2) switch to 點價買 then 點價賣 so their hint 「點擊圖表價位 → 限價買/賣」
    #     shows (setMode only — NO order placed, no chart click)
    for m in ("點價買", "點價賣"):
        el = page.get_by_role("button", name=m, exact=True).first
        if el.count():
            try:
                r.move_to(el, hold=0.35)
                el.click(timeout=5000)
                time.sleep(0.8)
            except Exception:
                pass
    _until(r, base, tgt_dur, 0.55)
    # (3) switch to 停損 and HOLD: toolbar visible, 停損 active, on-chart hint
    #     「點擊價位掛停損（觸價市價單）」shown. Hover the chart (no click).
    stop = page.get_by_role("button", name="停損", exact=True).first
    if stop.count() == 0:
        stop = page.locator("button", has_text="停損").first
    if stop.count():
        try:
            r.move_to(stop, hold=0.4)
            stop.click(timeout=5000)
            time.sleep(0.6)
        except Exception:
            pass
    box = live_bbox(page.locator("canvas").first)
    if box:                                    # gesture at 圖上點價位 — hover only
        r.smooth_move(box["x"] + box["width"] * 0.68,
                      box["y"] + box["height"] * 0.55)
    _until(r, base, tgt_dur, 0.97)
    obs = page.get_by_role("button", name="游標", exact=True).first
    if obs.count():
        try:
            obs.click(timeout=4000)            # reset to cursor mode (clean state)
        except Exception:
            pass
    return None


def a_trigger_hold(page, r, seg):
    # picture is the warn-client-trigger card in assembly; hold on the chart
    r.move_xy(900, 450, hold=0.6)
    time.sleep(2.0)
    return None


def a_flash_demo_txf(page, r, seg):
    """T4-6 閃電下單 — 依序：(1) 先講面板的『彈出獨立視窗』功能；(2) 彈出後
    在獨立視窗（同頁導向 ?popout=flash 呈現同一畫面）；(3) 拉到合適大小；
    (4) 點啟用下單 → 進入『點價即下單』；(5) 點擊下單→委託標籤→點標籤刪單。
    demo 錄完 r.cut_end() 收 footage，再導回工作區重掛載＋跳回 2317 給 t4-7/t4-8。"""
    r.jump("TXFR1")
    r.add_panel("閃電下單")
    r.mark()                                   # cut-start: inline panel + 彈出鈕
    zb = None
    # (1) 先講彈出功能 — 標註面板右上角的彈出鈕
    pop = page.locator("button[title*='彈出為獨立視窗']")
    pb = live_bbox(pop.last) if pop.count() else None
    if pb:
        r.gold_frame(pb, "彈出獨立視窗")
        r.move_xy(pb["x"] + pb["width"] / 2, pb["y"] + pb["height"] / 2, hold=1.4)
    time.sleep(1.6)
    r.clear_frames()
    # (2) 彈出後的獨立視窗畫面（同頁導向 ?popout=flash，內容與真正彈窗相同）
    page.goto(f"{BASE}/?popout=flash&code=TXFR1")
    en = page.get_by_role("button", name="啟用閃電下單")
    for _ in range(30):
        if en.count():
            break
        time.sleep(0.5)
    time.sleep(2.0)                            # (3) 拉到合適大小（口播帶過，視窗已填滿）
    # (4) 點擊啟用下單 → 出現「點價即下單」
    if en.count():
        try:
            r.move_to(en.last, hold=0.5)
            en.last.click(timeout=6000)
            time.sleep(2.0)
        except Exception:
            pass
    armed = page.get_by_text("點價即下單", exact=False)
    ab = live_bbox(armed.first) if armed.count() else None
    if ab:
        r.gold_frame(ab, "點價即下單")
        time.sleep(1.6)
        r.clear_frames()
    # (5) 點擊下單 — 點一格買價 → 委託標籤 → 點標籤刪單
    cells = page.locator("[class*='buyCell']")
    n = cells.count()
    if n:
        try:
            cell = cells.nth(min(n - 1, n // 2 + 3))
            r.move_to(cell, hold=0.4)
            cell.click(timeout=6000)           # 點價下單（SIM 假錢）
            time.sleep(2.6)
        except Exception:
            pass
    chip = page.locator("[class*='orderChip']")
    b = live_bbox(chip.first) if chip.count() else None
    if b:
        zb = bbox_dict(b)
        r.gold_frame(b, "委託標籤")
        try:
            r.move_to(chip.first, hold=0.4)
            chip.first.click(timeout=6000)     # 點標籤＝一鍵刪單
            time.sleep(2.2)
        except Exception:
            pass
    page.keyboard.press("Escape")              # 重新上鎖
    time.sleep(1.2)
    r.clear_frames()
    r.cut_end()                                # ← footage 到此為止（不含後面重掛載）
    # ---- 導回工作區，供 t4-7/t4-8 使用 ----
    page.goto(BASE)
    for _ in range(90):
        try:
            if (page.get_by_role("button", name="＋ 新增面板").count() > 0
                    and page.get_by_text("載入交易終端", exact=False).count() == 0):
                break
        except Exception:
            pass
        time.sleep(1.0)
    time.sleep(3.0)
    try:
        r.jump("2317")                         # 跳回本集商品，t4-8 才有可交易標的
    except Exception:
        pass
    time.sleep(1.5)
    return zb


def a_risk_menu(page, r, seg):
    r.dismiss()
    r.scroll_top()
    btn = page.get_by_role("button", name="風控").first
    if btn.count():
        r.move_to(btn, hold=0.3)
        btn.click(timeout=6000)
        time.sleep(1.2)
    r.mark()
    # hover the red Kill Switch + rule inputs — describe only, DON'T press lock
    kill = page.get_by_text("鎖定下單", exact=False)
    if kill.count():
        try:
            r.move_to(kill.first, hold=0.8)
        except Exception:
            pass
    rules = page.get_by_text("啟用風控規則", exact=False)
    if rules.count():
        try:
            r.move_to(rules.first, hold=0.8)
        except Exception:
            pass
    time.sleep(2.0)
    r.dismiss()
    return None


def a_esc_esc_with_orders(page, r, seg):
    # DIRECTOR FIX (t4-8): before Esc×2 there MUST be an in-flight, unfilled order,
    # else 全撤 cancels nothing and the toast reads「已送出 0/0 筆刪單」while the
    # narration claims the list cleared (說A演B). Jump 2317, send a fresh two-step
    # ROD buy well below market (230, SIMULATION/fake money) so it rests as an
    # unfilled 委託, watch it on the 委託 tab, THEN 連按兩次 Esc to 撤掉.
    # NOTE: t4-7 (a_risk_menu) only HOVERS the Kill Switch — never locks — and a
    # fresh browser context starts unlocked, so the send is not risk-blocked.
    r.dismiss()
    r.jump("2317")                             # ⌘K → clean 2317 ticket
    r.scroll_top()
    r.mark()                                   # footage = fill→send→委託→Esc×2 (no freeze)
    _fill_price(page, r, "230")                # 明顯低於市價 → 在途未成交
    buy = page.get_by_role("button", name="買進下單").first
    if buy.count():
        try:
            r.move_to(buy, hold=0.4)
            buy.click(timeout=6000)            # arm → 確認買進 …@230
            time.sleep(1.4)
            confirm = page.locator("button", has_text="確認買進").first
            if confirm.count():
                r.move_to(confirm.first, hold=0.4)
                confirm.first.click(timeout=6000)   # SEND (SIMULATION, fake money)
                time.sleep(2.5)
        except Exception:
            pass
    # watch the 委託 tab (also blurs the price input so the global Esc handler fires)
    tab = page.locator("button", has_text="委託 Orders")
    if tab.count():
        try:
            r.move_to(tab.first, hold=0.4)
            tab.first.click(timeout=6000)
        except Exception:
            pass
    time.sleep(1.8)
    # ensure body focus (not an <input>) so use-hotkeys' Esc handler isn't swallowed
    try:
        page.locator("body").click(position={"x": 900, "y": 650})
    except Exception:
        pass
    time.sleep(0.3)
    page.keyboard.press("Escape")              # 1st Esc → 「再按一次 Esc 全部刪單」
    time.sleep(0.4)
    page.keyboard.press("Escape")              # 2nd Esc → cancelAllOrders → 撤在途單
    time.sleep(3.2)
    return None


def a_esc_esc_prompt(page, r, seg):
    # DIRECTOR REWRITE (t4-8) — non-trading-day HONEST edit. Show ONLY the hotkey
    # + the FIRST-Esc confirm prompt「再按一次 Esc 全部刪單」; NEVER fire the 2nd-Esc
    # cancelAllOrders (on a non-trading day it surfaces「已送出 0/0 筆刪單」, which
    # the narration used to claim was the list clearing — 說A演B). use-hotkeys only
    # cancels when two Esc land <600ms apart (use-hotkeys.ts:38), so every Esc we
    # send is spaced ~2s (>600ms) and therefore only ever RE-shows that same 1st
    # prompt — it re-arms the 6s-lifetime toast so it stays on screen for the whole
    # segment incl. the freeze-padded tail. No order is ever placed or cancelled.
    t_entry = r.t()
    target = est_dur(seg["narration"])
    r.dismiss()
    r.scroll_top()
    # (1) switch to the 委託 tab so the picture rests on the order list
    tab = page.locator("button", has_text="委託 Orders")
    box = None
    if tab.count():
        try:
            r.move_to(tab.first, hold=0.4)
            tab.first.click(timeout=6000)
            box = tab.first.bounding_box()
        except Exception:
            pass
    time.sleep(1.2)
    # (2) click the neutral tab-bar spacer (probed: SPAN, no side effect) to drop
    #     focus off any input, then hard-blur as a belt-and-braces guarantee
    if box:
        nx = box["x"] + box["width"] + 220
        ny = box["y"] + box["height"] / 2
        try:
            r.click_xy(nx, ny, hold=0.3)
        except Exception:
            pass
    page.evaluate("document.activeElement && document.activeElement.blur && "
                  "document.activeElement.blur()")
    time.sleep(0.4)
    r.mark()                                   # cut-start = the 1st-Esc prompt
    # (3) press Esc ONCE → 「再按一次 Esc 全部刪單」toast, then keep re-arming the
    #     SAME 1st prompt on a >600ms cadence (never the <600ms cancel). Drift the
    #     cursor up toward the top-right prompt between presses.
    page.keyboard.press("Escape")
    time.sleep(0.5)
    r.move_xy(1580, 150, hold=0.5)             # look at the top-right prompt toast
    drift = [(1560, 210), (1600, 150), (1540, 190)]
    i = 0
    while r.t() - t_entry < target + 0.3:
        time.sleep(2.0)
        page.keyboard.press("Escape")          # still the「再按一次」1st prompt
        r.move_xy(*drift[i % len(drift)], hold=0.3)
        i += 1
    page.keyboard.press("Escape")              # final re-arm so the last frame shows it
    time.sleep(0.4)
    return None


# ─────────────────────── T5 · 指標 handlers ───────────────────────

def _click_hard(r, loc):
    """Move the cursor to loc, then fire React's onClick via dispatch_event —
    the 技術指標 dialog is a child of the chart grid-panel, so at fontScale 1.3
    sibling panels intermittently intercept Playwright's actionability click."""
    try:
        r.move_to(loc, hold=0.3)
    except Exception:
        pass
    try:
        loc.dispatch_event("click")
        return True
    except Exception:
        try:
            loc.click(timeout=4000, force=True)
            return True
        except Exception:
            return False


def _open_indicator_dialog(page, r):
    btn = page.get_by_role("button", name="指標").first
    if btn.count() == 0:
        btn = page.locator("button", has_text="指標").first
    if btn.count():
        try:
            r.move_to(btn, hold=0.4)
        except Exception:
            pass
        btn.click(timeout=6000)
        time.sleep(1.4)
        return True
    return False


def a_open_indicator_dialog(page, r, seg):
    r.scroll_top()
    _open_indicator_dialog(page, r)
    r.mark()
    # keep the 技術指標 選擇器 OPEN for the WHOLE segment — the narration
    # describes its 分類/搜尋/主圖·副圖 list, so the dialog must stay on screen.
    # DON'T dismiss here: the overlay covers the 指標 button, and t5-2 reuses the
    # open dialog (clicks an indicator) and closes it. Only drift over it.
    r.move_xy(660, 300, hold=0.6)              # 搜尋 row
    r.move_xy(540, 470, hold=0.6)              # 分類 sidebar
    r.move_xy(980, 500, hold=0.6)              # 主圖疊加 / 副圖指標 list
    r.move_xy(980, 700, hold=0.6)
    time.sleep(1.5)
    return None


def a_add_indicator(page, r, seg):
    tgt_dur = est_dur(seg["narration"])
    base = r.t()
    r.scroll_top()
    # the 技術指標 dialog may already be open (t5-1 left it open on purpose); its
    # overlay covers the 指標 toolbar button, so only (re)open when it's closed.
    if page.locator("button").filter(has_text="移動平均").count() == 0:
        _open_indicator_dialog(page, r)
    # click the 移動平均 (MA) row → per-instance 設定視窗 (輸入/樣式/時框顯示) + a
    # live on-chart MA(20) preview. dispatch the click on the <button> row (panel
    # interception blocks a normal click at fontScale 1.3).
    row = page.locator("button").filter(has_text="MA 移動平均").first
    if row.count() == 0:
        row = page.get_by_text("MA 移動平均", exact=False).first
    if row.count():
        _click_hard(r, row)
        time.sleep(2.2)                        # settings modal + on-chart preview
    r.mark()                                   # footage begins with the 設定視窗 open
    # DIRECTOR FIX (t5-2): keep the 指標設定視窗 OPEN for the WHOLE segment — the
    # narration walks 調週期／改顏色／換線型, so the dialog must stay on screen the
    # whole time (same principle as t5-1/t5-3 dialogs). Hover the 輸入(週期) then the
    # 樣式(顏色/線型) controls; only press 確定 at the very END (按確定才真的加上去).
    style_tab = page.get_by_role("button", name="樣式", exact=True).first
    # (a) dwell on 輸入 / 週期 through the opening (調週期)
    _until(r, base, tgt_dur, 0.30)
    period = page.get_by_role("spinbutton").first
    if period.count() == 0:
        period = page.locator("[class*='settings'] input").first
    if period.count():
        try:
            r.move_to(period, hold=0.7)
        except Exception:
            pass
    # (b) switch to 樣式 tab → reveals 顏色/線型 controls; hover them (改顏色/換線型)
    if style_tab.count():
        try:
            r.move_to(style_tab, hold=0.4)
            style_tab.click(timeout=4000)
            time.sleep(0.7)
        except Exception:
            pass
    _until(r, base, tgt_dur, 0.58)
    for title in ("顏色 / 透明度 / 粗細", "線型"):
        b = page.get_by_title(title).first
        if b.count():
            try:
                r.move_to(b, hold=0.7)         # 改顏色 / 換線型
            except Exception:
                pass
    _until(r, base, tgt_dur, 0.88)
    # (c) confirm at the very END → indicator really added
    ok = page.get_by_role("button", name="確定", exact=True).first
    if ok.count():
        _click_hard(r, ok)
        time.sleep(1.4)
    r.dismiss()
    return None


def a_legend_controls(page, r, seg):
    r.scroll_top()
    zb = None
    legend = page.locator("[class*='legend']").first
    b = live_bbox(legend)
    if b:
        zb = bbox_dict(b)
        r.gold_frame(b, "圖例")
        cx, cy = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
        r.smooth_move(cx, cy)                  # hover reveals eye/gear/x
        time.sleep(1.2)
        # nudge across the revealed controls (eye → gear → x)
        for dx in (60, 90, 120):
            r.move_xy(b["x"] + b["width"] + dx, cy, hold=0.7)
    time.sleep(1.6)
    r.clear_frames()
    return zb


def a_custom_indicator_editor(page, r, seg):
    tgt_dur = est_dur(seg["narration"])
    base = r.t()
    r.scroll_top()
    _open_indicator_dialog(page, r)
    # select the 自訂指標 category first, then hit the left-bottom
    # 「建立自訂指標」button (QC: a bare click sometimes missed → editor never
    # opened; verify the editor's 驗證/儲存 appears and retry if not).
    # dispatch the click straight on 建立自訂指標 (diagnostic-proven). Do NOT
    # pre-click the 自訂指標 category — name='自訂指標' also matches 建立自訂指標
    # and the extra click was breaking the open.
    for attempt in range(3):
        create = page.get_by_role("button", name="建立自訂指標").first
        if create.count() == 0:
            create = page.locator("button", has_text="建立自訂指標").first
        if create.count():
            _click_hard(r, create)             # dispatch_event fires onClick
            time.sleep(1.6)
        if page.get_by_role("button", name="驗證").count() or \
                page.get_by_text("語法說明", exact=False).count():
            break                              # editor is open
    r.mark()                                   # footage = the editor (open)
    # keep the 自訂指標編輯器 OPEN for the WHOLE segment — the narration
    # describes the JS editor / 驗證 / 沙箱試跑, so it must stay on screen the
    # whole time. Self-time to fill the narration (no dead padding tail), hover
    # 驗證 but DON'T close until the very end.
    verify = page.get_by_role("button", name="驗證").first
    while r.t() < base + tgt_dur * 0.93:
        r.move_xy(850, 460, hold=0.6)          # code area
        if verify.count():
            try:
                r.move_to(verify, hold=0.6)    # hover 驗證 (never click/run)
            except Exception:
                pass
        r.move_xy(980, 380, hold=0.6)
    # close the editor (its X) AND the dialog behind it, so t5-4 (add 策略回測)
    # isn't blocked by the overlay. Do this at the very end only.
    xb = page.locator("[class*='overlay'] [class*='closeBtn']")
    if xb.count():
        try:
            xb.last.click(timeout=3000, force=True)
            time.sleep(0.4)
        except Exception:
            pass
    r.dismiss()
    return None


def a_backtest_gate(page, r, seg):
    r.add_panel("策略回測")
    r.mark()
    try:
        page.get_by_text("策略回測", exact=False).last.scroll_into_view_if_needed(timeout=3000)
    except Exception:
        pass
    r.move_xy(700, 500, hold=0.8)
    time.sleep(2.4)
    return None


# ─────────────────────── AI Agent · 鎖定畫面 handler ───────────────────────
# Same FeatureGate lock-screen pattern as a_backtest_gate: add the 'AI Agent'
# panel (exact BLOCK_META label) → the open-source web build has no closed
# agent module, so App renders <FeatureGate feature='agent'> → the desktop-only
# lock screen ('AI Agent 為桌面版專屬功能 / … / 下載桌面版 →'). Dwell on it for
# the full narration so assemble3's retime k stays ≈ 1 (the screen is static).

def a_agent_gate(page, r, seg):
    tgt = est_dur(seg["narration"])
    # the trading terminal can take a while to finish loading; add_panel is only
    # meaningful once the workspace is up ('載入交易終端…' gone).
    for _ in range(80):
        if page.get_by_text("載入交易終端", exact=False).count() == 0:
            break
        time.sleep(0.5)
    time.sleep(1.0)
    r.add_panel("AI Agent")                     # exact label → assistant block
    panel = page.locator("[class*='panel']", has_text="AI Agent").last
    # wait for the FeatureGate desktop-only lock screen to render
    for _ in range(24):
        if (page.get_by_text("下載桌面版", exact=False).count()
                or page.get_by_text("為桌面版專屬功能", exact=False).count()):
            break
        time.sleep(0.4)
    try:
        r.center(panel)                          # centre the lock screen in frame
    except Exception:
        pass
    time.sleep(0.6)
    r.mark()                                     # footage starts on the lock screen
    mark_t = r.t()
    drift = [(820, 560), (980, 600), (900, 660), (800, 560)]
    i = 0
    while r.t() < mark_t + tgt:                  # dwell ≈ narration length
        r.move_xy(*drift[i % len(drift)], hold=0.9)
        i += 1
    return None


# ─────────────────────── T6 · 回放 handlers ───────────────────────

def _replay_panel(page):
    return page.locator("[class*='panel']", has_text="行情回放").last


def a_add_replay(page, r, seg):
    r.add_panel("行情回放")
    # wait for the ~51k ticks to finish loading (播放 enabled)
    play = page.get_by_role("button", name="播放")
    for _ in range(30):
        if play.count() and play.first.is_enabled():
            break
        time.sleep(0.5)
    r.center(_replay_panel(page))              # bring the 走勢線 chart into view
    r.mark()                                   # footage = the loaded replay line
    r.move_xy(700, 500, hold=0.8)
    time.sleep(2.0)
    return None


def a_replay_play(page, r, seg):
    r.center(_replay_panel(page))
    play = page.get_by_role("button", name="播放").first
    if play.count():
        try:
            r.move_to(play, hold=0.5)
            play.click(timeout=6000)           # → replay animates
            time.sleep(0.4)
        except Exception:
            pass
    r.mark()
    time.sleep(5.0)                            # watch it re-play (走勢線 extends)
    return None


def a_replay_speed(page, r, seg):
    r.center(_replay_panel(page))
    zb = None
    hundred = page.get_by_role("button", name="100x", exact=True).first
    b = live_bbox(hundred)
    if b:
        zb = bbox_dict(b)
        r.gold_frame(b, "變速")
    for sp in ("1x", "5x", "20x", "100x"):
        el = page.get_by_role("button", name=sp, exact=True).first
        if el.count():
            try:
                r.move_to(el, hold=0.4)
                el.click(timeout=5000)
                time.sleep(1.0)
            except Exception:
                pass
    # drag the progress slider to a review point
    sl = page.locator("input[type='range']").first
    sb = live_bbox(sl)
    if sb:
        y = sb["y"] + sb["height"] / 2
        r.smooth_move(sb["x"] + sb["width"] * 0.2, y)
        page.mouse.down()
        page.mouse.move(sb["x"] + sb["width"] * 0.6, y, steps=20)
        page.mouse.up()
        time.sleep(1.6)
    r.clear_frames()
    return zb


def a_replay_hold(page, r, seg):
    r.center(_replay_panel(page))
    r.move_xy(700, 500, hold=0.6)
    time.sleep(2.2)
    return None


# ─────────────────────── T7 · 期權 handlers ───────────────────────

def _optchain_panel(page):
    """The 選擇權 T 字 panel body (scoped so tr-clicks land on the table)."""
    return page.locator("[class*='panel']", has_text="CALL 買權").last


def _txf_atm(page):
    """Current TXF anchor (~ATM) read from the T 字 toolbar 'TXF <price>'."""
    try:
        el = page.locator("span", has_text="TXF").last
        digits = "".join(ch for ch in (el.inner_text() or "") if ch.isdigit())
        if len(digits) >= 4:
            return int(digits[:5]) if len(digits) >= 5 else int(digits)
    except Exception:
        pass
    return None


def a_add_optchain(page, r, seg):
    r.add_panel("選擇權 T 字")
    for _ in range(30):                        # wait for the TXO rows
        if page.get_by_text("履約價", exact=False).count():
            break
        time.sleep(0.5)
    r.center(_optchain_panel(page))            # bring the TABLE into view
    r.mark()
    r.move_xy(700, 620, hold=0.8)
    time.sleep(2.4)
    return None


def a_optchain_months(page, r, seg):
    r.center(_optchain_panel(page))
    zb = None
    months = page.locator("button", has_text="/")
    idxs = [i for i in range(min(months.count(), 10))
            if len((months.nth(i).inner_text() or "").strip()) == 7
            and (months.nth(i).inner_text() or "").strip()[4] == "/"]
    if idxs:
        b = live_bbox(months.nth(idxs[0]))
        if b:
            zb = bbox_dict(b)
            r.gold_frame(b, "到期月份")
    for i in idxs[:2]:
        try:
            r.move_to(months.nth(i), hold=0.4)
            months.nth(i).click(timeout=5000)
            time.sleep(1.4)
        except Exception:
            pass
    time.sleep(1.2)
    r.clear_frames()
    return zb


def _click_row_half(page, r, row, frac):
    """Click the left(0.18)/right(0.82) half of an on-screen T-字 row."""
    try:
        row.scroll_into_view_if_needed(timeout=3000)
        time.sleep(0.3)
    except Exception:
        pass
    b = live_bbox(row)
    if not b or b["y"] < 60 or b["y"] > 1030:
        return False
    x, y = b["x"] + b["width"] * frac, b["y"] + b["height"] / 2
    r.smooth_move(x, y)
    time.sleep(0.3)
    page.mouse.click(x, y)
    return True


def a_optchain_click(page, r, seg):
    # LEFT half of a row → CALL links the terminal; RIGHT half → PUT.
    r.center(_optchain_panel(page))
    rows = _optchain_panel(page).locator("tbody tr")
    n = rows.count()
    if n == 0:
        rows = _optchain_panel(page).locator("tr")
        n = rows.count()
    if n:
        # CALL side (verify the header retitles TXO…)
        if _click_row_half(page, r, rows.nth(min(n - 1, n // 2)), 0.18):
            time.sleep(2.6)
        # PUT side (a neighbouring row)
        if _click_row_half(page, r, rows.nth(min(n - 1, n // 2 + 1)), 0.82):
            time.sleep(2.6)
    return None


def a_combo_linked_arm_only(page, r, seg):
    r.add_panel("組合單")
    link = page.get_by_role("button", name="連動 T 字").first
    if link.count() == 0:
        link = page.locator("button", has_text="連動 T 字").first
    if link.count():
        try:
            r.center(link)
            r.move_to(link, hold=0.4)
            link.click(timeout=6000)           # enable 連動 so T字 clicks fill legs
            time.sleep(1.4)
        except Exception:
            pass
    r.mark()
    # click a CALL then a PUT in the T 字 to auto-fill the two legs
    r.center(_optchain_panel(page))
    rows = _optchain_panel(page).locator("tbody tr")
    n = rows.count()
    if n:
        _click_row_half(page, r, rows.nth(min(n - 1, n // 2)), 0.18)
        time.sleep(1.8)
        _click_row_half(page, r, rows.nth(min(n - 1, n // 2 + 1)), 0.82)
        time.sleep(1.8)
    # arm ONLY (never send the 2nd step)
    combo_btn = page.locator("button", has_text="組合下單")
    if combo_btn.count():
        try:
            cb = combo_btn.last
            r.center(cb)
            r.move_to(cb, hold=0.5)
            cb.click(timeout=6000)             # → 確認…組合 (ARMED; NOT sent)
            time.sleep(2.6)
        except Exception:
            pass
    time.sleep(1.2)
    return None


def a_payoff_with_sim_legs(page, r, seg):
    r.add_panel("選擇權損益圖")
    payoff = page.locator("[class*='panel']", has_text="結算損益試算").last
    r.center(payoff)
    r.mark()
    # strikes near the real ATM (~TXF price) so the curve sits around現價
    atm = _txf_atm(page) or 43000
    base = round(atm / 100) * 100
    legs = [("Buy", base, "100"), ("Sell", base + 1000, "60")]  # bull call spread

    for side, strike, prem in legs:
        try:
            # scope the sim-row 買/賣 toggle to the payoff panel (avoid the
            # ticket's 買進 Buy elsewhere)
            sbtn = payoff.get_by_role("button", name="買" if side == "Buy" else "賣").last
            r.move_to(sbtn, hold=0.3)
            sbtn.click(timeout=4000)
        except Exception:
            pass
        try:
            strike_in = payoff.get_by_placeholder("履約價").last
            prem_in = payoff.get_by_placeholder("權利金").last
            strike_in.fill(""); strike_in.type(str(strike), delay=60)
            prem_in.fill(""); prem_in.type(prem, delay=60)
            time.sleep(0.5)
            addb = payoff.get_by_role("button", name="＋模擬").last
            r.move_to(addb, hold=0.35)
            addb.click(timeout=5000)           # add the simulated leg
            time.sleep(1.8)
        except Exception:
            pass
    time.sleep(2.4)                            # payoff curve drawn
    return None


# ─────────────────────── A5 · 效率與介面工具 handlers ───────────────────────
# Panels: 權證篩選器 / 個股期選擇器 / 通知中心 / 診斷 Debug (all singleton). Top
# menu: 主題 (theme/漲跌配色/字級/音效/隱私). ⌘K palette supports Chinese-name
# search (searchStocks does name.includes). Privacy-mode init script starts with
# the ACCOUNT already masked — HARD RULE: never unmask it (only demo 金額遮蔽/音效).

def _panel(page, label):
    """Newest on-screen panel whose body contains `label` (scoped selectors)."""
    return page.locator("[class*='panel']", has_text=label).last


def _ensure_body_focus(page):
    """Drop focus off any <input> so the global B/S/Esc hotkeys fire — use-hotkeys
    ignores keys while an INPUT/TEXTAREA/SELECT is focused (use-hotkeys.ts:35)."""
    try:
        page.evaluate("document.activeElement && document.activeElement.blur && "
                      "document.activeElement.blur()")
    except Exception:
        pass


def _pick_underlying(page, r, panel, code="2330"):
    """Type a stock into a panel's UnderlyingPicker and Enter-select the top hit
    (onKeyDown Enter → suggestions[0]; underlying-picker.tsx:50)."""
    up = panel.get_by_placeholder("輸入股票代碼或名稱").last
    if up.count() == 0:
        return
    try:
        r.move_to(up, hold=0.3)
        up.click(timeout=5000)
        up.type(code, delay=95)
        time.sleep(1.5)                         # suggestion list renders
        up.press("Enter")                       # select top → 2330 台積電
        time.sleep(2.0)
    except Exception:
        pass


def a_cmdk_search(page, r, seg):
    # demo the ⌘K palette + CHINESE stock-name search (台積電 → 2330). Keep the
    # palette OPEN for the bulk of the narration (which describes the search box
    # the whole time) — dwell on the box/suggestion, press Enter only near the
    # end (整個終端就連動過去). Same "hold the dialog open" pattern as T5.
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.dismiss()
    r.move_xy(1280, 720, hold=0.3)              # neutral, cursor visible
    page.keyboard.press("Control+KeyK")
    time.sleep(1.0)
    r.mark()                                    # footage from the open palette
    page.keyboard.type("台積電", delay=170)      # Chinese-name search
    time.sleep(1.3)                             # suggestion dropdown renders
    # dwell on the palette (box + 台積電 suggestion) across the narration; moving
    # the cursor never closes it (only a click on the overlay would).
    while r.t() < base + tgt * 0.72:
        r.move_xy(1280, 360, hold=0.7)          # over the suggestion row
        r.move_xy(1180, 300, hold=0.7)          # back over the input
    page.keyboard.press("Enter")                # jump to the top suggestion (2330)
    time.sleep(2.2)
    r.dismiss()
    r.move_xy(1280, 720, hold=0.4)
    return None


def a_hotkeys_bs_esc(page, r, seg):
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.dismiss()
    r.scroll_top()
    # (0) ensure a 下單面板 exists
    if page.get_by_role("button", name="買進 Buy").count() == 0:
        r.add_panel("下單面板")
        r.scroll_top()
    # pre-set the ticket to 賣出 (BEFORE footage) so the later B keypress lands as
    # a VISIBLE Buy↔Sell switch rather than a no-op on the default Buy state.
    _ensure_body_focus(page)
    page.keyboard.press("KeyS")
    time.sleep(0.6)
    r.mark()                                    # footage starts (ticket on 賣出)
    # (a) B → ticket switches to 買進
    buy = page.get_by_role("button", name="買進 Buy").first
    bb = live_bbox(buy)
    if bb:
        r.move_xy(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2, hold=0.4)
    _ensure_body_focus(page)
    page.keyboard.press("KeyB")
    time.sleep(0.5)
    _until(r, base, tgt, 0.30)
    # (b) S → ticket switches to 賣出
    sell = page.get_by_role("button", name="賣出 Sell").first
    sbx = live_bbox(sell)
    if sbx:
        r.move_xy(sbx["x"] + sbx["width"] / 2, sbx["y"] + sbx["height"] / 2, hold=0.4)
    _ensure_body_focus(page)
    page.keyboard.press("KeyS")
    time.sleep(0.5)
    _until(r, base, tgt, 0.52)
    # (c) switch to the 委託 tab so the Esc prompt rests over the order list
    tab = page.locator("button", has_text="委託 Orders")
    if tab.count():
        try:
            r.move_to(tab.first, hold=0.3)
            tab.first.click(timeout=6000)
        except Exception:
            pass
    _ensure_body_focus(page)
    time.sleep(0.4)
    # (d) Esc ONCE → 「再按一次 Esc 全部刪單」prompt; re-arm on a >600ms cadence so
    #     it stays on screen — NEVER a 2nd Esc <600ms (would 全撤 → 0/0 on a
    #     non-trading day; narration is conditioned on 盤中確認 before the 2nd).
    page.keyboard.press("Escape")
    time.sleep(0.5)
    r.move_xy(2100, 200, hold=0.5)              # look toward the top-right prompt
    drift = [(2080, 260), (2140, 200), (2060, 240)]
    i = 0
    while r.t() < base + tgt - 0.4:
        time.sleep(2.0)
        page.keyboard.press("Escape")           # still the「再按一次」1st prompt
        r.move_xy(*drift[i % len(drift)], hold=0.3)
        i += 1
    page.keyboard.press("Escape")               # final re-arm for the last frame
    time.sleep(0.4)
    return None


def a_warrants_panel(page, r, seg):
    r.add_panel("權證篩選器")
    r.mark()
    panel = _panel(page, "權證篩選器")
    _pick_underlying(page, r, panel, "2330")    # 選 2330 當標的
    try:
        page.get_by_text("權證篩選器", exact=False).last.scroll_into_view_if_needed(timeout=3000)
    except Exception:
        pass
    time.sleep(0.6)
    # segment filter buttons (toolbar order: 全部 / 認購 / 認售) — click 認購→認售→全部.
    # .first = the toolbar button (rendered before any table 類型 cell).
    for lbl in ("認購", "認售", "全部"):
        b = panel.get_by_role("button", name=lbl, exact=True).first
        if b.count():
            try:
                r.move_to(b, hold=0.3)
                b.click(timeout=5000)
                time.sleep(1.0)
            except Exception:
                pass
    # glance over the 到期區間 / 排序 selects
    for aria in ("到期區間", "權證排序"):
        el = panel.get_by_label(aria).first
        eb = live_bbox(el)
        if eb:
            r.move_xy(eb["x"] + eb["width"] / 2, eb["y"] + eb["height"] / 2, hold=0.6)
    # drift down the result table
    pb = live_bbox(panel)
    if pb:
        r.move_xy(pb["x"] + pb["width"] * 0.4, pb["y"] + pb["height"] * 0.7, hold=0.8)
    time.sleep(1.6)
    return None


def a_stockfutures_panel(page, r, seg):
    r.add_panel("個股期選擇器")
    r.mark()
    panel = _panel(page, "個股期選擇器")
    _pick_underlying(page, r, panel, "2330")
    try:
        page.get_by_text("個股期選擇器", exact=False).last.scroll_into_view_if_needed(timeout=3000)
    except Exception:
        pass
    time.sleep(0.6)
    pb = live_bbox(panel)
    if pb:
        cx = pb["x"] + pb["width"] * 0.4
        r.move_xy(cx, pb["y"] + pb["height"] * 0.45, hold=0.9)   # over the contract list
        r.move_xy(cx, pb["y"] + pb["height"] * 0.75, hold=0.9)
    time.sleep(1.8)
    return None


def a_notices_panel(page, r, seg):
    r.add_panel("通知中心")
    r.mark()
    panel = _panel(page, "通知中心")
    try:
        page.get_by_text("通知中心", exact=False).last.scroll_into_view_if_needed(timeout=3000)
    except Exception:
        pass
    time.sleep(0.6)
    # filter buttons 全部 / 成功 / 錯誤 / 訊息 (scoped to this panel)
    for lbl in ("成功", "錯誤", "訊息", "全部"):
        b = panel.get_by_role("button", name=lbl, exact=True).first
        if b.count():
            try:
                r.move_to(b, hold=0.3)
                b.click(timeout=5000)
                time.sleep(0.9)
            except Exception:
                pass
    pb = live_bbox(panel)
    if pb:
        r.move_xy(pb["x"] + pb["width"] * 0.4, pb["y"] + pb["height"] * 0.6, hold=0.9)
    time.sleep(1.5)
    return None


def a_debug_panel(page, r, seg):
    r.add_panel("診斷 Debug")
    r.mark()
    panel = _panel(page, "診斷")
    try:
        page.get_by_text("診斷", exact=False).last.scroll_into_view_if_needed(timeout=3000)
    except Exception:
        pass
    time.sleep(0.6)
    pb = live_bbox(panel)
    if pb:
        cx = pb["x"] + pb["width"] * 0.45
        r.move_xy(cx, pb["y"] + 130, hold=0.9)              # 版本/心跳/速率/訂閱 grid
        r.move_xy(cx, pb["y"] + pb["height"] * 0.5, hold=0.9)  # Token/伺服器
        r.move_xy(cx, pb["y"] + pb["height"] * 0.82, hold=0.9)  # 最近 order_event
    time.sleep(2.0)
    return None


def a_theme_menu(page, r, seg):
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.dismiss()
    r.scroll_top()
    btn = page.get_by_role("button", name="主題").first
    r.move_to(btn, hold=0.3)
    btn.click(timeout=6000)
    time.sleep(1.0)
    r.mark()

    def opt(label):
        b = page.get_by_role("button", name=label, exact=True).first
        if b.count():
            try:
                r.move_to(b, hold=0.35)
                b.click(timeout=5000)
                time.sleep(0.9)
            except Exception:
                pass

    # (a) 底色: 純黑 → 淺色 → 深色 (restore the recording's dark theme)
    opt("純黑")
    _until(r, base, tgt, 0.28)
    opt("淺色")
    _until(r, base, tgt, 0.44)
    opt("深色")
    _until(r, base, tgt, 0.56)
    # (b) 漲跌配色: 綠漲紅跌 (intl) → 紅漲綠跌 (tw, restore)
    opt("綠漲紅跌")
    _until(r, base, tgt, 0.70)
    opt("紅漲綠跌")
    _until(r, base, tgt, 0.80)
    # (c) 字級: 大 → 特大 (restore, keeps recording's fontScale 1.3)
    opt("大")
    _until(r, base, tgt, 0.92)
    opt("特大")
    time.sleep(0.6)
    r.dismiss()                                 # close via backdrop (NOT Esc → toast)
    return None


def a_privacy_sound(page, r, seg):
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.dismiss()
    r.scroll_top()
    btn = page.get_by_role("button", name="主題").first
    r.move_to(btn, hold=0.3)
    btn.click(timeout=6000)
    time.sleep(1.0)
    r.mark()
    # (a) account mask ALREADY on ('帳號已遮蔽' via privacy-mode init) — HARD RULE:
    #     never unmask. Only point at it (no click).
    acc = page.get_by_role("button", name="帳號已遮蔽").first
    if acc.count():
        try:
            r.move_to(acc, hold=1.0)
        except Exception:
            pass
    _until(r, base, tgt, 0.30)
    # (b) money mask: currently off ('顯示完整金額') → click to MASK amounts, hold
    money = page.get_by_role("button", name="顯示完整金額").first
    if money.count():
        try:
            r.move_to(money, hold=0.35)
            money.click(timeout=5000)           # → 金額已遮蔽 (amounts → dots)
            time.sleep(1.3)
        except Exception:
            pass
    _until(r, base, tgt, 0.54)
    # (c) 音效 toggle (show the switch), then restore
    snd = page.locator("button").filter(has_text="音效").first
    if snd.count():
        try:
            r.move_to(snd, hold=0.35)
            snd.click(timeout=5000)
            time.sleep(1.0)
        except Exception:
            pass
    _until(r, base, tgt, 0.74)
    snd2 = page.locator("button").filter(has_text="音效").first
    if snd2.count():
        try:
            r.move_to(snd2, hold=0.3)
            snd2.click(timeout=5000)            # restore sound
            time.sleep(0.8)
        except Exception:
            pass
    _until(r, base, tgt, 0.90)
    # restore money mask to original (顯示完整金額)
    money2 = page.get_by_role("button", name="金額已遮蔽").first
    if money2.count():
        try:
            r.move_to(money2, hold=0.3)
            money2.click(timeout=5000)
            time.sleep(0.7)
        except Exception:
            pass
    time.sleep(0.5)
    r.dismiss()
    return None


# ─────────────── 進6 訂單與委託 · 進8 一鏡到底（下單面板）handlers ───────────────
# All operate on the live OrderTicket (order-ticket.tsx). Seg-group buttons are
# plain-text buttons (LMT/MKT/ROD/IOC/FOK/整股/零股); 現股當沖先賣 row only shows
# on 股票+賣出+整股+day_trade=Yes. Verified on 2317 (probe_p68b).

def _ticket_panel(page):
    """The 下單面板 container (only panel whose body has 買進 Buy)."""
    return page.locator("[class*='panel']").filter(has_text="買進 Buy").last


def _ticket_bbox(page, tries=6):
    """Stable bbox of the ticket panel (retries — right after a jump the panel
    can briefly return a null/tiny box; the tour segments must all zoom-crop to
    the same region for visual consistency)."""
    loc = _ticket_panel(page)
    for _ in range(tries):
        b = live_bbox(loc)
        if b and b["width"] > 200 and b["height"] > 200:
            return b
        time.sleep(0.4)
    return None


def _seg_btn(page, label):
    """A ticket seg-group button by exact text."""
    return page.get_by_role("button", name=label, exact=True)


def a_ticket_overview(page, r, seg):
    r.scroll_top()
    tb = _ticket_bbox(page)
    for name in ("買進 Buy", "賣出 Sell"):
        el = page.get_by_role("button", name=name).first
        if el.count():
            try:
                r.move_to(el, hold=0.5)
            except Exception:
                pass
    for label in ("價別", "效期", "單位"):
        el = page.get_by_text(label, exact=True).first
        if el.count():
            b = live_bbox(el)
            if b:
                r.move_xy(b["x"] + 120, b["y"] + b["height"] / 2, hold=0.6)
    time.sleep(1.2)
    return bbox_dict(tb) if tb else None


def a_ticket_price_type(page, r, seg):
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.scroll_top()
    tb = _ticket_bbox(page)
    lmt = _seg_btn(page, "LMT").first
    if lmt.count():
        try:
            r.move_to(lmt, hold=0.5)              # 限價 (default active) — dwell
        except Exception:
            pass
    _until(r, base, tgt, 0.45)
    mkt = _seg_btn(page, "MKT").first             # → 市價：價格欄鎖 'MKT'、效期自動 IOC
    if mkt.count():
        try:
            r.move_to(mkt, hold=0.4)
            mkt.click(timeout=5000)
            time.sleep(1.2)
        except Exception:
            pass
    _until(r, base, tgt, 0.85)
    if lmt.count():                               # 切回限價（新手建議）
        try:
            r.move_to(lmt, hold=0.3)
            lmt.click(timeout=5000)
            time.sleep(0.6)
        except Exception:
            pass
    return bbox_dict(tb) if tb else None


def a_ticket_validity(page, r, seg):
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.scroll_top()
    tb = _ticket_bbox(page)
    for lab, fr in (("ROD", 0.30), ("IOC", 0.58), ("FOK", 0.82)):
        el = _seg_btn(page, lab).first
        if el.count():
            try:
                r.move_to(el, hold=0.4)
                el.click(timeout=5000)
                time.sleep(0.7)
            except Exception:
                pass
        _until(r, base, tgt, fr)
    rod = _seg_btn(page, "ROD").first             # settle back on 最常用 ROD
    if rod.count():
        try:
            rod.click(timeout=4000)
        except Exception:
            pass
    return bbox_dict(tb) if tb else None


def a_ticket_unit_daytrade(page, r, seg):
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.scroll_top()
    tb = _ticket_bbox(page)
    odd = _seg_btn(page, "零股").first             # 整股 → 零股
    if odd.count():
        try:
            r.move_to(odd, hold=0.4)
            odd.click(timeout=5000)
            time.sleep(0.9)
        except Exception:
            pass
    _until(r, base, tgt, 0.40)
    common = _seg_btn(page, "整股").first          # 零股 → 整股
    if common.count():
        try:
            r.move_to(common, hold=0.3)
            common.click(timeout=5000)
            time.sleep(0.5)
        except Exception:
            pass
    _until(r, base, tgt, 0.55)
    # 賣出 + 整股 → 現股當沖先賣 列出現 (2317 day_trade=Yes)
    sell = page.get_by_role("button", name="賣出 Sell").first
    if sell.count():
        try:
            r.move_to(sell, hold=0.3)
            sell.click(timeout=5000)
            time.sleep(1.0)
        except Exception:
            pass
    ds = page.locator("button", has_text="現股當沖先賣").first
    db = live_bbox(ds) if ds.count() else None
    if db:
        r.gold_frame(db, "現股當沖")
        r.move_xy(db["x"] + db["width"] / 2, db["y"] + db["height"] / 2, hold=0.8)
    _until(r, base, tgt, 0.92)
    r.clear_frames()
    buy = page.get_by_role("button", name="買進 Buy").first   # reset for o-6 send
    if buy.count():
        try:
            buy.click(timeout=4000)
        except Exception:
            pass
    return bbox_dict(tb) if tb else None


def a_place_order(page, r, seg):
    """P8 w-3 — 限價、零股、兩段式防呆（展示 arm 到「確認買進」，不做最後送出：
    非交易日實際送單會觸發 500 SolClient 錯誤畫面；旁白描述「要再按一下才送出」，
    畫面停在 armed 狀態即與旁白相符）。"""
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.scroll_top()
    odd = _seg_btn(page, "零股").first             # 切零股
    if odd.count():
        try:
            r.move_to(odd, hold=0.4)
            odd.click(timeout=5000)
            time.sleep(0.8)
        except Exception:
            pass
    _fill_price(page, r, "2400")                   # 限價（2330 參考2470/漲停2715 帶內）
    qty = page.locator(
        "xpath=//span[starts-with(text(),'數量')]/following::input[1]")
    if qty.count():
        try:
            r.move_to(qty.first, hold=0.3)
            qty.first.fill("")
            qty.first.type("80", delay=90)         # 零股股數（20萬約買 80 股）
            time.sleep(0.7)
        except Exception:
            pass
    _until(r, base, tgt, 0.5)
    buy = page.get_by_role("button", name="買進下單").first
    if buy.count():
        try:
            r.move_to(buy, hold=0.4)
            buy.click(timeout=6000)                # step 1: arm → 確認買進 (NOT sent)
            time.sleep(1.2)
        except Exception:
            pass
    confirm = page.locator("button", has_text="確認買進").first   # money shot: armed
    cb = live_bbox(confirm) if confirm.count() else None
    if cb:
        r.gold_frame(cb, "兩段式防呆")
        r.move_xy(cb["x"] + cb["width"] / 2, cb["y"] + cb["height"] / 2, hold=0.8)
    _until(r, base, tgt, 0.95)
    r.clear_frames()
    page.keyboard.press("Escape")                  # cancel WITHOUT sending
    time.sleep(0.6)
    return None


def a_orders_view(page, r, seg):
    """P8 w-4 — just switch to 委託 tab and read 狀態 (order already sent in w-3)."""
    r.scroll_top()
    r.mark()
    tab = page.locator("button", has_text="委託 Orders").first
    if tab.count():
        try:
            r.move_to(tab, hold=0.4)
            tab.click(timeout=6000)
            time.sleep(2.2)
        except Exception:
            pass
    # gesture over the 狀態 column region
    r.move_xy(1300, 720, hold=0.6)
    time.sleep(1.8)
    return None


def a_stop_mode_demo(page, r, seg):
    """P8 w-5 — switch chart to 停損 mode, show its on-chart hint, NO chart
    click (non-trading day has no live price → clicking fires an error toast)."""
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.scroll_top()
    stop = page.get_by_role("button", name="停損", exact=True).first
    if stop.count() == 0:
        stop = page.locator("button", has_text="停損").first
    if stop.count():
        try:
            r.move_to(stop, hold=0.4)
            stop.click(timeout=5000)
            time.sleep(0.8)
        except Exception:
            pass
    _until(r, base, tgt, 0.5)
    box = live_bbox(page.locator("canvas").first)
    if box:                                        # gesture 圖上點價位 — hover only
        r.smooth_move(box["x"] + box["width"] * 0.66,
                      box["y"] + box["height"] * 0.5)
    _until(r, base, tgt, 0.95)
    cur = page.get_by_role("button", name="游標", exact=True).first
    if cur.count():
        try:
            cur.click(timeout=4000)                # reset to cursor mode
        except Exception:
            pass
    return None


# ─────────────── 進7 帳務與交割安全（帳務分頁 · 全帳戶）handlers ───────────────
# BottomDock (bottom-dock.tsx) 帳務 Account tab. Non-trading day: 交割帳戶餘額 +
# 權益數/可用/原始/維持保證金/風險指標/期貨平倉損益 cards exist (values 0);
# 股票市值/資產市值/交割款/資產分布甜甜圈/前五大 need positions → absent
# (a-7 handled by 靜態卡 in assemble3). Verified p678-report.json.

def _account_tab(page, r):
    tab = page.locator("button", has_text="帳務 Account").first
    if tab.count():
        try:
            tab.scroll_into_view_if_needed(timeout=4000)
            time.sleep(0.4)
            r.move_to(tab, hold=0.4)
            tab.click(timeout=5000)
            time.sleep(1.8)
        except Exception:
            pass


def _stat_card(page, label):
    return page.locator("[class*='statCard']").filter(has_text=label).first


def a_account_overview(page, r, seg):
    r.dismiss()
    _account_tab(page, r)
    r.mark()
    cards = page.locator("[class*='statCard']")
    n = cards.count()
    for i in range(min(n, 4)):                     # drift across the water-level cards
        b = live_bbox(cards.nth(i))
        if b:
            r.move_xy(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, hold=0.5)
    time.sleep(1.6)
    return None


def a_account_balance(page, r, seg):
    _account_tab(page, r)                          # ensure on 帳務
    r.mark()
    card = _stat_card(page, "證券交割帳戶")
    cb = live_bbox(card) if card.count() else None
    if cb:
        r.gold_frame(cb, "可動用的錢")
        r.move_xy(cb["x"] + cb["width"] / 2, cb["y"] + cb["height"] / 2, hold=0.8)
    time.sleep(2.2)
    r.clear_frames()
    return bbox_dict(cb) if cb else None


def a_account_margin_risk(page, r, seg):
    _account_tab(page, r)
    r.mark()
    boxes = []
    for lab in ("權益數", "可用保證金", "風險指標"):
        c = _stat_card(page, lab)
        b = live_bbox(c) if c.count() else None
        if b:
            r.gold_frame(b, lab)
            boxes.append(b)
    if boxes:
        last = boxes[-1]                           # dwell on 風險指標
        r.move_xy(last["x"] + last["width"] / 2,
                  last["y"] + last["height"] / 2, hold=1.0)
    time.sleep(2.2)
    r.clear_frames()
    if boxes:                                      # union bbox → assemble crops here
        x0 = min(b["x"] for b in boxes)
        y0 = min(b["y"] for b in boxes)
        x1 = max(b["x"] + b["width"] for b in boxes)
        y1 = max(b["y"] + b["height"] for b in boxes)
        return {"x": round(x0), "y": round(y0),
                "w": round(x1 - x0), "h": round(y1 - y0)}
    return None


def a_pick_stock(page, r, seg):
    """P8 w-1 — show the 排行榜 複選 screening tool, then link a stock. On a
    non-trading day the ranking list is often empty (排行資料無法取得) → fall back
    to picking from the watchlist (spec 明列「或自選點一檔」). Terminal switches
    2330 → 2317 so the rest of the episode runs on clean-history 2317."""
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.dismiss()
    r.scroll_top()
    multi = page.get_by_role("button", name="複選", exact=True).first
    if multi.count():
        try:
            r.move_to(multi, hold=0.4)
            multi.click(timeout=5000)              # expand the three thresholds
            time.sleep(0.9)
        except Exception:
            pass
    inputs = page.locator("[class*='scanner'] input")
    for i, v in zip(range(min(inputs.count(), 3)), ["2", "5", "1"]):
        try:
            el = inputs.nth(i)
            r.move_to(el, hold=0.2)
            el.fill("")
            el.type(v, delay=70)
            time.sleep(0.3)
        except Exception:
            pass
    _until(r, base, tgt, 0.45)
    picked = False
    rows = page.locator("[class*='scanner-panel_row']")
    if rows.count():
        try:
            cell = rows.first.locator("[class*='scCode']").first
            r.move_to(cell, hold=0.4)
            cell.click(timeout=5000)
            time.sleep(2.4)
            picked = True
        except Exception:
            pass
    if not picked:
        inp = page.get_by_placeholder("股票、期貨或指數（如 台積電期）")
        if inp.count():
            for code in ("2317", "2454"):
                try:
                    r.move_to(inp.first, hold=0.2)
                    inp.first.fill("")
                    inp.first.type(code, delay=100)
                    time.sleep(1.2)
                    inp.first.press("Enter")
                    time.sleep(1.4)
                except Exception:
                    pass
        row = page.get_by_text("2317", exact=True)
        if row.count():
            try:
                r.move_to(row.first, hold=0.5)
                row.first.click(timeout=5000)      # link 2330 → 2317
                time.sleep(2.4)
            except Exception:
                pass
    # B1 FIX: pin the rest of the episode to 2330 (台積電) so the 算量/下單
    # 數字對得上螢幕、且零股範例「本金<一張」成立（QC 抓過 230 超漲停、
    # 2000股=2整張的矛盾）。
    try:
        r.jump("2330")
        time.sleep(1.8)
    except Exception:
        pass
    _until(r, base, tgt, 0.95)
    return None


def a_size_calc(page, r, seg):
    """P8 w-2 — hypothetical position-sizing (narration says 假設一百塊). Just
    dwell over the current-price header; no live price is claimed."""
    r.scroll_top()
    r.move_xy(1400, 195, hold=1.0)                 # chart 參考/現價 header area
    r.move_xy(470, 175, hold=1.0)                  # symbol + price (top-left of K線)
    r.move_xy(1750, 470, hold=0.8)                 # ticket 價格 field
    time.sleep(2.4)
    return None


# ─────────────── 進9 分批鋪單與到價觸發 handlers ───────────────
# 鋪單面板 (GridTicket, grid-ticket.tsx)。非交易日「鋪 N 檔」送出鈕天然 disabled
# (!live→⚠未連線)，故只做設定與導覽、絕不送單；動態跟隨會自動送真單→嚴禁點。

def _grid_panel(page):
    """The 鋪單 GridTicket panel (its body carries the 買進鋪單 tab)."""
    return page.locator("[class*='panel']").filter(has_text="買進鋪單").last


def _grid_set(page, r, label, value):
    """Set a grid numeric field (起始檔距/檔數/間隔/每檔量) by its label."""
    gp = _grid_panel(page)
    row = gp.locator("[class*='fieldRow']").filter(has_text=label).first
    inp = row.locator("input").first
    if inp.count():
        try:
            r.move_to(inp, hold=0.2)
            inp.click(timeout=4000)
            inp.fill(str(value))
            time.sleep(0.4)
        except Exception:
            pass


def a_grid_open(page, r, seg):
    """g-2 — 新增鋪單面板，金框導覽兩分頁與四個數字欄（不點鋪 N 檔）。"""
    r.dismiss()
    r.add_panel("鋪單")
    time.sleep(1.0)
    r.mark()
    gp = _grid_panel(page)
    for name in ("買進鋪單", "賣出鋪單"):
        b = gp.get_by_role("button", name=name)
        bb = live_bbox(b.first) if b.count() else None
        if bb:
            r.gold_frame(bb, name)
            r.move_xy(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2, hold=0.5)
    time.sleep(0.6)
    r.clear_frames()
    for label in ("起始檔距", "檔數", "間隔", "每檔量"):
        row = gp.locator("[class*='fieldRow']").filter(has_text=label).first
        rb = live_bbox(row) if row.count() else None
        if rb:
            r.gold_frame(rb, label)
            r.move_xy(rb["x"] + rb["width"] / 2, rb["y"] + rb["height"] / 2, hold=0.5)
    time.sleep(1.6)
    r.clear_frames()
    return None


def a_grid_buy_setup(page, r, seg):
    """g-3 — 買進鋪單分頁設定 起始檔距2/檔數5/間隔1/每檔量1，金框預覽區間。"""
    gp = _grid_panel(page)
    buytab = gp.get_by_role("button", name="買進鋪單")
    if buytab.count():
        try:
            buytab.first.click(timeout=4000)
            time.sleep(0.5)
        except Exception:
            pass
    r.mark()
    _grid_set(page, r, "起始檔距", 2)
    _grid_set(page, r, "檔數", 5)
    _grid_set(page, r, "間隔", 1)
    _grid_set(page, r, "每檔量", 1)
    time.sleep(0.9)
    prev = gp.locator("[class*='costRow']").filter(has_text="預覽")
    pb = live_bbox(prev.first) if prev.count() else None
    if pb:
        r.gold_frame(pb, "預覽階梯區間")
        r.move_xy(pb["x"] + pb["width"] / 2, pb["y"] + pb["height"] / 2, hold=1.0)
    time.sleep(2.2)
    r.clear_frames()
    return bbox_dict(pb) if pb else None


def a_grid_arm_follow(page, r, seg):
    """g-4 — 解鎖鋪單→已解鎖，金框全撤/動態跟隨（只解說不點跟隨），結束再上鎖。"""
    gp = _grid_panel(page)
    r.mark()
    arm = gp.get_by_role("button", name="解鎖鋪單")
    if arm.count():
        try:
            r.move_to(arm.first, hold=0.4)
            arm.first.click(timeout=5000)          # → 已解鎖 (純本機狀態, 安全)
            time.sleep(1.4)
        except Exception:
            pass
    for name in ("全撤", "動態跟隨"):
        b = gp.locator("button", has_text=name)
        bb = live_bbox(b.first) if b.count() else None
        if bb:
            r.gold_frame(bb, name if name != "動態跟隨" else "動態跟隨現價")
            r.move_xy(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2, hold=0.8)
            time.sleep(0.6)
    time.sleep(1.4)
    r.clear_frames()
    relock = gp.get_by_role("button", name="已解鎖")   # 再點一次收回鎖定 (亦 setFollow(false))
    if relock.count():
        try:
            relock.first.click(timeout=5000)
            time.sleep(0.6)
        except Exception:
            pass
    return None


def a_chart_trigger_modes(page, r, seg):
    """g-6 — 切 K 線圖工具列，依序點 停損/停利/警示 只看提示條（非交易日不點圖表
    價位，避免『尚未收到即時成交價』紅字），最後回游標。每個模式對齊旁白節奏
    （_until），讓畫面不會跑在字幕前面。"""
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.dismiss()
    r.scroll_top()
    r.mark()
    _until(r, base, tgt, 0.22)                      # 開場：工具列
    # 停損 (旁白 ~25-45%)、停利 (~45-58%)、警示 (~58-72%)
    for mode, hint, until in (("停損", "掛停損", 0.45),
                              ("停利", "掛停利", 0.60),
                              ("警示", "到價警示", 0.74)):
        btn = page.get_by_role("button", name=mode, exact=True)
        if btn.count() == 0:
            btn = page.locator("button", has_text=mode)
        if btn.count():
            try:
                r.move_to(btn.first, hold=0.3)
                btn.first.click(timeout=5000)      # 切模式安全；不點圖表價位
                time.sleep(0.6)
            except Exception:
                pass
        hb = page.get_by_text(hint, exact=False)
        bb = live_bbox(hb.first) if hb.count() else None
        if bb:
            r.gold_frame(bb, mode + "提示")
        _until(r, base, tgt, until)
        r.clear_frames()
    cur = page.get_by_role("button", name="游標", exact=True)   # 收尾回游標
    if cur.count():
        try:
            cur.first.click(timeout=4000)
        except Exception:
            pass
    _until(r, base, tgt, 0.95)
    return None


# ─────────────── 進10 選擇權策略損益圖 handlers ───────────────
# opt-payoff 面板全程 client-side 結算試算，不送任何單（安全）。模擬腿的
# 履約價/口數/權利金全部手動輸入。非交易日無串流 → 無現價虛線，屬正常。

def _payoff_panel(page):
    return page.locator("[class*='panel']").filter(has_text="結算損益試算").last


def _payoff_add_leg(page, r, side, right, strike, prem):
    """在 sim row 加一隻模擬腿。right: 'C'|'P'|'F'（F 時無履約價、權利金欄=成交價）。"""
    po = _payoff_panel(page)
    try:
        sbtn = po.get_by_role("button", name=("買" if side == "Buy" else "賣")).last
        r.move_to(sbtn, hold=0.3)
        sbtn.click(timeout=4000)
        time.sleep(0.3)
    except Exception:
        pass
    try:
        po.locator("select").last.select_option(value=right)   # sim row 的下拉
        time.sleep(0.3)
    except Exception:
        pass
    try:
        if right != "F":
            si = po.get_by_placeholder("履約價").last
            r.move_to(si, hold=0.2)
            si.fill("")
            si.type(str(strike), delay=55)
        pi = po.get_by_placeholder("成交價" if right == "F" else "權利金").last
        r.move_to(pi, hold=0.2)
        pi.fill("")
        pi.type(str(prem), delay=55)
        time.sleep(0.4)
        addb = po.get_by_role("button", name="＋模擬").last
        r.move_to(addb, hold=0.35)
        addb.click(timeout=5000)
        time.sleep(1.2)
    except Exception:
        pass


def _payoff_frame_canvas(page, r, label, region="tl"):
    """金框標註 payoff canvas 的一個區域：tl=左上(max/min)、left=左半(地板)、
    right=右半(封頂)。"""
    po = _payoff_panel(page)
    box = live_bbox(po.locator("canvas").first)
    if not box:
        return None
    if region == "tl":
        b = {"x": box["x"] + 8, "y": box["y"] + 8,
             "width": box["width"] * 0.30, "height": box["height"] * 0.24}
    elif region == "left":
        b = {"x": box["x"] + 8, "y": box["y"] + box["height"] * 0.45,
             "width": box["width"] * 0.42, "height": box["height"] * 0.45}
    else:
        b = {"x": box["x"] + box["width"] * 0.55, "y": box["y"] + box["height"] * 0.10,
             "width": box["width"] * 0.42, "height": box["height"] * 0.45}
    r.gold_frame(b, label)
    r.move_xy(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, hold=0.8)
    return b


def a_open_payoff(page, r, seg):
    """p10-1 — 開選擇權損益圖面板，金框頂部「結算損益試算」警語。"""
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.dismiss()
    r.add_panel("選擇權損益圖")
    po = _payoff_panel(page)
    r.center(po)
    r.mark()
    _until(r, base, tgt, 0.55)
    warn = po.get_by_text("結算損益試算", exact=False).first
    wb = live_bbox(warn) if warn.count() else None
    if wb:
        r.gold_frame(wb, "")   # 空標籤：面板標題就在框上方，文字標籤會疊字（QC 抓過）
        r.move_xy(wb["x"] + wb["width"] / 2, wb["y"] + wb["height"] / 2, hold=1.0)
    _until(r, base, tgt, 0.95)
    r.clear_frames()
    return None


def a_sim_long_call(page, r, seg):
    """p10-2 — 買一口 Call 42600 @200，看 hockey-stick 曲線與 max/min。"""
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.mark()
    _until(r, base, tgt, 0.12)
    _payoff_add_leg(page, r, "Buy", "C", 42600, 200)
    _until(r, base, tgt, 0.68)
    _payoff_frame_canvas(page, r, "max / min", "tl")
    _until(r, base, tgt, 0.95)
    r.clear_frames()
    return None


def a_sim_bull_spread(page, r, seg):
    """p10-3 — 加賣 Call 42800 @120 → 多頭價差（兩端封平）。"""
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.mark()
    _until(r, base, tgt, 0.12)
    _payoff_add_leg(page, r, "Sell", "C", 42800, 120)
    _until(r, base, tgt, 0.55)
    _payoff_frame_canvas(page, r, "上檔封頂", "right")
    _until(r, base, tgt, 0.95)
    r.clear_frames()
    return None


def a_sim_protective_put(page, r, seg):
    """p10-5 — 清空舊腿 → 買期貨 42600 ＋ 買 Put 42400 @150 → 左側地板。"""
    tgt = est_dur(seg["narration"])
    base = r.t()
    po = _payoff_panel(page)
    r.mark()
    _until(r, base, tgt, 0.18)
    for _ in range(6):                              # 移除全部舊模擬腿
        xs = po.locator("[class*='legRemove']")
        if xs.count() == 0:
            break
        try:
            r.move_to(xs.first, hold=0.25)
            xs.first.click(timeout=4000)
            time.sleep(0.6)
        except Exception:
            break
    _payoff_add_leg(page, r, "Buy", "F", None, 42600)
    _until(r, base, tgt, 0.55)
    _payoff_add_leg(page, r, "Buy", "P", 42400, 150)
    _until(r, base, tgt, 0.78)
    _payoff_frame_canvas(page, r, "下檔地板", "left")
    _until(r, base, tgt, 0.95)
    r.clear_frames()
    return None


def a_sim_covered_call(page, r, seg):
    """p10-7 — 移除 Put（保留期貨）→ 賣 Call 43000 @130 → 右側封頂收租。"""
    tgt = est_dur(seg["narration"])
    base = r.t()
    po = _payoff_panel(page)
    r.mark()
    _until(r, base, tgt, 0.15)
    xs = po.locator("[class*='legRemove']")        # Put 是最後加入的一列
    if xs.count():
        try:
            r.move_to(xs.last, hold=0.25)
            xs.last.click(timeout=4000)
            time.sleep(0.6)
        except Exception:
            pass
    _payoff_add_leg(page, r, "Sell", "C", 43000, 130)
    _until(r, base, tgt, 0.62)
    _payoff_frame_canvas(page, r, "封頂換權利金", "right")
    _until(r, base, tgt, 0.95)
    r.clear_frames()
    return None


# ─────────────── 進12 基本面與融資維持率（誠實版）handlers ───────────────
# 只做 client-side 檢視：排行榜模式/複選、籌碼卡、自選清單增刪、帳務風險指標。
# 全程不送單。非交易日排行可能為空/上一交易日快照 → 旁白已用條件句。

def a_scanner_modes(page, r, seg):
    """p12-1 — 依序點 漲幅/跌幅/量/額 四種排行模式。
    QC FIX: 之前 scoped 到 filter(has_text=排行榜).last 抓到只含標題的內層容器
    → 按鈕 count()=0 → 靜默跳過（畫面全程沒點）。改用 page 全域 exact 按鈕名
    （a_pick_stock 已驗證可行），每點一顆等資料重載、列表真的重排。"""
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.dismiss()
    r.mark()
    _until(r, base, tgt, 0.38)
    for mode, until in (("漲幅", 0.52), ("跌幅", 0.66), ("量", 0.78), ("額", 0.90)):
        btn = page.get_by_role("button", name=mode, exact=True).first
        if btn.count():
            try:
                r.move_to(btn, hold=0.35)
                btn.click(timeout=4000)
                time.sleep(1.2)                    # 讓排行資料重載、列表重排
            except Exception:
                pass
        _until(r, base, tgt, until)
    return None


def a_scanner_multi(page, r, seg):
    """p12-2 — 複選：做多/放空切換＋三個門檻輸入。QC FIX：全域 exact 按鈕名＋
    [class*='scanner'] input（進8 w-1 已驗證），確保複選介面真的展開。"""
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.mark()
    multi = page.get_by_role("button", name="複選", exact=True).first
    if multi.count():
        try:
            r.move_to(multi, hold=0.4)
            multi.click(timeout=4000)
            time.sleep(1.0)
        except Exception:
            pass
    _until(r, base, tgt, 0.30)
    for name in ("放空", "做多"):                    # 示範切換、停在做多
        b = page.get_by_role("button", name=name, exact=True).first
        if b.count():
            try:
                r.move_to(b, hold=0.35)
                b.click(timeout=4000)
                time.sleep(0.7)
            except Exception:
                pass
    _until(r, base, tgt, 0.52)
    inputs = page.locator("[class*='scanner'] input")
    for i, v in zip(range(min(inputs.count(), 3)), ["2", "5", "1"]):
        try:
            el = inputs.nth(i)
            r.move_to(el, hold=0.2)
            el.fill("")
            el.type(v, delay=70)
            time.sleep(0.3)
        except Exception:
            pass
    _until(r, base, tgt, 0.95)
    return None


def a_chips_open(page, r, seg):
    """p12-4 — 開籌碼資訊面板，金框掃過 融資成數/融券成數/融資餘額/融券餘額。
    QC FIX：移除「可借券源」（非交易時段該卡不渲染，之前金框標到面板下方
    空白處）；加面板邊界防呆——bbox 超出面板範圍就不畫框。"""
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.dismiss()
    r.add_panel("籌碼資訊")
    cp = page.locator("[class*='panel']").filter(has_text="融資成數").last
    r.center(cp)
    r.mark()
    pb = live_bbox(cp)
    _until(r, base, tgt, 0.30)
    for lab, until in (("融資成數", 0.50), ("融券成數", 0.63),
                       ("融資餘額", 0.76), ("融券餘額", 0.88)):
        card = cp.locator("[class*='statCard']").filter(has_text=lab).first
        b = live_bbox(card) if card.count() else None
        # 邊界防呆：卡片必須真的落在面板可視範圍內且有高度
        ok = (b and b["height"] > 8 and pb
              and pb["y"] - 4 <= b["y"] <= pb["y"] + pb["height"])
        if ok:
            r.gold_frame(b, lab)
            r.move_xy(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, hold=0.6)
        _until(r, base, tgt, until)
        r.clear_frames()
    _until(r, base, tgt, 0.95)
    return None


def _wl_row(page, code):
    """自選清單裡 code 那一列（draggable row 祖先）。找不到回 None。"""
    cell = page.get_by_text(code, exact=True).first
    if cell.count() == 0:
        return None
    row = cell.locator("xpath=ancestor::*[@draggable='true'][1]")
    return row if row.count() else None


def _wl_remove(page, r, code, show=False):
    """hover 該列 → 點『從清單移除』（列內 scope，不會誤刪別列）。"""
    row = _wl_row(page, code)
    if row is None:
        return False
    try:
        row.scroll_into_view_if_needed(timeout=3000)
        time.sleep(0.4)
        row.hover(timeout=3000)                    # X 鈕 hover 才浮現
        time.sleep(0.6)
        rm = row.locator("button[title='從清單移除']").first
        if rm.count():
            if show:
                r.move_to(rm, hold=0.4)
            rm.click(timeout=4000)
            time.sleep(1.0)
            return True
    except Exception:
        pass
    return False


def a_watchlist_build(page, r, seg):
    """p12-6 — 自選清單：搜代碼加入(1301) → 顯示該列 → 點叉移除（狀態還原）。
    QC FIX：(1) 上一輪殘留的 1301 先靜默清掉；(2) 加入後把該列捲到可視並金框，
    觀眾看得到「真的加進來了」；(3) 移除鈕改列內 scope（之前點到第一列的鈕
    且未 hover → 靜默失敗、清單多了一檔）；(4) 移除小線圖橋段（非交易時段
    不一定渲染，說了畫面沒有就是錯配）。"""
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.dismiss()
    r.scroll_top()
    _wl_remove(page, r, "1301")                    # 前置清理（不入鏡重點）
    time.sleep(0.5)
    r.mark()
    _until(r, base, tgt, 0.12)
    inp = page.get_by_placeholder("股票、期貨或指數", exact=False).first
    if inp.count():
        try:
            r.move_to(inp, hold=0.3)
            inp.click(timeout=4000)
            inp.type("1301", delay=90)
            time.sleep(1.0)
            sug = page.locator("[class*='suggestRow']").first
            if sug.count():
                r.move_to(sug, hold=0.3)
                sug.click(timeout=4000)
            else:
                page.keyboard.press("Enter")
            time.sleep(1.2)
        except Exception:
            pass
    _until(r, base, tgt, 0.40)
    row = _wl_row(page, "1301")                    # 讓觀眾看到新列
    if row is not None:
        try:
            row.scroll_into_view_if_needed(timeout=3000)
            time.sleep(0.5)
            b = live_bbox(row)
            if b:
                r.gold_frame(b, "加進來了")
                r.move_xy(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2,
                          hold=1.0)
        except Exception:
            pass
    _until(r, base, tgt, 0.62)
    r.clear_frames()
    _wl_remove(page, r, "1301", show=True)         # 入鏡示範移除（清單回 15）
    _until(r, base, tgt, 0.95)
    return None


def a_account_risk(page, r, seg):
    """p12-7 — 帳務分頁，金框「風險指標」卡（期貨保證金健康度，當維持率比喻）。"""
    tgt = est_dur(seg["narration"])
    base = r.t()
    r.dismiss()
    _account_tab(page, r)
    r.mark()
    _until(r, base, tgt, 0.35)
    card = _stat_card(page, "風險指標")
    b = live_bbox(card) if card.count() else None
    if b:
        r.gold_frame(b, "風險指標（比喻維持率）")
        r.move_xy(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, hold=1.2)
    _until(r, base, tgt, 0.92)
    r.clear_frames()
    return bbox_dict(b) if b else None


ACTIONS = {
    "hold": a_hold,
    "sinopac_shots": a_sinopac_shots,
    "type_api_key": a_type_api_key,
    "eye_toggle": a_eye_toggle,
    "type_secret_key": a_type_secret_key,
    "env_hold_sim": a_env_hold_sim,
    "env_click_prod_and_back": a_env_click_prod_and_back,
    "hover_launch": a_hover_launch,
    "goto_terminal": a_goto_terminal,
    # T2
    "tour_header": a_tour_header,
    "open_add_menu": a_open_add_menu,
    "add_chart_panel": a_add_chart_panel,
    "drag_panel": a_drag_panel,
    "pin_unpin": a_pin_unpin,
    "apply_preset": a_apply_preset,
    "layout_save_menu": a_layout_save_menu,
    # T3
    "watchlist_add": a_watchlist_add,
    "watchlist_click_other": a_watchlist_click_other,
    "chart_timeframes": a_chart_timeframes,
    "chart_drag_history": a_chart_drag_history,
    "depth_on_txf": a_depth_on_txf,
    "add_volprofile": a_add_volprofile,
    "scanner_multi": a_scanner_multi,
    "heatmap_drill": a_heatmap_drill,
    "chips_card": a_chips_card,
    # T4
    "ticket_tour": a_ticket_tour,
    "ticket_two_step": a_ticket_two_step,
    "orders_tab": a_orders_tab,
    "chart_trade_modes": a_chart_trade_modes,
    "trigger_hold": a_trigger_hold,
    "flash_demo_txf": a_flash_demo_txf,
    "risk_menu": a_risk_menu,
    "esc_esc_with_orders": a_esc_esc_with_orders,   # legacy (t4-8 pre-rewrite)
    "esc_esc_prompt": a_esc_esc_prompt,
    # T5
    "open_indicator_dialog": a_open_indicator_dialog,
    "add_indicator": a_add_indicator,
    "legend_controls": a_legend_controls,
    "custom_indicator_editor": a_custom_indicator_editor,
    "backtest_gate": a_backtest_gate,
    # AI Agent
    "agent_gate": a_agent_gate,
    # T6
    "add_replay": a_add_replay,
    "replay_play": a_replay_play,
    "replay_speed": a_replay_speed,
    "replay_hold": a_replay_hold,
    # T7
    "add_optchain": a_add_optchain,
    "optchain_months": a_optchain_months,
    "optchain_click": a_optchain_click,
    "combo_linked_arm_only": a_combo_linked_arm_only,
    "payoff_with_sim_legs": a_payoff_with_sim_legs,
    # A5 · 效率與介面工具
    "cmdk_search": a_cmdk_search,
    "hotkeys_bs_esc": a_hotkeys_bs_esc,
    "warrants_panel": a_warrants_panel,
    "stockfutures_panel": a_stockfutures_panel,
    "notices_panel": a_notices_panel,
    "debug_panel": a_debug_panel,
    "theme_menu": a_theme_menu,
    "privacy_sound": a_privacy_sound,
    # 進6 訂單與委託
    "ticket_overview": a_ticket_overview,
    "ticket_price_type": a_ticket_price_type,
    "ticket_validity": a_ticket_validity,
    "ticket_unit_daytrade": a_ticket_unit_daytrade,
    # 進7 帳務與交割安全
    "account_overview": a_account_overview,
    "account_balance": a_account_balance,
    "account_margin_risk": a_account_margin_risk,
    # 進8 一鏡到底
    "pick_stock": a_pick_stock,
    "size_calc": a_size_calc,
    "place_order": a_place_order,
    "orders_view": a_orders_view,
    "stop_mode_demo": a_stop_mode_demo,
    # 進9 分批鋪單與到價觸發
    "grid_open": a_grid_open,
    "grid_buy_setup": a_grid_buy_setup,
    "grid_arm_follow": a_grid_arm_follow,
    "chart_trigger_modes": a_chart_trigger_modes,
    # 進10 選擇權策略損益圖
    "open_payoff": a_open_payoff,
    "sim_long_call": a_sim_long_call,
    "sim_bull_spread": a_sim_bull_spread,
    "sim_protective_put": a_sim_protective_put,
    "sim_covered_call": a_sim_covered_call,
    # 進12 基本面與融資維持率（誠實版）
    "scanner_modes": a_scanner_modes,
    "scanner_multi": a_scanner_multi,
    "chips_open": a_chips_open,
    "watchlist_build": a_watchlist_build,
    "account_risk": a_account_risk,
}


def record_topic(topic):
    subdir = topic["id"]
    out = ROOT / "recordings" / subdir
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.webm"):
        old.unlink()

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": W, "height": H},
            record_video_dir=str(out),
            record_video_size={"width": W, "height": H},
            color_scheme="dark", locale="zh-TW", timezone_id="Asia/Taipei",
        )
        ctx.add_init_script("localStorage.setItem('sj-pro-privacy-mode','1')")
        # change A: enlarge the whole UI (user asked to "see it more clearly").
        # fontScale 1.3 → root font-size 20.8px; every rem-based style scales.
        ctx.add_init_script(
            "localStorage.setItem('sj-pro-theme',"
            "'{\"mode\":\"dark\",\"convention\":\"tw\",\"fontScale\":1.3}')")
        ctx.add_init_script(CURSOR_JS)
        page = ctx.new_page()
        anchor = time.time()          # video-time t=0 ≈ here (page created)
        r = R(page, anchor)

        if topic["mode"] == "onboarding":
            page.goto(f"{BASE}/?onboarding=1")
            page.get_by_placeholder("SJ_API_KEY").wait_for(state="visible",
                                                           timeout=25000)
            time.sleep(2.5)           # let first paint settle before seg 1
        else:
            page.goto(BASE)
            page.get_by_text("模擬環境", exact=True).first.wait_for(
                state="visible", timeout=25000)
            # The 模擬環境 badge appears EARLY, but the workspace ('載入交易終端…')
            # can take 20-60s to mount under load. A fixed sleep recorded the
            # loading placeholder as segment 1 (verified failure). Poll for the
            # real workspace (＋ 新增面板 present, loading gone) before interacting.
            mounted = False
            for _ in range(90):
                try:
                    has_add = page.get_by_role(
                        "button", name="＋ 新增面板").count() > 0
                    loading = page.get_by_text(
                        "載入交易終端", exact=False).count() > 0
                    if has_add and not loading:
                        mounted = True
                        break
                except Exception:
                    pass
                time.sleep(1.0)
            r.log(f"workspace mounted={mounted} at {r.t():.1f}s")
            time.sleep(4)             # settle contracts/quotes before jump
            # change C: every episode opens by ⌘K-jumping to a tradable product
            # so segment 1 isn't polluted by IX0001 (五檔/下單/明細 → 不支援).
            sym = MODE_SYMBOL.get(topic["mode"])
            if sym:
                r.log(f"opening jump → {sym}")
                try:
                    r.jump(sym)
                except Exception as e:
                    r.log(f"  opening jump failed: {e}")
                time.sleep(2.0)

        scenes = []
        for seg in topic["segments"]:
            # segments assembled from terminal cards / still cards (e.g. the AI
            # Agent episode's ai-3/4/5/6) are not recorded in-app.
            if seg.get("skip_record"):
                r.log(f"⤼ skip {seg['id']} (assembled from terminal/still card)")
                continue
            time.sleep(0.5)           # static buffer BEFORE the cut window
            loop_start = r.t()
            r.mark_time = None
            r.cut_end_time = None
            r.log(f"▶ {seg['id']} [{seg['action']}]")
            fn = ACTIONS.get(seg["action"])
            zb = None
            if fn is None:
                r.log(f"  · no handler for {seg['action']} — idle")
                time.sleep(2.0)
            else:
                try:
                    zb = fn(page, r, seg)   # handlers paint/clear their own frame
                except Exception as e:
                    r.log(f"  · action error: {e}")
            spec_zoom = seg.get("zoom")
            # pad to estimated narration length so k stays sane
            target = est_dur(seg["narration"])
            elapsed = r.t() - loop_start
            if elapsed < target and r.cut_end_time is None:
                time.sleep(min(target - elapsed, 12.0))
            # a handler may mark where usable footage ENDS (e.g. flash popout
            # before navigating back + re-mounting the workspace) so the cut
            # excludes the trailing loading screen.
            end = r.cut_end_time if r.cut_end_time is not None else r.t()
            r.clear_frames()
            # a handler may mark the point where usable footage really begins
            # (e.g. t1-9 after the terminal finished loading)
            start = r.mark_time if r.mark_time is not None else loop_start
            scenes.append({
                "segment_id": seg["id"],
                "action": seg["action"],
                "start": round(start, 3),
                "end": round(end, 3),
                "zoom_bbox": zb,
                "pad": (spec_zoom or {}).get("pad"),
                "notes": f"est {target:.1f}s / rec {end-loop_start:.1f}s",
            })
            r.log(f"  · {seg['id']} rec {end-loop_start:.1f}s (est {target:.1f}s)"
                  + (f" zoom={zb}" if zb else ""))

        time.sleep(1.0)
        total = r.t()
        page.close()
        ctx.close()
        browser.close()

    vids = sorted(out.glob("*.webm"), key=lambda v: v.stat().st_size, reverse=True)
    src_webm = vids[0]
    meta = {
        "topic_id": topic["id"], "ep": topic["ep"], "title": topic["title"],
        "mode": topic["mode"], "wall_total": round(total, 3),
        "video_webm": src_webm.name, "scenes": scenes,
    }
    (out / "scenes.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✓ recorded {src_webm.name} ({src_webm.stat().st_size//1024} KB), "
          f"wall {total:.1f}s, {len(scenes)} segments", flush=True)
    print(f"✓ scenes.json -> {out/'scenes.json'}", flush=True)


def main():
    tid = sys.argv[1] if len(sys.argv) > 1 else "t1-login"
    topic = next((t for t in topics_spec.TOPICS if t["id"] == tid), None)
    if not topic:
        raise SystemExit(f"topic {tid} not found")
    print(f"===== recording {topic['ep']} · {topic['title']} =====", flush=True)
    record_topic(topic)


if __name__ == "__main__":
    main()
