#!/usr/bin/env bash
# Turn a raw generated Isabel clip into the web-lite hologram asset + poster.
#
# The desktop hologram (components/blueprint/IsabelOverlay.tsx) chroma-keys this
# clip in WebGL, so the source MUST be shot on a solid, evenly-lit GREEN screen.
# This script does NOT key the green (the shader does that live) — it only trims,
# strips audio, and compresses to a ~2MB faststart MP4, then pulls a poster frame
# for the mobile band (app/blueprint/page.tsx) cropped object-top.
#
# Usage:
#   scripts/process-isabel-intro.sh <raw-clip> [start-seconds] [duration-seconds]
# Example:
#   scripts/process-isabel-intro.sh ~/Downloads/isabel-veo.mp4 0 8
set -euo pipefail

RAW="${1:?path to the raw generated clip is required}"
START="${2:-0}"
DUR="${3:-8}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_VIDEO="$ROOT/public/videos/isabel_intro.mp4"
OUT_POSTER="$ROOT/public/images/isabel-poster.jpg"

echo "→ Encoding web-lite hologram clip ($START s, ${DUR}s) …"
ffmpeg -y -ss "$START" -t "$DUR" -i "$RAW" \
  -an \
  -vf "fps=30,scale='min(1280,iw)':-2:flags=lanczos" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 28 -preset slow \
  -movflags +faststart \
  "$OUT_VIDEO"

echo "→ Extracting poster frame (mid-clip) …"
MID=$(awk "BEGIN { printf \"%.2f\", $START + $DUR/2 }")
ffmpeg -y -ss "$MID" -i "$RAW" -frames:v 1 -q:v 3 "$OUT_POSTER"

SIZE=$(du -h "$OUT_VIDEO" | cut -f1)
echo "✅ Wrote $OUT_VIDEO ($SIZE) + $OUT_POSTER"
echo "   (If the green still fringes after deploy, tweak the key thresholds in IsabelOverlay.tsx.)"
