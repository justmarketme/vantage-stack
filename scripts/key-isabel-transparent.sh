#!/usr/bin/env bash
# Key a GREEN-SCREEN Hedra talking clip of Isabel into a TRANSPARENT video
# (VP9 + alpha webm) so she blends seamlessly into the dark blueprint — no card,
# no background. Uses the exact chroma-key shader math (de-spill + soft alpha)
# that the old WebGL overlay used, which (unlike ffmpeg `chromakey`) keeps her
# navy suit and only removes the green.
#
# Source the clip from Hedra by animating public/images/isabel-hedra-green.jpg
# (Isabel cut onto #00b140) with public/audio/isabel-intro.mp3.
#
# Usage: scripts/key-isabel-transparent.sh <hedra-green-talking-clip>.mp4
set -euo pipefail

RAW="${1:?path to the green-screen Hedra clip is required}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/videos/isabel-talk.webm"

# g - max(r,b) keys green; thresholds 0.015..0.10 → ~4..26 in 0-255 space.
KEY="format=rgba,\
geq=r='r(X,Y)':b='b(X,Y)':g='min(g(X,Y),max(r(X,Y),b(X,Y)))':\
a='st(0,g(X,Y)-max(r(X,Y),b(X,Y)));st(1,clip((ld(0)-4)/22,0,1));255*(1-ld(1)*ld(1)*(3-2*ld(1)))'"

echo "→ Keying to transparent VP9/alpha webm (keeps her voice for the welcome) …"
ffmpeg -y -i "$RAW" \
  -vf "$KEY,fps=30" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 30 \
  -c:a libopus -b:a 96k \
  "$OUT"

echo "✅ Wrote $OUT ($(du -h "$OUT" | cut -f1)) — transparent talking Isabel."
