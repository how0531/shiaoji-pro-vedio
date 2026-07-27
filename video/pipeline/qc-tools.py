# qc-tools.py — 檢核工具箱：讓 QC agent「聽得到、量得到」
#
#   python scripts/qc-tools.py transcribe <mp4>        # Whisper 中文逐段轉寫（含時間戳）
#   python scripts/qc-tools.py expected  <topic-id>    # 該集「應該唸出的」完整旁白（大綱+逐段）
#   python scripts/qc-tools.py jitter    <mp4> <t0> <t1>  # 逐格像素差（靜態卡應≈0）
#
# 用途：
#   transcribe vs expected → 抓「跳針/唸錯句/新舊旁白混用」（字幕檢核聽不到的盲區）
#   jitter → 字卡段逐格位移量化（zoompan 抖動類問題的客觀證據）
import subprocess
import sys
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import imageio_ffmpeg  # noqa: E402

FF = imageio_ffmpeg.get_ffmpeg_exe()


def cmd_transcribe(mp4):
    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="cpu", compute_type="int8")
    segs, info = model.transcribe(mp4, language="zh", vad_filter=True,
                                  beam_size=5)
    print(f"# transcript of {Path(mp4).name} (lang={info.language})")
    for s in segs:
        print(f"[{s.start:7.2f} - {s.end:7.2f}] {s.text.strip()}")


def cmd_expected(tid):
    import topics_spec
    sys.path.insert(0, str(ROOT / "scripts"))
    # AGENDA lives in assemble3; import lazily (pulls edge_tts, harmless)
    import importlib
    asm = importlib.import_module("assemble3")
    topic = next((t for t in topics_spec.TOPICS if t["id"] == tid), None)
    if topic is None:
        raise SystemExit(f"topic {tid} not found")
    print(f"# expected narration — {topic['ep']} {topic['title']}")
    print(f"[agenda] {asm.AGENDA[tid]}")
    for seg in topic["segments"]:
        print(f"[{seg['id']}] {seg['narration']}")


def cmd_jitter(mp4, t0, t1):
    from PIL import Image, ImageChops
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(
            [FF, "-y", "-ss", str(t0), "-to", str(t1), "-i", mp4,
             "-vf", "fps=30", "-q:v", "2", f"{td}/f%04d.png"],
            capture_output=True)
        frames = sorted(Path(td).glob("f*.png"))
        if len(frames) < 3:
            raise SystemExit("window too short — need >0.1s")
        worst = 0.0
        prev = Image.open(frames[0]).convert("L")
        for f in frames[1:]:
            cur = Image.open(f).convert("L")
            # 中央區域，下緣收到 66%——實測雙行字幕頂端可達 ~68.5%h（T1 7.5s
            # 換句實測 bbox y986/1440）。字幕換句是合法內容變化、不是抖動。
            w, h = cur.size
            box = (int(w * .1), int(h * .1), int(w * .9), int(h * .66))
            diff = ImageChops.difference(prev.crop(box), cur.crop(box))
            hist = diff.histogram()
            total = sum(hist)
            mean = sum(i * c for i, c in enumerate(hist)) / max(total, 1)
            worst = max(worst, mean)
            prev = cur
        print(f"frames={len(frames)} window={t0}-{t1}s "
              f"max_consecutive_mean_absdiff={worst:.3f}")
        print("verdict:", "STATIC-OK" if worst < 0.8 else
              "MOTION/JITTER — inspect visually")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    op = sys.argv[1]
    if op == "transcribe":
        cmd_transcribe(sys.argv[2])
    elif op == "expected":
        cmd_expected(sys.argv[2])
    elif op == "jitter":
        cmd_jitter(sys.argv[2], float(sys.argv[3]), float(sys.argv[4]))
    else:
        raise SystemExit(f"unknown op {op}")
