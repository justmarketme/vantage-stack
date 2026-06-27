#!/usr/bin/env python
"""
Generate the TRANSPARENT talking-Isabel clip (public/videos/isabel-talk.webm),
fully automated — no Hedra, no manual upload.

Pipeline:
  1. OmniAvatar (HuggingFace Space, gradio_client) lip-syncs the green-screen
     olive Isabel (public/images/isabel-hedra-green.jpg) to her ElevenLabs
     welcome voiceover (public/audio/isabel-welcome.mp3). Output: talking Isabel
     on green, ~5s (the model caps clip length).
  2. ffmpeg keys the green to a VP9/alpha webm using the chroma-key SHADER MATH
     (de-spill + soft alpha) — keeps her navy suit, removes only the green.

The clip plays MUTED and is driven by the live agent's `isabel:speaking` event
(see components/blueprint/IsabelIntro.tsx), so her mouth tracks the real voice.

Deps:  pip install gradio_client   (ffmpeg on PATH)
Run:   python scripts/make-isabel-talk-video.py
Note:  anonymous HF ZeroGPU has a daily quota; export HF_TOKEN for more headroom.
"""
import os, shutil, subprocess, sys
from gradio_client import Client, handle_file

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "public", "images", "isabel-hedra-green.jpg")
AUDIO = os.path.join(ROOT, "public", "audio", "isabel-welcome.mp3")
RAW = os.path.join(ROOT, "public", "videos", "_isabel-talk-green.mp4")
OUT = os.path.join(ROOT, "public", "videos", "isabel-talk.webm")

# shader: despill g=min(g,max(r,b)); alpha = 1 - smoothstep(0.015,0.10, g-max(r,b))
KEY = (
    "format=rgba,"
    "geq=r='r(X,Y)':b='b(X,Y)':g='min(g(X,Y),max(r(X,Y),b(X,Y)))':"
    "a='st(0,g(X,Y)-max(r(X,Y),b(X,Y)));st(1,clip((ld(0)-4)/22,0,1));"
    "255*(1-ld(1)*ld(1)*(3-2*ld(1)))'"
)

def main():
    os.makedirs(os.path.join(ROOT, "public", "videos"), exist_ok=True)
    print("→ OmniAvatar lip-sync (HuggingFace) …", flush=True)
    c = Client("alexnasa/OmniAvatar", verbose=False)
    try:
        c.predict(api_name="/start_session")
    except Exception:
        pass
    r = c.predict(
        image_path=handle_file(IMG),
        audio_path=handle_file(AUDIO),
        text="A warm, friendly professional South African woman speaking to the camera, "
             "natural subtle head movement and expression, solid green background unchanged.",
        num_steps=4,
        api_name="/infer_scene",
    )
    shutil.copy(r["video"] if isinstance(r, dict) else r, RAW)

    print("→ keying to transparent VP9/alpha webm …", flush=True)
    subprocess.run([
        "ffmpeg", "-y", "-i", RAW, "-an", "-vf", f"{KEY},fps=30",
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "32", OUT,
    ], check=True)
    os.remove(RAW)
    print("✅ wrote", OUT)

if __name__ == "__main__":
    sys.exit(main())
