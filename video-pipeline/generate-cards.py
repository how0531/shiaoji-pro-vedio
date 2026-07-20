# generate-cards.py — render all title/chapter/CTA/step cards as 2560×1440
# PNGs via HTML + Playwright. Fonts: YaHei Bold (大標), JhengHei (副標/內文),
# Barlow (numbers). Palette: SinoPac (#C0392B red / #D9A45B gold / #0F1A2B navy).
#
# 2K upgrade: the CSS is authored in 1920×1080 design units and rendered with
# device_scale_factor 4/3, so every screenshot lands at exactly 2560×1440 with
# all type/elements scaled up ×1.333 (crisper, no per-value edits). Palette and
# fonts unchanged.
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "cards"
OUT.mkdir(parents=True, exist_ok=True)
FONTS = (ROOT / "assets" / "fonts").as_posix()

CSS = f"""
@font-face {{ font-family:'BarlowX'; src:url('file:///{FONTS}/Barlow-SemiBold.ttf'); }}
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ width:1920px; height:1080px; overflow:hidden; position:relative;
  background:radial-gradient(1200px 700px at 50% 40%, #17293f 0%, #0F1A2B 55%, #080f1a 100%);
  font-family:'Microsoft JhengHei',sans-serif; color:#fff;
  display:flex; align-items:center; justify-content:center;
  /* reserve the bottom band for burned-in subtitles (content never collides) */
  padding-bottom:150px; }}
/* premium depth: soft edge vignette + a thin gold inset frame */
body::before {{ content:''; position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(130% 125% at 50% 44%, transparent 52%, rgba(0,0,0,.5) 100%); }}
body::after {{ content:''; position:absolute; inset:44px; pointer-events:none;
  border:1.5px solid rgba(217,164,91,.20); border-radius:12px;
  box-shadow:inset 0 0 90px rgba(10,18,32,.55); }}
.card {{ text-align:center; max-width:1500px; position:relative; z-index:1; }}
.epnum {{ font-family:'BarlowX','Barlow',sans-serif; font-size:44px; letter-spacing:14px;
  color:#D9A45B; margin-bottom:28px; }}
.epnum .n {{ color:#C0392B; font-size:52px; }}
h1 {{ font-family:'Microsoft YaHei','Microsoft JhengHei',sans-serif; font-weight:900;
  font-size:96px; letter-spacing:6px; line-height:1.25; }}
h2 {{ font-family:'Microsoft JhengHei',sans-serif; font-weight:400; font-size:40px;
  color:#cfd8e8; margin-top:30px; letter-spacing:3px; }}
.rule {{ width:180px; height:4px; background:#C0392B; margin:38px auto 0;
  box-shadow:0 0 24px rgba(192,57,43,.55); }}
.rule.gold {{ background:#D9A45B; box-shadow:0 0 24px rgba(217,164,91,.5); }}
.agtitle {{ font-size:78px; margin-top:6px; }}
.steps {{ text-align:left; display:inline-block; margin-top:44px; }}
.step {{ display:flex; align-items:center; gap:26px; margin:26px 0; font-size:44px; }}
.step .no {{ font-family:'BarlowX',sans-serif; font-size:40px; color:#fff; background:#C0392B;
  width:72px; height:72px; border-radius:50%; display:flex; align-items:center;
  justify-content:center; flex:0 0 72px; }}
.step .txt b {{ color:#D9A45B; font-weight:700; }}
.warn {{ border:3px solid #C0392B; border-radius:18px; padding:56px 84px;
  background:rgba(192,57,43,.08); }}
.warn h1 {{ font-size:78px; color:#ff6b5e; }}
.warn h2 {{ font-size:42px; line-height:1.8; margin-top:36px; }}
.cta .url {{ font-family:'BarlowX',sans-serif; font-size:48px; color:#D9A45B;
  margin-top:44px; letter-spacing:1px; }}
.small {{ font-size:30px; color:#8593b3; margin-top:52px; }}
.steps.tight {{ margin-top:34px; }}
.steps.tight .step {{ font-size:34px; margin:14px 0; gap:22px; }}
.steps.tight .step .no {{ width:54px; height:54px; flex:0 0 54px; font-size:31px; }}
.rlead {{ font-size:34px; color:#D9A45B; margin-top:44px; letter-spacing:2px; }}
"""

def card_html(body):
    return f"<style>{CSS}</style><body>{body}</body>"

EPS = [
    ("T1", "登入設定", "申請金鑰到進入終端"),
    ("T2", "版面介紹", "把畫面排成你要的樣子"),
    ("T3", "看盤與選股", "找標的、看行情"),
    ("T4", "交易功能", "下單、停損、風控"),
    ("T5", "指標與回測", "內建、自訂、桌面版回測"),
    ("T6", "回放功能", "收盤後練盤感"),
    ("T7", "期權功能", "T 字報價與損益圖"),
]

CARDS = {}
CARDS["series-intro"] = card_html("""
<div class="card">
  <div class="epnum">SHIOAJI&nbsp;PRO <span class="n">教學系列</span></div>
  <h1>Shioaji Pro<br>完整功能教學</h1>
  <h2>台股・期貨・選擇權　專業交易終端</h2>
  <div class="rule"></div>
  <div class="small">全程模擬環境示範・介面開源</div>
</div>""")

for ep, title, sub in EPS:
    CARDS[f"chapter-{ep.lower()}"] = card_html(f"""
<div class="card">
  <div class="epnum">第&nbsp;<span class="n">{ep[1:]}</span>&nbsp;集　·　共 7 集</div>
  <h1>{title}</h1>
  <h2>{sub}</h2>
  <div class="rule gold"></div>
</div>""")

# Advanced series ep 5 — its own chapter card. Eyebrow reads 「進階 · 第 5 集」so
# it never reads as "5 of 7" against the 入門 (T-series, 共 7 集) chapter cards.
CARDS["chapter-a5"] = card_html("""
<div class="card">
  <div class="epnum">進階　·　第&nbsp;<span class="n">5</span>&nbsp;集</div>
  <h1>效率與介面工具</h1>
  <h2>快捷鍵・工具面板・外觀設定</h2>
  <div class="rule gold"></div>
</div>""")

# Advanced series — AI Agent 這一集自己的章節卡。眉標「進階 · AI Agent」，
# 不套「第 N 集 / 共 7 集」，與入門系列的章節卡區隔。
CARDS["chapter-ai"] = card_html("""
<div class="card">
  <div class="epnum">進階　·　<span class="n">AI&nbsp;Agent</span></div>
  <h1>AI Agent 人工智慧交易代理</h1>
  <h2>對話驅動・技能・排程</h2>
  <div class="rule gold"></div>
</div>""")

# Agenda cards (本集你會學到 + 3 bullets). Reconstructed to match the existing
# series design; a5 added. ep code (T1/…/A5) is the red .n, gold '本集你會學到'.
AGENDA_DATA = {
    "t1": ("登入設定", ["到永豐官網申請 API 金鑰", "填進設定精靈、選模擬環境",
                        "啟動並進入交易終端"]),
    "t2": ("版面介紹", ["新增面板、拖曳搬移", "連動與鎖定的差別", "一鍵套用現成版型"]),
    "t3": ("看盤與選股", ["自選清單與連動", "K 線、五檔、分價量表", "排行榜、熱力圖、籌碼卡"]),
    "t4": ("交易功能", ["兩段式下單與委託管理", "圖上停損停利（本機監控）", "閃電下單與風控鎖"]),
    "t5": ("指標與回測", ["加指標、調設定", "圖例隱藏與移除", "自訂指標與桌面版回測"]),
    "t6": ("回放功能", ["載入最近交易日行情", "變速重播、拖進度條", "收盤後檢討方法"]),
    "t7": ("期權功能", ["T 字報價看買賣權", "連動組合單湊兩腳", "到期損益圖試算"]),
    "a5": ("效率與介面工具", ["快捷鍵：⌘K搜尋、B/S、Esc×2",
                            "工具面板：權證/個股期、通知、診斷",
                            "外觀：主題配色、字級、隱私、音效"]),
    "ai": ("人工智慧交易代理", ["AI Agent 是什麼、在哪用",
                             "三個真實實作",
                             "盤前掃描・自動風控・持倉監控"]),
    "p6": ("訂單與委託", ["價別、效期、單位怎麼選",
                        "委託分頁看四種狀態",
                        "廢單原因與決策一句話"]),
    "p7": ("帳務與交割安全", ["帳務分頁：交割帳戶餘額",
                          "T+2 交割與違約後果",
                          "權益數、保證金、風險指標"]),
    "p8": ("一筆完整交易", ["選股、算量、下單",
                        "看委託狀態、設停損",
                        "平倉看含費淨損益"]),
    "p9": ("分批鋪單與到價觸發", ["鋪單：階梯式限價，分批進出場",
                              "到價：K 線設停損/停利/警示",
                              "誠實面：觸價本機端，關分頁失效"]),
    "p11": ("分眾觀看路線圖", ["依你的交易風格挑一條路走",
                          "三條路：新手🟢、當沖🔴、波段存股🔵",
                          "每條路的順序、重點集、可略過"]),
    "p10": ("選擇權策略損益圖", ["價差單的最大獲利與最大虧損",
                            "保護性賣權、掩護性買權的圖形",
                            "圖是結算損益，不含時間價值"]),
    "p12": ("基本面與融資維持率", ["web 版能做的三件事，實測",
                              "沒有的功能，老實告訴你去哪做",
                              "用風險指標比喻追繳與斷頭"]),
}
for key, (title, bullets) in AGENDA_DATA.items():
    steps = "".join(
        f'<div class="step"><div class="no">{i}</div>'
        f'<div class="txt">{b}</div></div>'
        for i, b in enumerate(bullets, 1))
    CARDS[f"agenda-{key}"] = card_html(f"""
<div class="card">
  <div class="epnum"><span class="n">{key.upper()}</span>&nbsp;&nbsp;本集你會學到</div>
  <h1 class="agtitle">{title}</h1>
  <div class="steps">{steps}</div>
</div>""")

CARDS["sinopac-steps"] = card_html("""
<div class="card">
  <h1 style="font-size:72px">申請 API 金鑰</h1>
  <div class="steps">
    <div class="step"><div class="no">1</div><div class="txt">登入 <b>永豐金新理財網</b></div></div>
    <div class="step"><div class="no">2</div><div class="txt">點右上角姓名 → <b>個人服務</b></div></div>
    <div class="step"><div class="no">3</div><div class="txt">進入 <b>API 管理</b></div></div>
    <div class="step"><div class="no">4</div><div class="txt">點 <b>新增 API Key</b>，複製並妥善保存</div></div>
  </div>
</div>""")

CARDS["warn-client-trigger"] = card_html("""
<div class="card warn">
  <h1>⚠ 停損停利是「本機監控」</h1>
  <h2>只在 App 開著、連線正常時有效<br>關掉程式或斷線，就<b style="color:#ff6b5e">不會觸發</b><br>重要的停損，請勿完全託付</h2>
</div>""")

CARDS["outro-cta"] = card_html("""
<div class="card cta">
  <h1 style="font-size:80px">換你動手了</h1>
  <h2>打開模擬環境，把流程走熟，再談真錢</h2>
  <div class="rule"></div>
  <div class="url">github.com/Sinotrade/shioaji-pro-app</div>
  <div class="small">介面開源・預設模擬環境・金鑰只存本機</div>
</div>""")

# AI Agent 這一集的收尾卡 (ai-6)。對齊收尾旁白：三個都能直接拿去改、模擬環境、
# 桌面版對話驅動＋技能、下載桌面版切模擬動手玩。
CARDS["ai-outro"] = card_html("""
<div class="card cta">
  <h1 style="font-size:76px">三個都能直接拿去改</h1>
  <h2>都是真的能跑的程式・跑在模擬環境・不動真錢<br>桌面版可用對話驅動，還能存成技能重複用</h2>
  <div class="rule"></div>
  <div class="url">下載桌面版 → 切到模擬環境 → 動手玩玩看</div>
  <div class="small">github.com/Sinotrade/shioaji-pro-app</div>
</div>""")

# ═══════════ 進階新集 進6/進7/進8 — 章節卡（眉標「進階 · 第 N 集」，與 a5 一致）═══════════
CARDS["chapter-p6"] = card_html("""
<div class="card">
  <div class="epnum">進階　·　第&nbsp;<span class="n">6</span>&nbsp;集</div>
  <h1>訂單與委託</h1>
  <h2>該選哪種單、怎麼看委託</h2>
  <div class="rule gold"></div>
</div>""")
CARDS["chapter-p7"] = card_html("""
<div class="card">
  <div class="epnum">進階　·　第&nbsp;<span class="n">7</span>&nbsp;集</div>
  <h1>帳務與交割安全</h1>
  <h2>別讓自己違約</h2>
  <div class="rule gold"></div>
</div>""")
CARDS["chapter-p8"] = card_html("""
<div class="card">
  <div class="epnum">進階　·　第&nbsp;<span class="n">8</span>&nbsp;集</div>
  <h1>一鏡到底</h1>
  <h2>一筆完整交易</h2>
  <div class="rule gold"></div>
</div>""")

# ═══════════ 進階新集 — 靜態卡（決策卡/廢單/交割/違約/維持率/資產分布/平倉/收尾）═══════════
# 進6 o-5 決策卡
CARDS["card-p6-decide"] = card_html("""
<div class="card">
  <h1 style="font-size:64px">一句話幫你選</h1>
  <div class="steps">
    <div class="step"><div class="no">1</div><div class="txt">怕買在爛價位 → 用 <b>限價</b>；要確定成交 → 用 <b>市價</b></div></div>
    <div class="step"><div class="no">2</div><div class="txt">想長抱、分批進出 → <b>ROD</b>；要搶要快 → <b>IOC / FOK</b></div></div>
    <div class="step"><div class="no">3</div><div class="txt">資金小 → 先玩 <b>零股</b></div></div>
    <div class="step"><div class="no">4</div><div class="txt">當沖、融資（有槓桿）→ 很熟再碰</div></div>
  </div>
</div>""")
# 進6 o-7 廢單原因卡
CARDS["card-p6-reject"] = card_html("""
<div class="card">
  <h1 style="font-size:64px">為什麼會變廢單？</h1>
  <div class="steps">
    <div class="step"><div class="no">1</div><div class="txt">掛價超過當天 <b>漲跌停</b></div></div>
    <div class="step"><div class="no">2</div><div class="txt"><b>零股規則</b>沒對</div></div>
    <div class="step"><div class="no">3</div><div class="txt"><b>融資融券額度</b>不足</div></div>
    <div class="step"><div class="no">4</div><div class="txt">價格不符 <b>跳動單位</b></div></div>
  </div>
  <div class="small">看到廢單別慌 — 看原因、改對了重掛就好</div>
</div>""")
# 進7 a-3 交割款觀念卡
CARDS["card-p7-settle"] = card_html("""
<div class="card">
  <div class="epnum"><span class="n">T + 2</span>&nbsp;交割</div>
  <h1 style="font-size:60px">今天買，錢後天早上才扣</h1>
  <div class="steps">
    <div class="step"><div class="no">1</div><div class="txt">買進當下 → 帳戶可以 <b>沒有錢</b></div></div>
    <div class="step"><div class="no">2</div><div class="txt">後天早上 → 交割帳戶 <b>一定要有錢</b></div></div>
  </div>
  <div class="small">後天早上帳戶不夠 = 違約交割</div>
</div>""")
# 進7 a-4 違約後果卡
CARDS["card-p7-default"] = card_html("""
<div class="card warn">
  <h1>⚠ 違約交割的後果</h1>
  <h2>券商追繳　·　通報聯徵　·　影響信用<br>嚴重還有 <b style="color:#ff6b5e">法律責任</b></h2>
  <div class="small">鐵律：只買「後天付得出來」的金額</div>
</div>""")
# 進7 a-6 融資維持率觀念卡
CARDS["card-p7-maint"] = card_html("""
<div class="card">
  <h1 style="font-size:58px">融資，要盯「維持率」</h1>
  <h2>維持率 ＝ 擔保品價值 ÷ 借款</h2>
  <div class="steps">
    <div class="step"><div class="no">1</div><div class="txt">跌太多 → 收到 <b>追繳</b></div></div>
    <div class="step"><div class="no">2</div><div class="txt">再不補 → 被 <b>斷頭</b>賣掉</div></div>
  </div>
  <div class="small">用槓桿前，先想清楚跌到哪會被追繳、你補不補得起</div>
</div>""")
# 進7 a-7 資產分布收尾卡
CARDS["card-p7-dist"] = card_html("""
<div class="card">
  <div class="epnum">帳務分頁　·　<span class="n">資產分布</span></div>
  <h1 style="font-size:58px">你的錢，集中在哪？</h1>
  <h2>資產分布圓餅 ＋ 前五大持股，一眼看出集中度</h2>
  <div class="steps">
    <div class="step"><div class="no">1</div><div class="txt">太集中 <b>單一股票 / 單一類股</b> → 風險高</div></div>
    <div class="step"><div class="no">2</div><div class="txt">該 <b>分散</b></div></div>
  </div>
</div>""")
# 進8 w-6 平倉觀念＋帳務含費卡（R1-A1：補真實算式＋損益兩平＋持有級成本）
CARDS["card-p8-close"] = card_html("""
<div class="card">
  <h1 style="font-size:52px">平倉看「淨」損益：要漲多少才回本？</h1>
  <div class="steps tight">
    <div class="step"><div class="no">例</div><div class="txt">買 <b>1,000 股 @ 100 元</b> ＝ 成本 100,000</div></div>
    <div class="step"><div class="no">＋</div><div class="txt">手續費 0.1425%（買＋賣，最低 20 元）＋ 賣出證交稅 0.3%</div></div>
    <div class="step"><div class="no">＝</div><div class="txt">來回成本 ≈ <b>585 元</b> → 要漲約 <b>0.59% 才損益兩平</b></div></div>
    <div class="step"><div class="no">持</div><div class="txt">存股另計：<b>股利所得稅</b>、單筆股利≥2萬扣 <b>二代健保 2.11%</b></div></div>
  </div>
  <div class="small">券商多有手續費折讓；本金小，成本更容易吃掉小賺 — 一筆要賺得夠多才划算</div>
</div>""")
# R1-A2 跳動單位（台股 tick）
CARDS["card-p6-tick"] = card_html("""
<div class="card">
  <h1 style="font-size:54px">跳動單位：掛錯價會變廢單</h1>
  <h2>不同價位，最小跳動不一樣（上市櫃普通股）</h2>
  <div class="steps tight">
    <div class="step"><div class="no">1</div><div class="txt">未滿 10 元 → <b>0.01</b>　·　10–50 元 → <b>0.05</b></div></div>
    <div class="step"><div class="no">2</div><div class="txt">50–100 → <b>0.1</b>　·　100–500 → <b>0.5</b></div></div>
    <div class="step"><div class="no">3</div><div class="txt">500–1000 → <b>1</b>　·　1000 以上 → <b>5</b></div></div>
  </div>
  <div class="small">例：51 元的股票不能掛 51.53（要 51.5 或 51.6），掛錯就被退成廢單</div>
</div>""")
# R1-A3 零股規則
CARDS["card-p6-odd"] = card_html("""
<div class="card">
  <h1 style="font-size:56px">零股怎麼掛才不會被退</h1>
  <div class="steps tight">
    <div class="step"><div class="no">1</div><div class="txt"><b>盤中零股</b> 9:00–13:30：每 3 分鐘集合競價，最少 1 股</div></div>
    <div class="step"><div class="no">2</div><div class="txt"><b>盤後零股</b> 13:40–14:30：一次集合競價</div></div>
    <div class="step"><div class="no">3</div><div class="txt">零股只能 <b>限價、ROD</b>（不能市價、不能 IOC/FOK）</div></div>
    <div class="step"><div class="no">4</div><div class="txt">下單前先在「單位」切到 <b>零股</b>，別用整股規則掛</div></div>
  </div>
  <div class="small">小資最常用零股 — 記住這幾點，第一單就不會踩雷</div>
</div>""")
# R1-A4 括號單 OCO
CARDS["card-t4-bracket"] = card_html("""
<div class="card">
  <div class="epnum">下單面板　·　<span class="n">括號單</span></div>
  <h1 style="font-size:54px">停損停利保護：進場就綁好出場</h1>
  <div class="steps tight">
    <div class="step"><div class="no">1</div><div class="txt">進場單成交後，<b>自動掛一組停損＋停利</b>（OCO：一邊成交、另一邊自動撤）</div></div>
    <div class="step"><div class="no">2</div><div class="txt">紀律的一半 — 進場同時就決定好停損停利</div></div>
    <div class="step"><div class="no">⚠</div><div class="txt">和圖上觸價一樣是 <b>本機端監控</b>：關掉程式、斷線就不會觸發</div></div>
  </div>
  <div class="small">真正重要的停損，別完全交給本機端 — 長天期請用桌面版或程式單</div>
</div>""")
# R1-A5 快捷鍵速查表
CARDS["card-a5-hotkeys"] = card_html("""
<div class="card">
  <h1 style="font-size:56px">快捷鍵速查</h1>
  <div class="steps tight">
    <div class="step"><div class="no">⌘K</div><div class="txt">搜尋跳轉：輸入代碼或中文股名，整個終端連動過去</div></div>
    <div class="step"><div class="no">B/S</div><div class="txt">下單面板切 <b>買進 / 賣出</b> 方向</div></div>
    <div class="step"><div class="no">Esc</div><div class="txt">連按兩次 ＝ <b>全部撤單</b>（先跳提醒、再按一次執行）</div></div>
    <div class="step"><div class="no">閃</div><div class="txt">閃電下單：點買量=限價買、點賣量=限價賣、點自己的單=刪單</div></div>
  </div>
  <div class="small">改量/改價/一鍵平倉目前用面板按鈕操作；熱鍵以官方文件為準</div>
</div>""")
# R1-A6 殖利率/配息/填息（P12 存股再平衡）
CARDS["card-p12-yield"] = card_html("""
<div class="card">
  <h1 style="font-size:54px">存股最在意的：殖利率與填息</h1>
  <div class="steps tight">
    <div class="step"><div class="no">1</div><div class="txt"><b>現金殖利率</b> ＝ 每股現金股利 ÷ 股價（買在越低、殖利率越高）</div></div>
    <div class="step"><div class="no">2</div><div class="txt"><b>除息</b>當天股價會扣掉股利往下調，不是真的跌</div></div>
    <div class="step"><div class="no">3</div><div class="txt"><b>填息</b>：股價漲回除息前，才是真正把股利賺到手</div></div>
    <div class="step"><div class="no">→</div><div class="txt">這些數字 web 版沒有，看 <b>公開資訊觀測站</b> 或存股網站</div></div>
  </div>
  <div class="small">誠實提醒：高殖利率不等於好，要看填息能力與配息穩定度</div>
</div>""")
# R1-A7 基差/追蹤誤差（P10 避險風險）
CARDS["card-p10-basis"] = card_html("""
<div class="card">
  <h1 style="font-size:52px">用台指避個股：兩個誤差別忽略</h1>
  <div class="steps tight">
    <div class="step"><div class="no">1</div><div class="txt"><b>基差風險</b>：期貨價 ≠ 現貨指數，到期前會有價差波動</div></div>
    <div class="step"><div class="no">2</div><div class="txt"><b>追蹤誤差</b>：你的持股 ≠ 大盤，個股走勢和指數不一定同步</div></div>
    <div class="step"><div class="no">→</div><div class="txt">用大盤工具避個股，只能避「大盤系統性風險」，避不掉個股自己的事</div></div>
  </div>
  <div class="small">別過度信任避險 — 部位越偏離大盤，避險效果越打折</div>
</div>""")
# 進8 w-7 收尾卡
CARDS["card-p8-outro"] = card_html("""
<div class="card cta">
  <h1 style="font-size:60px">一筆完整交易</h1>
  <h2>選股 → 算量 → 下單 → 看回報 → 設停損 → 平倉看淨賺賠</h2>
  <div class="rule"></div>
  <div class="url">先在模擬環境走熟 → 再用真錢下場</div>
  <div class="small">github.com/Sinotrade/shioaji-pro-app　·　預設模擬環境</div>
</div>""")

# ═══════════ 進9 分批鋪單與到價觸發 — 章節卡＋靜態卡 ═══════════
CARDS["chapter-p9"] = card_html("""
<div class="card">
  <div class="epnum">進階　·　第&nbsp;<span class="n">9</span>&nbsp;集</div>
  <h1>分批鋪單與到價觸發</h1>
  <h2>階梯進場・自動停損停利</h2>
  <div class="rule gold"></div>
</div>""")
# g-1 為什麼要分批
CARDS["card-p9-batch"] = card_html("""
<div class="card">
  <h1 style="font-size:60px">為什麼要分批進出場</h1>
  <div class="steps">
    <div class="step"><div class="no">1</div><div class="txt">一次全押：買在單一價位，回檔就套、追高住套房</div></div>
    <div class="step"><div class="no">2</div><div class="txt"><b>分批進場</b>：跌一檔接一檔，平均成本自動攤平</div></div>
    <div class="step"><div class="no">3</div><div class="txt"><b>分批出場</b>：漲一段賣一點，把獲利分批落袋</div></div>
  </div>
</div>""")
# g-5 鋪單風控紅線
CARDS["card-p9-riskline"] = card_html("""
<div class="card">
  <h1 style="font-size:60px">鋪單的三條紅線</h1>
  <div class="steps">
    <div class="step"><div class="no">1</div><div class="txt">一次送出多筆，總量 ＝ <b>檔數 × 每檔量</b></div></div>
    <div class="step"><div class="no">2</div><div class="txt"><b>動態跟隨</b>自動撤舊補新，行情快時單子一直換</div></div>
    <div class="step"><div class="no">3</div><div class="txt">超過 <b>風控上限</b>會被直接擋下（保護，不是故障）</div></div>
  </div>
</div>""")
# g-7 到價觸發是本機端
CARDS["card-p9-local"] = card_html("""
<div class="card">
  <div class="epnum">到價觸發　·　<span class="n">本機端</span></div>
  <h1 style="font-size:56px">觸價單，跑在你的分頁裡</h1>
  <div class="steps">
    <div class="step"><div class="no">1</div><div class="txt">只在這個分頁 <b>開著</b>時盯價、送單（本機引擎）</div></div>
    <div class="step"><div class="no">2</div><div class="txt">關分頁、電腦休眠、<b>斷線</b>都會失效</div></div>
    <div class="step"><div class="no">3</div><div class="txt">不是券商端預約單 — 長天期請用桌面版或程式單</div></div>
  </div>
</div>""")
# g-8 重點回顧
CARDS["card-p9-recap"] = card_html("""
<div class="card">
  <h1 style="font-size:60px">這集重點回顧</h1>
  <div class="steps">
    <div class="step"><div class="no">1</div><div class="txt"><b>鋪單</b>：階梯式限價，分批進出（總量＝檔數×每檔量）</div></div>
    <div class="step"><div class="no">2</div><div class="txt"><b>到價</b>：K 線設停損／停利／警示，價到自動反應</div></div>
    <div class="step"><div class="no">3</div><div class="txt">切記：觸價是 <b>本機端</b>，分頁要開著才有效</div></div>
  </div>
</div>""")

# ═══════════ 進11 分眾觀看路線圖 — 章節卡＋8 張路線卡（全卡集）═══════════
CARDS["chapter-p11"] = card_html("""
<div class="card">
  <div class="epnum">進階　·　第&nbsp;<span class="n">11</span>&nbsp;集</div>
  <h1>分眾觀看路線圖</h1>
  <h2>你到底該看哪幾集</h2>
  <div class="rule gold"></div>
</div>""")
CARDS["card-p11-map1"] = card_html("""
<div class="card">
  <h1 style="font-size:60px">先挑路，再看片</h1>
  <div class="steps tight">
    <div class="step"><div class="no">1</div><div class="txt">內容很齊，但「我該看哪些、什麼順序」沒人帶</div></div>
    <div class="step"><div class="no">2</div><div class="txt">這集不教操作，只給你一張地圖</div></div>
    <div class="step"><div class="no">3</div><div class="txt">照交易風格分三條路：新手🟢、當沖🔴、波段存股🔵</div></div>
    <div class="step"><div class="no">4</div><div class="txt">不用整套看完，挑對的那幾集就好</div></div>
  </div>
</div>""")
CARDS["card-p11-map2"] = card_html("""
<div class="card">
  <h1 style="font-size:54px">🟢 路線一：新手小資 · 安全畢業</h1>
  <div class="steps tight">
    <div class="step"><div class="no">1</div><div class="txt"><b>T1 登入</b> → 一定停在「模擬環境」，這是你的練習場</div></div>
    <div class="step"><div class="no">2</div><div class="txt"><b>T2 版面 → T3 看盤選股 → T4 交易</b>（兩段式確認 / Kill Switch）</div></div>
    <div class="step"><div class="no">3</div><div class="txt"><b>進6 訂單與委託</b>：限價市價怎麼選、看懂委託與廢單</div></div>
    <div class="step"><div class="no">4</div><div class="txt"><b>進7 帳務與交割</b>：搞懂 T+2，別違約交割</div></div>
    <div class="step"><div class="no">5</div><div class="txt"><b>進8 一鏡到底</b> → 畢業考：一筆完整交易走一輪</div></div>
  </div>
</div>""")
CARDS["card-p11-map3"] = card_html("""
<div class="card">
  <h1 style="font-size:54px">🔴 路線二：當沖老手 · 實戰效率</h1>
  <div class="steps tight">
    <div class="step"><div class="no">1</div><div class="txt"><b>T2 版面</b> → 排一個當沖版型存起來，每天載入</div></div>
    <div class="step"><div class="no">2</div><div class="txt"><b>T4 交易</b> → 閃電左買右賣、圖上點價、Esc×2 全刪</div></div>
    <div class="step"><div class="no">3</div><div class="txt"><b>進5 快捷鍵</b> → ⌘K 切標的、B/S、Esc×2</div></div>
    <div class="step"><div class="no">4</div><div class="txt"><b>T3 五檔/分價量/排行</b> → 找標的與盤口起點</div></div>
    <div class="step"><div class="no">5</div><div class="txt"><b>進9 鋪單</b> → 沿 tick 鋪單、動態追價（進階武器）</div></div>
  </div>
</div>""")
CARDS["card-p11-map4"] = card_html("""
<div class="card">
  <h1 style="font-size:54px">🔵 路線三：波段/存股 · 長線投資</h1>
  <div class="steps tight">
    <div class="step"><div class="no">1</div><div class="txt"><b>T1 → T2</b>：基本設定打底</div></div>
    <div class="step"><div class="no">2</div><div class="txt"><b>T3 看盤選股</b> → 自選清單、籌碼卡先會看</div></div>
    <div class="step"><div class="no">3</div><div class="txt"><b>進7 帳務</b> → 盯維持率、資產分布，別過度集中</div></div>
    <div class="step"><div class="no">4</div><div class="txt"><b>T6 回放</b> → 盤後檢討進出點</div></div>
    <div class="step"><div class="no">5</div><div class="txt"><b>T7 期權 → 進10</b> 選擇權策略、covered call 收租</div></div>
  </div>
</div>""")
CARDS["card-p11-map5"] = card_html("""
<div class="card">
  <h1 style="font-size:58px">三條路，共通三鐵律</h1>
  <div class="steps tight">
    <div class="step"><div class="no">1</div><div class="txt">風控分兩軌：當沖靠 <b>Kill Switch</b>、長線靠 <b>維持率</b></div></div>
    <div class="step"><div class="no">2</div><div class="txt">看賺賠一定算「<b>含手續費和證交稅</b>」的真實淨損益</div></div>
    <div class="step"><div class="no">3</div><div class="txt">先在 <b>模擬環境</b>練熟，再用真錢下場</div></div>
  </div>
</div>""")
CARDS["card-p11-map6"] = card_html("""
<div class="card">
  <div class="epnum"><span class="n">現在</span>就能看的集數</div>
  <div class="steps tight" style="margin-top:30px">
    <div class="step"><div class="no">1</div><div class="txt"><b>入門 T1–T7</b>（1080p）：登入/版面/看盤/交易/回測/回放/期權</div></div>
    <div class="step"><div class="no">2</div><div class="txt"><b>進階 進5–進10</b>（2K）：效率/訂單/帳務/一鏡到底/鋪單/選擇權</div></div>
    <div class="step"><div class="no">3</div><div class="txt"><b>AI Agent 集</b>（2K）</div></div>
    <div class="step"><div class="no">4</div><div class="txt">全程 <b>模擬環境</b>示範，不動真錢</div></div>
  </div>
</div>""")
CARDS["card-p11-map7"] = card_html("""
<div class="card">
  <h1 style="font-size:56px">還在路上的幾塊拼圖</h1>
  <div class="steps tight">
    <div class="step"><div class="no">1</div><div class="txt"><b>基本面選股實戰</b>（存股族最缺，規劃中）</div></div>
    <div class="step"><div class="no">2</div><div class="txt"><b>真實盤口微結構、極速追價</b>（需交易日盤中錄）</div></div>
    <div class="step"><div class="no">3</div><div class="txt">部分成交、一鍵反手、<b>Kill Switch 真實觸發</b></div></div>
    <div class="step"><div class="no">4</div><div class="txt">長天期分批條件單、股票長期績效追蹤</div></div>
  </div>
</div>""")
CARDS["card-p11-map8"] = card_html("""
<div class="card cta">
  <h1 style="font-size:58px">挑一條路，今天就開始</h1>
  <div class="steps tight" style="margin-top:30px">
    <div class="step"><div class="no">🟢</div><div class="txt">新手 → 從 <b>T1</b> 把環境停在模擬開始</div></div>
    <div class="step"><div class="no">🔴</div><div class="txt">當沖 → 從 <b>T2</b> 排一個當沖版型開始</div></div>
    <div class="step"><div class="no">🔵</div><div class="txt">波段存股 → 從 <b>T3</b> 看盤選股開始</div></div>
  </div>
  <div class="rlead">別貪心全看，挑對的一路練到能用真錢穩穩下單</div>
</div>""")

# ═══════════ 進10 選擇權策略損益圖 — 章節卡＋靜態卡 ═══════════
CARDS["chapter-p10"] = card_html("""
<div class="card">
  <div class="epnum">進階　·　第&nbsp;<span class="n">10</span>&nbsp;集</div>
  <h1>選擇權策略損益圖</h1>
  <h2>價差與保護部位</h2>
  <div class="rule gold"></div>
</div>""")
# p10-4 垂直價差三重點
CARDS["card-p10-spread"] = card_html("""
<div class="card">
  <h1 style="font-size:58px">垂直價差：風險獲利雙封頂</h1>
  <div class="steps">
    <div class="step"><div class="no">1</div><div class="txt">買低賣高 Call ＝ <b>多頭價差</b>；買高賣低 ＝ 空頭</div></div>
    <div class="step"><div class="no">2</div><div class="txt">最大獲利、最大虧損、<b>損益兩平</b>全部固定</div></div>
    <div class="step"><div class="no">3</div><div class="txt"><b>淨權利金</b> ＝ 付出 − 收到，就是最大成本</div></div>
  </div>
</div>""")
# p10-6 現股保護實務邊界
CARDS["card-p10-stockhedge"] = card_html("""
<div class="card">
  <h1 style="font-size:56px">現股保護，實務上怎麼做</h1>
  <div class="steps">
    <div class="step"><div class="no">1</div><div class="txt">圖只有 <b>期貨腳</b>，現股避險是用期貨合成示意</div></div>
    <div class="step"><div class="no">2</div><div class="txt">幾張現股對應幾口，要 <b>自己換算</b>或用桌面版</div></div>
    <div class="step"><div class="no">3</div><div class="txt">圖為 <b>結算值</b>，時間價值與保證金另計</div></div>
  </div>
</div>""")
# p10-8 希臘字母沒有
CARDS["card-p10-greeks"] = card_html("""
<div class="card">
  <h1 style="font-size:56px">希臘字母與避險成本：web 版沒有</h1>
  <div class="steps">
    <div class="step"><div class="no">1</div><div class="txt">Delta／Gamma／Theta／Vega 這裡都 <b>看不到</b></div></div>
    <div class="step"><div class="no">2</div><div class="txt">沒有持股 Beta、<b>對沖口數</b>計算機</div></div>
    <div class="step"><div class="no">3</div><div class="txt">要算希臘值與避險成本 → <b>桌面版</b>或程式</div></div>
  </div>
</div>""")
# p10-9 小結
CARDS["card-p10-recap"] = card_html("""
<div class="card cta">
  <h1 style="font-size:58px">先看圖，再下單</h1>
  <div class="steps">
    <div class="step"><div class="no">1</div><div class="txt"><b>價差</b> ＝ 獲利風險雙封頂、成本低</div></div>
    <div class="step"><div class="no">2</div><div class="txt"><b>保護性賣權</b>加地板、<b>掩護性買權</b>封頂收租</div></div>
    <div class="step"><div class="no">3</div><div class="txt">圖是到期結算值，實單再算 <b>時間價值與費用</b></div></div>
  </div>
</div>""")

# ═══════════ 進12 基本面與融資維持率（誠實版）— 章節卡＋靜態卡 ═══════════
CARDS["chapter-p12"] = card_html("""
<div class="card">
  <div class="epnum">進階　·　第&nbsp;<span class="n">12</span>&nbsp;集</div>
  <h1>基本面與融資維持率</h1>
  <h2>web 版能做什麼、不能做什麼</h2>
  <div class="rule gold"></div>
</div>""")
# p12-3 基本面篩選去哪做
CARDS["card-p12-fund"] = card_html("""
<div class="card">
  <h1 style="font-size:54px">基本面篩選：web 版沒有 → 去這裡</h1>
  <div class="steps tight">
    <div class="step"><div class="no">1</div><div class="txt">殖利率／月營收／EPS／本益比／負債比：<b>無任何欄位</b></div></div>
    <div class="step"><div class="no">2</div><div class="txt">改用：<b>桌面版</b>看盤軟體的選股中心</div></div>
    <div class="step"><div class="no">3</div><div class="txt">查財報：<b>公開資訊觀測站</b> mops.twse.com.tw</div></div>
    <div class="step"><div class="no">4</div><div class="txt">記住：排行榜是 <b>動能榜</b>，不是財報榜</div></div>
  </div>
</div>""")
# p12-5 法人籌碼去哪看
CARDS["card-p12-chips"] = card_html("""
<div class="card">
  <h1 style="font-size:54px">法人與大戶籌碼：web 版沒有 → 去這裡</h1>
  <div class="steps tight">
    <div class="step"><div class="no">1</div><div class="txt">三大法人買賣超、外資投信動向：<b>無此畫面</b></div></div>
    <div class="step"><div class="no">2</div><div class="txt">外資、大戶持股比率變化：<b>看不到</b></div></div>
    <div class="step"><div class="no">3</div><div class="txt">改用：桌面版籌碼分析、券商 App 的 <b>法人籌碼頁</b></div></div>
    <div class="step"><div class="no">4</div><div class="txt">web 版籌碼卡：只有個股融資券的 <b>靜態快照</b></div></div>
  </div>
</div>""")
# p12-8 維持率去哪看
CARDS["card-p12-maint"] = card_html("""
<div class="card">
  <h1 style="font-size:52px">融資維持率／追繳斷頭 → 去這裡看</h1>
  <div class="steps tight">
    <div class="step"><div class="no">1</div><div class="txt">整戶維持率 ＝ <b>擔保品市值 ÷ 融資融券金額</b> ×100%</div></div>
    <div class="step"><div class="no">2</div><div class="txt">跌破 <b>130%</b>：券商發追繳，須補錢或減碼</div></div>
    <div class="step"><div class="no">3</div><div class="txt">補繳不足 → 券商代為處分，就是 <b>斷頭</b></div></div>
    <div class="step"><div class="no">4</div><div class="txt">查詢：券商下單 App／桌面版的 <b>信用帳戶頁</b></div></div>
  </div>
</div>""")
# p12-9 一頁看懂
CARDS["card-p12-recap"] = card_html("""
<div class="card cta">
  <h1 style="font-size:54px">一頁看懂：web 做什麼、去哪做</h1>
  <div class="steps tight">
    <div class="step"><div class="no">✓</div><div class="txt">web 能做：<b>排行榜複選</b>(動能)、<b>籌碼快照</b>、<b>自選清單</b></div></div>
    <div class="step"><div class="no">✗</div><div class="txt">web 沒有：基本面篩選、三大法人、融資維持率</div></div>
    <div class="step"><div class="no">→</div><div class="txt">桌面版／觀測站：財報選股、法人籌碼、<b>信用帳戶維持率</b></div></div>
  </div>
  <div class="rlead">看盤在 web，深度研究換工具 — 誠實分工，不被誤導</div>
</div>""")

with sync_playwright() as p:
    b = p.chromium.launch()
    # viewport in 1920×1080 design units × dsf 4/3 → 2560×1440 screenshots
    pg = b.new_page(viewport={"width": 1920, "height": 1080},
                    device_scale_factor=4 / 3)
    for name, html in CARDS.items():
        pg.set_content(html)
        time.sleep(0.6)  # font load
        pg.screenshot(path=str(OUT / f"{name}.png"))
        print("card:", name, flush=True)
    b.close()
print(f"DONE — {len(CARDS)} cards → {OUT}")
