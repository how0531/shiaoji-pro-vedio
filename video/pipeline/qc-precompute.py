# qc-precompute.py — 一次載入 Whisper，對 final3/ 全部成片：
#   (1) 全片中文轉寫 → qc3/transcripts/<tid>.txt（給檢核 agent 比對預期旁白）
#   (2) 所有卡片段（chapter/agenda/still cards）逐格像素差 → qc3/jitter/<tid>.txt
# 用法： python scripts/qc-precompute.py [tid ...]   # 不帶參數 = 全部
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import imageio_ffmpeg  # noqa: E402
import topics_spec  # noqa: E402

FF = imageio_ffmpeg.get_ffmpeg_exe()
FINAL = ROOT / "final3"
WORK = ROOT / "assemble3"
OUT_T = ROOT / "qc3" / "transcripts"
OUT_J = ROOT / "qc3" / "jitter"
OUT_T.mkdir(parents=True, exist_ok=True)
OUT_J.mkdir(parents=True, exist_ok=True)

# assemble3 的 STILL_CARD 表（哪些 segment 是卡片）
import importlib
asm = importlib.import_module("assemble3")


def final_path(topic):
    suffix = topic["id"].split("-", 1)[1]
    return FINAL / f"{topic['ep']}-{suffix}.mp4"


def media_duration(p):
    r = subprocess.run([FF, "-i", str(p)], capture_output=True, text=True,
                       errors="replace")
    import re
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    if not m:
        return 0.0
    h, mnt, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
    return h * 3600 + mnt * 60 + s


def jitter_window(mp4, t0, t1):
    from PIL import Image, ImageChops
    with tempfile.TemporaryDirectory() as td:
        subprocess.run([FF, "-y", "-ss", str(t0), "-to", str(t1), "-i",
                        str(mp4), "-vf", "fps=30", "-q:v", "2",
                        f"{td}/f%04d.png"], capture_output=True)
        frames = sorted(Path(td).glob("f*.png"))
        if len(frames) < 3:
            return None
        worst = 0.0
        prev = Image.open(frames[0]).convert("L")
        for f in frames[1:]:
            cur = Image.open(f).convert("L")
            w, h = cur.size
            box = (int(w * .1), int(h * .1), int(w * .9), int(h * .66))
            d = ImageChops.difference(prev.crop(box), cur.crop(box))
            hist = d.histogram()
            tot = sum(hist)
            worst = max(worst, sum(i * c for i, c in enumerate(hist)) / max(tot, 1))
            prev = cur
        return worst


def main():
    only = set(sys.argv[1:])
    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="cpu", compute_type="int8")
    for topic in topics_spec.TOPICS:
        tid = topic["id"]
        if only and tid not in only:
            continue
        mp4 = final_path(topic)
        if not mp4.exists():
            print(f"-- skip {tid} (no final)", flush=True)
            continue
        # (1) transcript
        tf = OUT_T / f"{tid}.txt"
        segs, _ = model.transcribe(str(mp4), language="zh", vad_filter=True,
                                   beam_size=5)
        lines = [f"[{s.start:7.2f} - {s.end:7.2f}] {s.text.strip()}"
                 for s in segs]
        tf.write_text("\n".join(lines), encoding="utf-8")
        print(f"transcript {tid}: {len(lines)} lines", flush=True)
        # (2) jitter on all card pieces
        tl_path = WORK / topic["ep"] / "timeline.json"
        jf = OUT_J / f"{tid}.txt"
        rows = []
        if tl_path.exists():
            tl = json.loads(tl_path.read_text(encoding="utf-8"))
            names = list(tl.keys())
            dur = media_duration(mp4)
            card_ids = {"chapter", "agenda"} | set(asm.STILL_CARD.keys())
            for i, name in enumerate(names):
                if name not in card_ids:
                    continue
                start = tl[name]
                end = tl[names[i + 1]] if i + 1 < len(names) else dur
                t0 = start + 0.9
                t1 = min(start + 2.9, end - 0.5)
                if t1 - t0 < 0.3:
                    continue
                w = jitter_window(mp4, t0, t1)
                if w is None:
                    continue
                verdict = "STATIC-OK" if w < 0.8 else "MOTION!"
                rows.append(f"{name}: window {t0:.1f}-{t1:.1f}s "
                            f"max_absdiff={w:.3f} {verdict}")
        jf.write_text("\n".join(rows), encoding="utf-8")
        bad = sum(1 for r in rows if "MOTION" in r)
        print(f"jitter {tid}: {len(rows)} cards, {bad} flagged", flush=True)
    print("PRECOMPUTE DONE", flush=True)


if __name__ == "__main__":
    main()
