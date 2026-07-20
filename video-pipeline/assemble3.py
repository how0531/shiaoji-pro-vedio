# assemble3.py — segment-aligned assembler for the v3 pipeline. Consumes a
# topic's recordings/<id>/scenes.json + the webm, and builds a fully aligned
# episode: chapter card -> agenda card -> per-segment [footage|still] where each
# segment's VIDEO length is retimed to EXACTLY its narration length, so audio
# and video stay locked. zoom segments crop to the recorder's live bbox.
#
# Reuses assemble.py's proven bits: edge-tts per-sentence TTS (zh-TW-HsiaoChen,
# +4%), duration probing, SRT line-breaking (wrap_sub/_ok_break/split_long),
# libass burn-in (Microsoft JhengHei).
#
# Usage:  python scripts/assemble3.py t1-login
import asyncio
import hashlib
import math
import os
import re
import subprocess
import sys
from pathlib import Path

import edge_tts
import imageio_ffmpeg

sys.path.insert(0, str(Path(__file__).resolve().parent))
import topics_spec  # noqa: E402
import json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = Path(__file__).resolve().parent.parent
REC = ROOT / "recordings"
CARDS = ROOT / "assets" / "cards"
WORK = ROOT / "assemble3"
FINAL = ROOT / "final3"
WORK.mkdir(exist_ok=True)
FINAL.mkdir(exist_ok=True)

VOICE = "zh-TW-HsiaoChenNeural"
RATE = "+4%"

# The webm starts recording a moment AFTER the recorder's anchor; measured
# empirically at ~2.3s. cut_video_time = recorded_time - OFFSET.
OFFSET = 2.3
K_MIN, K_MAX = 0.55, 2.2
PANO = 0.4      # panorama hold before a zoom cuts in

# 2K burn-in: FontSize/Outline/MarginV scaled ~×1.33 from the 1080p values.
SUBS_STYLE = (
    "force_style='FontName=Microsoft JhengHei,FontSize=21,Bold=1,"
    "PrimaryColour=&HFFFFFF&,OutlineColour=&HC8000000&,BorderStyle=1,"
    "Outline=2.0,Shadow=1.4,Spacing=0.4,MarginV=52'")

# Per-topic agenda narration (spoken over the agenda card; matches the three
# bullets printed on assets/cards/agenda-t{n}.png).
AGENDA = {
    "t1-login": "本集你會學到：一、到永豐官網申請 API 金鑰。"
                "二、填進設定精靈、選模擬環境。三、啟動並進入交易終端。",
    "t2-layout": "本集你會學到：一、新增面板、拖曳搬移。"
                 "二、連動與鎖定的差別。三、一鍵套用現成版型。",
    "t3-watch": "本集你會學到：一、自選清單與連動。"
                "二、K 線、五檔、分價量表。三、排行榜、熱力圖、籌碼卡。",
    "t4-trade": "本集你會學到：一、兩段式下單與委託管理。"
                "二、圖上停損停利，也就是本機監控。三、閃電下單與風控鎖。",
    "t5-indicators": "本集你會學到：一、加指標、調設定。"
                     "二、圖例的隱藏與移除。三、自訂指標與桌面版回測。",
    "t6-replay": "本集你會學到：一、載入最近交易日行情。"
                 "二、變速重播、拖進度條。三、收盤後檢討方法。",
    "t7-options": "本集你會學到：一、T 字報價看買賣權。"
                  "二、連動組合單湊兩腳。三、到期損益圖試算。",
    "a5-tools": "本集你會學到：一、快捷鍵，⌘K 搜尋、B 買 S 賣、連按兩次 Esc。"
                "二、工具面板，權證、個股期、通知中心與診斷。"
                "三、外觀設定，主題配色、字級、隱私與音效。",
    "ai-agent": "本集你會學到：一、AI Agent 是什麼、在哪裡用。"
                "二、三個真的能跑的實作。"
                "三、盤前掃描、自動風控、持倉監控。",
    "p6-orders": "本集你會學到：一、價別、效期、單位怎麼選。"
                 "二、委託分頁的四種狀態。三、廢單的常見原因。",
    "p7-account": "本集你會學到：一、帳務分頁怎麼看，交割帳戶餘額在哪。"
                  "二、T 加二交割與違約後果。三、權益數、保證金與風險指標。",
    "p8-fulltrade": "本集你會學到：一、從選股、算量到下單。"
                    "二、看委託狀態、設好停損。三、平倉看含手續費和證交稅的淨損益。",
    "p9-grid": "本集你會學到：一、用鋪單一次掛出階梯式限價單，分批進場、也分批出場。"
               "二、到價觸發，在 K 線上設停損、停利、警示，價到自動反應。"
               "三、誠實面，這些觸價是本機端執行，關掉分頁就失效。",
    "p11-roadmap": "本集你會學到：一、依你的交易風格挑一條路線走，不用整套全看。"
                   "二、三條路線，新手安全畢業、當沖實戰效率、波段存股長線。"
                   "三、每條路線的觀看順序、重點集數，還有哪些可以先略過。",
    "p10-payoff": "本集你會學到：一、用損益圖看懂價差單的最大獲利與最大虧損。"
                  "二、保護性賣權、掩護性買權的圖形長相。"
                  "三、為什麼圖是結算損益、不含時間價值。",
    "p12-fundamentals": "本集你會學到：一、web 版能做的三件事，排行榜複選、籌碼資訊、自選清單，實際測給你看。"
                        "二、web 版沒有的功能，老實告訴你該去哪做。"
                        "三、用期貨風險指標當比喻，把追繳、斷頭一次講懂。",
}
# Segments whose picture is a still card instead of footage. ("static"|"kenburns")
STILL_CARD = {
    "t4-5": ("warn-client-trigger.png", "static"),   # reinforce 「本機監控」
    "ai-6": ("ai-outro.png", "kenburns"),            # AI Agent 收尾卡
    # 進6 訂單與委託
    "o-5": ("card-p6-decide.png", "static"),         # 決策卡
    "o-7": ("card-p6-reject.png", "static"),         # 廢單原因卡
    # 進7 帳務與交割安全
    "a-3": ("card-p7-settle.png", "static"),         # T+2 交割觀念
    "a-4": ("card-p7-default.png", "static"),        # 違約後果
    "a-6": ("card-p7-maint.png", "static"),          # 融資維持率觀念
    "a-7": ("card-p7-dist.png", "kenburns"),         # 資產分布收尾（App 非交易日不渲染）
    # 進8 一鏡到底
    "w-6": ("card-p8-close.png", "static"),          # 平倉含費觀念（R1:補算式）
    "w-7": ("card-p8-outro.png", "kenburns"),        # 一鏡到底收尾
    # R1 優化輪新增卡
    "o-8": ("card-p6-tick.png", "static"),           # 跳動單位
    "o-9": ("card-p6-odd.png", "static"),            # 零股規則
    "t4-b": ("card-t4-bracket.png", "static"),       # 括號單 OCO
    "a5-9": ("card-a5-hotkeys.png", "static"),       # 快捷鍵速查表
    "p10-6b": ("card-p10-basis.png", "static"),      # 基差/追蹤誤差
    "p12-3b": ("card-p12-yield.png", "static"),      # 殖利率/填息
    # 進9 分批鋪單與到價觸發
    "g-1": ("card-p9-batch.png", "static"),          # 為什麼要分批
    "g-5": ("card-p9-riskline.png", "static"),       # 鋪單風控紅線
    "g-7": ("card-p9-local.png", "static"),          # 到價本機端
    "g-8": ("card-p9-recap.png", "kenburns"),        # 重點回顧
    # 進10 選擇權策略損益圖
    "p10-4": ("card-p10-spread.png", "static"),      # 垂直價差三重點
    "p10-6": ("card-p10-stockhedge.png", "static"),  # 現股保護實務邊界
    "p10-8": ("card-p10-greeks.png", "static"),      # 希臘字母沒有
    "p10-9": ("card-p10-recap.png", "kenburns"),     # 小結
    # 進12 基本面與融資維持率（誠實版）
    "p12-3": ("card-p12-fund.png", "static"),        # 基本面去哪做
    "p12-5": ("card-p12-chips.png", "static"),       # 法人籌碼去哪看
    "p12-8": ("card-p12-maint.png", "static"),       # 維持率去哪看
    "p12-9": ("card-p12-recap.png", "kenburns"),     # 一頁看懂
    # 進11 分眾觀看路線圖（全卡集）
    "map-1": ("card-p11-map1.png", "static"),        # 先挑路再看片
    "map-2": ("card-p11-map2.png", "static"),        # 🟢 新手
    "map-3": ("card-p11-map3.png", "static"),        # 🔴 當沖
    "map-4": ("card-p11-map4.png", "static"),        # 🔵 波段存股
    "map-5": ("card-p11-map5.png", "static"),        # 三鐵律
    "map-6": ("card-p11-map6.png", "static"),        # 現在可看
    "map-7": ("card-p11-map7.png", "static"),        # 還在路上
    "map-8": ("card-p11-map8.png", "kenburns"),      # 挑一條路開始
}
# Segments whose picture is a pre-rendered dark-terminal scroll clip (built by
# render-terminal.py from the real agent runs, PII masked). Retimed to the
# narration length exactly like VIDEO_SEG (no crop/panorama).
TERM_DIR = ROOT / "assets" / "terminal"
TERM_VIDEO = {
    "ai-3": TERM_DIR / "ai-3.mp4",   # 盤前掃描播報 (run1.txt)
    "ai-4": TERM_DIR / "ai-4.mp4",   # 自主進場加風控 (run0.txt)
    "ai-5": TERM_DIR / "ai-5.mp4",   # 持倉監控 kill-switch (run3.txt)
}
# Segments whose picture is an EXTERNAL video (change B: real SinoPac footage,
# PII already masked, already 1920×1080). Retimed to the narration length.
SINOPAC = Path(r"c:\Users\How\OneDrive\桌面\Shiaoji pro\video-assets\sinopac-shots")
VIDEO_SEG = {"t1-2": SINOPAC / "sinopac-t1-2.mp4"}
# Topics that get an outro CTA card appended (silent) after the last segment.
OUTRO = {"t7-options": "outro-cta.png"}


# ─────────────────────── helpers reused from assemble.py ───────────────────────
def run(args, **kw):
    r = subprocess.run([str(a) for a in args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", **kw)
    if r.returncode != 0:
        print("CMD FAIL:", " ".join(str(a) for a in args)[:240])
        print(r.stderr[-900:])
        raise RuntimeError("ffmpeg failed")
    return r


def media_duration(path):
    r = subprocess.run([FF, "-i", str(path)], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", r.stderr)
    if not m:
        raise RuntimeError(f"no duration for {path}")
    h, mnt, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
    return h * 3600 + mnt * 60 + s


def split_sentences(t):
    parts = re.split(r"(?<=[。！？；])", t)
    return [p for p in (x.strip() for x in parts) if p]


async def _tts(sentences, outdir):
    # CONTENT-ADDRESSED cache: the filename is a hash of (voice, rate, TEXT).
    # The old positional scheme (s000.mp3, s001.mp3…) silently replayed STALE
    # audio whenever a narration was edited — the video then SPOKE the old
    # sentence under the new subtitle (user-heard 跳針/重複講). With content
    # addressing an edited sentence always regenerates; unchanged ones reuse.
    outdir.mkdir(parents=True, exist_ok=True)
    files = []
    for s in sentences:
        h = hashlib.md5(f"{VOICE}|{RATE}|{s}".encode("utf-8")).hexdigest()[:16]
        f = outdir / f"s{h}.mp3"
        if not f.exists() or f.stat().st_size == 0:
            await edge_tts.Communicate(s, VOICE, rate=RATE).save(str(f))
        files.append(f)
    return files


def fmt_ts(t):
    ms = int(round(t * 1000))
    return f"{ms//3600000:02d}:{ms%3600000//60000:02d}:{ms%60000//1000:02d},{ms%1000:03d}"


LEAD_PUNCT = "，。！？；：、』」）,.!?;:)"
OPEN_PUNCT = "『「（《〈"


def _ok_break(s, i):
    if i <= 0 or i >= len(s):
        return False
    if s[i] in LEAD_PUNCT:
        return False
    a, b = s[i - 1], s[i]
    if a in OPEN_PUNCT or a == "—" or b == "—":
        return False
    if a.isascii() and b.isascii() and (a.isalnum() and b.isalnum()):
        return False
    return True


def _best_break(s, width):
    for i in range(min(width, len(s) - 2), 5, -1):
        if s[i - 1] in "，、；：。」』）…" and _ok_break(s, i):
            return i
    for i in range(min(width, len(s) - 2), max(5, width - 10), -1):
        if _ok_break(s, i):
            return i
    return None


def wrap_sub(s, width=20):
    if len(s) <= width:
        return s
    i = _best_break(s, width)
    if i is None:
        i = len(s) // 2
        while i < len(s) - 1 and not _ok_break(s, i):
            i += 1
    return s[:i] + "\n" + s[i:]


def split_long(sentences, durs, limit=38):
    out_s, out_d = [], []
    for s, d in zip(sentences, durs):
        if len(s) <= limit:
            out_s.append(s)
            out_d.append(d)
            continue
        mid = len(s) // 2
        cut = None
        for off in range(0, mid - 4):
            for j in (mid - off, mid + off):
                if 4 < j < len(s) - 4 and s[j - 1] in "，、；：":
                    cut = j
                    break
            if cut:
                break
        if not cut:
            cut = mid
            while cut < len(s) - 1 and not _ok_break(s, cut):
                cut += 1
        p1, p2 = s[:cut], s[cut:]
        r = len(p1) / len(s)
        out_s += [p1, p2]
        out_d += [d * r, d * (1 - r)]
    return out_s, out_d


# ─────────────────────────── v3-specific builders ───────────────────────────
V_ENC = ["-c:v", "libx264", "-crf", "19", "-preset", "medium",
         "-pix_fmt", "yuv420p", "-r", "30"]
A_ENC = ["-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2"]
# Optional background-music bed: drop ONE royalty-free track here (mp3/m4a/wav)
# and the next assemble mixes it — looped, low, faded — under the narration.
# No file present → no BGM (unchanged output). Pixabay Music recommended (CC0,
# no attribution, commercial OK). Keep it calm/minimal so it sits under speech.
BGM_DIR = ROOT / "assets" / "bgm"
BGM_VOL = 0.10   # ~ -20 dB under the voice


def _bgm_file():
    if BGM_DIR.is_dir():
        for f in sorted(BGM_DIR.iterdir()):
            if f.suffix.lower() in (".mp3", ".m4a", ".wav", ".aac", ".ogg"):
                return f
    return None


def zoom_crop(bbox, pad, W=2560, H=1440):
    """16:9 crop rect (even ints) around bbox expanded by pad, clamped."""
    x, y, w, h = bbox["x"], bbox["y"], bbox["w"], bbox["h"]
    cx, cy = x + w / 2, y + h / 2
    need_w, need_h = w + 2 * pad, h + 2 * pad
    cw = max(need_w, need_h * 16 / 9)
    ch = cw * 9 / 16
    if cw > W:
        cw, ch = W, W * 9 / 16
    if ch > H:
        ch, cw = H, H * 16 / 9
    rx = min(max(cx - cw / 2, 0), W - cw)
    ry = min(max(cy - ch / 2, 0), H - ch)
    rx, ry, cw, ch = (int(round(v)) for v in (rx, ry, cw, ch))
    cw -= cw % 2
    ch -= ch % 2
    return rx, ry, cw, ch


def seg_audio(wd, text, name):
    """TTS the text per-sentence, concat -> aac; return (sentences, durs, path, total)."""
    sentences = split_sentences(text)
    files = asyncio.run(_tts(sentences, wd / f"tts_{name}"))
    durs = [media_duration(f) for f in files]
    lst = wd / f"a_{name}.txt"
    lst.write_text("\n".join(f"file '{f.as_posix()}'" for f in files), encoding="utf-8")
    out = wd / f"a_{name}.m4a"
    run([FF, "-y", "-f", "concat", "-safe", "0", "-i", lst, *A_ENC, out])
    return sentences, durs, out, media_duration(out)


def silence(wd, dur, name):
    out = wd / f"a_{name}.m4a"
    run([FF, "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
         "-t", f"{dur:.3f}", *A_ENC, out])
    return out


def card_clip(wd, png, dur, name, fade_in=0.4, fade_out=0.4):
    # Cards are STRICTLY STATIC (fade only) — zoompan's integer-pixel rounding
    # makes slow ken-burns JITTER on sharp text (user-verified). Never zoom text.
    out = wd / f"v_{name}.mp4"
    fo = max(0.0, dur - fade_out)
    vf = (f"scale=2560:1440:force_original_aspect_ratio=decrease,"
          f"pad=2560:1440:(ow-iw)/2:(oh-ih)/2,fps=30,"
          f"fade=t=in:st=0:d={fade_in},fade=t=out:st={fo:.3f}:d={fade_out}")
    run([FF, "-y", "-loop", "1", "-r", "30", "-i", png, "-t", f"{dur:.3f}",
         "-vf", vf, *V_ENC, "-t", f"{dur:.3f}", out])
    return out


def kenburns_clip(wd, png, dur, name, z0=1.0, z1=1.06, fade=0.5):
    out = wd / f"v_{name}.mp4"
    frames = max(2, round(dur * 30))
    fo = max(0.0, dur - fade)
    vf = (f"scale=3840:2160,setsar=1,"
          f"zoompan=z='min({z0}+{(z1-z0):.5f}*in/{frames},{z1})'"
          f":x='iw/2-(iw/zoom)/2':y='ih/2-(ih/zoom)/2':d=1:s=2560x1440:fps=30,"
          f"fade=t=in:st=0:d={fade},fade=t=out:st={fo:.3f}:d={fade}")
    run([FF, "-y", "-loop", "1", "-r", "30", "-i", png, "-t", f"{dur:.3f}",
         "-vf", vf, *V_ENC, "-t", f"{dur:.3f}", out])
    return out


def footage_clip(wd, src, ss, dur, target, name, zoom=None):
    """Cut [ss, ss+dur) from src, retime to `target`s (freeze-pad if short),
    and — for zoom segments — hold PANO seconds of panorama then crop in."""
    cut = wd / f"c_{name}.mp4"
    run([FF, "-y", "-ss", f"{ss:.3f}", "-t", f"{dur:.3f}", "-i", src, "-an",
         "-vf", "fps=30,scale=2560:1440:force_original_aspect_ratio=decrease,"
         "pad=2560:1440:(ow-iw)/2:(oh-ih)/2,setsar=1", *V_ENC, cut])
    t_cut = media_duration(cut)
    k = max(K_MIN, min(K_MAX, target / t_cut))
    retimed = t_cut * k
    pad = target - retimed
    full = wd / f"f_{name}.mp4"
    if pad > 0.05:
        # chaining setpts+tpad(clone) is a silent no-op in this ffmpeg build
        # (freeze never applied → -shortest later truncates the narration).
        # Do it in TWO passes: retime, then freeze-pad the encoded file.
        tmp = wd / f"r_{name}.mp4"
        run([FF, "-y", "-i", cut, "-vf", f"setpts=PTS*{k:.5f},fps=30",
             *V_ENC, tmp])
        run([FF, "-y", "-i", tmp, "-vf",
             f"tpad=stop_mode=clone:stop_duration={pad:.3f},fps=30",
             "-t", f"{target:.3f}", *V_ENC, full])
    else:
        run([FF, "-y", "-i", cut, "-vf", f"setpts=PTS*{k:.5f},fps=30",
             "-t", f"{target:.3f}", *V_ENC, full])
    print(f"    {name}: cut {t_cut:.1f}s -> k={k:.2f} pad={max(0,pad):.1f}s -> {target:.1f}s", flush=True)
    if not zoom:
        return full
    rx, ry, cw, ch = zoom_crop(zoom["bbox"], zoom["pad"])
    out = wd / f"z_{name}.mp4"
    fc = (f"[0:v]fps=30,split=2[a][b];"
          f"[a]trim=0:{PANO},setpts=PTS-STARTPTS[pano];"
          f"[b]trim={PANO},setpts=PTS-STARTPTS,"
          f"crop={cw}:{ch}:{rx}:{ry},scale=2560:1440:flags=lanczos,setsar=1[zm];"
          f"[pano][zm]concat=n=2:v=1[v]")
    run([FF, "-y", "-i", full, "-filter_complex", fc, "-map", "[v]",
         "-t", f"{target:.3f}", *V_ENC, out])
    print(f"    {name}: zoom crop={cw}x{ch}@{rx},{ry} (pano {PANO}s)", flush=True)
    return out


def build(topic):
    tid = topic["id"]
    print(f"\n══ assembling {topic['ep']} · {topic['title']} ══", flush=True)
    wd = WORK / topic["ep"]
    wd.mkdir(parents=True, exist_ok=True)
    meta = json.loads((REC / tid / "scenes.json").read_text(encoding="utf-8"))
    src = REC / tid / meta["video_webm"]
    scenes = {s["segment_id"]: s for s in meta["scenes"]}

    # pieces = ordered list of (kind, name, video_path, audio_path,
    #          sentences, sent_durs, audio_dur)
    pieces = []

    # 1) chapter card (2.5s, silent, static + fade — NO zoom on text, it jitters)
    ch = card_clip(wd, CARDS / f"chapter-{topic['ep'].lower()}.png", 2.5, "chapter")
    pieces.append(("card", "chapter", ch, silence(wd, 2.5, "chapter"),
                   [], [], 2.5))

    # 2) agenda card (narrated, static + fade)
    a_sents, a_durs, a_aud, a_len = seg_audio(wd, AGENDA[tid], "agenda")
    ag = card_clip(wd, CARDS / f"agenda-{topic['ep'].lower()}.png", a_len,
                   "agenda", 0.3)
    pieces.append(("card", "agenda", ag, a_aud, a_sents, a_durs, a_len))

    # 3) per-segment
    for seg in topic["segments"]:
        sid = seg["id"]
        sents, durs, aud, alen = seg_audio(wd, seg["narration"], sid)
        target = alen
        sc = scenes.get(sid, {})
        if sid in VIDEO_SEG:
            vpath = VIDEO_SEG[sid]
            vdur = media_duration(vpath)
            vid = footage_clip(wd, vpath, 0.0, vdur, target, sid, None)
            print(f"  {sid}: SinoPac real footage {vpath.name} "
                  f"({target:.1f}s from {vdur:.1f}s)", flush=True)
        elif sid in TERM_VIDEO:
            vpath = TERM_VIDEO[sid]
            vdur = media_duration(vpath)
            vid = footage_clip(wd, vpath, 0.0, vdur, target, sid, None)
            print(f"  {sid}: terminal clip {vpath.name} "
                  f"({target:.1f}s from {vdur:.1f}s)", flush=True)
        elif sid in STILL_CARD:
            png, _mode = STILL_CARD[sid]
            # ALL cards render static+fade — zoompan drift jitters on text
            # (integer-pixel rounding), so text cards never zoom. See card_clip.
            vid = card_clip(wd, CARDS / png, target, sid)
            print(f"  {sid}: still card {png} (static, {target:.1f}s)", flush=True)
        else:
            ss = max(0.0, sc["start"] - OFFSET)
            dur = (sc["end"] - OFFSET) - ss
            zoom = None
            if seg.get("zoom") and sc.get("zoom_bbox"):
                zoom = {"bbox": sc["zoom_bbox"], "pad": sc.get("pad") or seg["zoom"]["pad"]}
            vid = footage_clip(wd, src, ss, dur, target, sid, zoom)
        pieces.append(("seg", sid, vid, aud, sents, durs, alen))

    # optional silent outro CTA card (T7 closes the series)
    if tid in OUTRO:
        odur = 3.6
        ov = card_clip(wd, CARDS / OUTRO[tid], odur, "outro", 0.4)
        pieces.append(("card", "outro", ov, silence(wd, odur, "outro"),
                       [], [], odur))

    # concat video (copy) and audio (copy)
    vlist = wd / "video.txt"
    vlist.write_text("\n".join(f"file '{p[2].as_posix()}'" for p in pieces), encoding="utf-8")
    body = wd / "body.mp4"
    run([FF, "-y", "-f", "concat", "-safe", "0", "-i", vlist, "-c", "copy", body])
    alist = wd / "audio.txt"
    alist.write_text("\n".join(f"file '{p[3].as_posix()}'" for p in pieces), encoding="utf-8")
    voice = wd / "voice.m4a"
    run([FF, "-y", "-f", "concat", "-safe", "0", "-i", alist, "-c", "copy", voice])

    # build SRT over the whole timeline (cumulative piece audio durations)
    srt_lines, idx, t0 = [], 1, 0.0
    timeline = {}
    for kind, name, vid, aud, sents, durs, alen in pieces:
        timeline[name] = round(t0, 3)      # piece start in the final timeline
        if sents:
            cue_s, cue_d = split_long(sents, durs)
            t = t0
            for s, d in zip(cue_s, cue_d):
                srt_lines += [str(idx),
                              f"{fmt_ts(t)} --> {fmt_ts(min(t + d, t0 + alen))}",
                              wrap_sub(s.rstrip('。；')), ""]
                idx += 1
                t += d
        t0 += alen
    srt = wd / "subs.srt"
    srt.write_text("\n".join(srt_lines), encoding="utf-8")
    (wd / "timeline.json").write_text(
        json.dumps(timeline, ensure_ascii=False, indent=2), encoding="utf-8")

    total_v = media_duration(body)
    total_a = media_duration(voice)
    print(f"  video {total_v:.1f}s / audio {total_a:.1f}s "
          f"(Δ {abs(total_v-total_a):.2f}s)", flush=True)

    # final: burn subs + mux audio, faststart
    suffix = tid.split("-", 1)[1] if "-" in tid else tid
    out = FINAL / f"{topic['ep']}-{suffix}.mp4"
    vfo = max(0.0, total_v - 0.7)
    afo = max(0.0, total_a - 0.6)
    vfilter = (f"[0:v]fps=30,subtitles={srt.name}:{SUBS_STYLE},"
               f"fade=t=in:st=0:d=0.7,fade=t=out:st={vfo:.3f}:d=0.7[v]")
    bgm = _bgm_file()
    inputs = ["-i", body, "-i", voice]
    if bgm is not None:
        # loop the bed, drop it low, fade it, and mix UNDER the voice (normalize=0
        # keeps the narration at full level). duration=first → matches the voice.
        bfo = max(0.0, total_a - 1.5)
        inputs += ["-stream_loop", "-1", "-i", str(bgm)]
        afilter = (
            f"[1:a]afade=t=in:d=0.6,afade=t=out:st={afo:.3f}:d=0.6[vo];"
            f"[2:a]volume={BGM_VOL},afade=t=in:d=1.8,"
            f"afade=t=out:st={bfo:.3f}:d=1.8[bg];"
            f"[vo][bg]amix=inputs=2:duration=first:normalize=0[a]")
        print(f"  ♪ mixing BGM bed: {bgm.name} (vol {BGM_VOL})", flush=True)
    else:
        afilter = f"[1:a]afade=t=in:d=0.6,afade=t=out:st={afo:.3f}:d=0.6[a]"
    run([FF, "-y", *inputs,
         "-filter_complex", f"{vfilter};{afilter}",
         "-map", "[v]", "-map", "[a]",
         *V_ENC, *A_ENC, "-movflags", "+faststart", "-shortest", out],
        cwd=str(wd))
    print(f"  ✓ {out}  ({media_duration(out):.1f}s)", flush=True)
    return out


def main():
    tid = sys.argv[1] if len(sys.argv) > 1 else "t1-login"
    topic = next((t for t in topics_spec.TOPICS if t["id"] == tid), None)
    if not topic:
        raise SystemExit(f"topic {tid} not found")
    build(topic)


if __name__ == "__main__":
    main()
