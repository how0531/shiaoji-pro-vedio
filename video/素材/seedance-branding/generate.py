# generate.py — batch-generate the branding pack via Seedance 2.0 API.
# Runs the moment a provider key exists; otherwise prints what it WOULD do.
#
#   Volcengine Ark:  set ARK_API_KEY   (model id: check current Ark docs,
#                    e.g. doubao-seedance-* / seedance-2-0-* — verify first)
#   Runway route:    set RUNWAY_API_KEY (Seedance route; 5–15s clips)
#
# Usage:
#   python generate.py            # generate all missing clips
#   python generate.py intro     # generate one clip by key
#
# Output → ./out/<name>.mp4 ; the tutorial assembler picks them up by name
# (intro / trans-t1..t7 / outro / concept-key / concept-oco) and falls back
# to static title cards when a file is absent.
import os
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)

# clip registry: name -> (duration_s, prompt extracted from prompts.md)
def load_prompts():
    md = (HERE / "prompts.md").read_text(encoding="utf-8")
    clips = {}
    for m in re.finditer(r"## (\S+\.mp4) — .*?\n(?:\*\*.*?\n)?\n?> (.+?)\n\n", md, re.S):
        name = m.group(1).replace(".mp4", "")
        prompt = " ".join(m.group(2).split())
        clips[name] = prompt
    return clips


DUR = {"intro": 5, "outro": 4, "concept-key": 5, "concept-oco": 5}
# transitions default 2s
def duration_for(name):
    return DUR.get(name, 2)


def gen_ark(prompt, dur, dest):
    """Volcengine Ark content-generation task flow (create → poll → download).
    Verify current model id / endpoint in Ark docs before first run."""
    import urllib.request, json
    key = os.environ["ARK_API_KEY"]
    model = os.environ.get("ARK_SEEDANCE_MODEL", "CHECK-ARK-DOCS-FOR-MODEL-ID")
    base = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks"
    body = json.dumps({
        "model": model,
        "content": [{"type": "text",
                     "text": f"{prompt} --ratio 16:9 --duration {dur}"}],
    }).encode()
    req = urllib.request.Request(base, data=body, headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    task = json.loads(urllib.request.urlopen(req).read())
    tid = task["id"]
    while True:
        time.sleep(6)
        q = urllib.request.Request(f"{base}/{tid}", headers={
            "Authorization": f"Bearer {key}"})
        st = json.loads(urllib.request.urlopen(q).read())
        if st.get("status") == "succeeded":
            url = st["content"]["video_url"]
            urllib.request.urlretrieve(url, dest)
            return True
        if st.get("status") in ("failed", "cancelled"):
            print("  task failed:", st)
            return False


def main():
    clips = load_prompts()
    only = sys.argv[1] if len(sys.argv) > 1 else None
    have_key = bool(os.environ.get("ARK_API_KEY") or os.environ.get("RUNWAY_API_KEY"))
    for name, prompt in clips.items():
        if only and name != only:
            continue
        dest = OUT / f"{name}.mp4"
        if dest.exists():
            print(f"skip {name} (exists)")
            continue
        print(f"— {name} ({duration_for(name)}s)\n  {prompt[:80]}…")
        if not have_key:
            print("  [dry-run] no ARK_API_KEY / RUNWAY_API_KEY set — skipped")
            continue
        if os.environ.get("ARK_API_KEY"):
            ok = gen_ark(prompt, duration_for(name), dest)
            print("  saved" if ok else "  FAILED")
        else:
            print("  Runway route: implement per current Runway Seedance docs")
    print("done")


if __name__ == "__main__":
    main()
