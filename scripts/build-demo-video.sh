#!/usr/bin/env bash
# Records a demo walkthrough against the deployed Vercel frontend and
# bundles captions (soft mov_text track + sidecar SRT) into the output.
#
# Two specs available:
#   walkthrough.spec.ts        — customer journey  (default)
#   staff-walkthrough.spec.ts  — staff handover
#
# Usage:
#   ./scripts/build-demo-video.sh                        # customer
#   ./scripts/build-demo-video.sh staff                  # staff
#   DEMO_BASE_URL=https://preview.vercel.app ./scripts/build-demo-video.sh staff
#
# Requires: pnpm, @playwright/test (installed), ffmpeg, chromium (run
# `pnpm exec playwright install chromium` once).

set -euo pipefail

WHICH="${1:-customer}"
case "$WHICH" in
  customer) SPEC="walkthrough.spec.ts"; OUT_BASE="demo-walkthrough" ;;
  staff)    SPEC="staff-walkthrough.spec.ts"; OUT_BASE="staff-walkthrough" ;;
  *) echo "unknown spec '$WHICH' (use 'customer' or 'staff')" >&2; exit 1 ;;
esac

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
TEST_RESULTS_DIR="$WEB_DIR/test-results"
OUT_DIR="$REPO_ROOT/docs"
OUT_FILE="$OUT_DIR/${OUT_BASE}.mp4"
OUT_SRT="$OUT_DIR/${OUT_BASE}.srt"

echo ">>> wiping previous demo artifacts"
rm -rf "$TEST_RESULTS_DIR"
mkdir -p "$OUT_DIR"

echo ">>> running Playwright demo spec ($SPEC)"
(
  cd "$WEB_DIR"
  pnpm exec playwright test \
    --config=playwright.demo.config.ts \
    --project=chromium \
    "tests/demo/$SPEC"
)

echo ">>> locating recorded video + captions"
VIDEO=$(find "$TEST_RESULTS_DIR" -name '*.webm' | head -n 1)
CAPTIONS=$(find "$TEST_RESULTS_DIR" -name 'captions.srt' | head -n 1)

if [ -z "$VIDEO" ]; then
  echo "ERROR: no .webm video found under $TEST_RESULTS_DIR" >&2
  exit 1
fi
if [ -z "$CAPTIONS" ]; then
  echo "WARNING: no captions.srt found — producing video without captions"
fi

echo ">>> source video: $VIDEO"
[ -n "$CAPTIONS" ] && echo ">>> captions:     $CAPTIONS"

echo ">>> transcoding webm → mp4"
# Captions are added as a soft mov_text subtitle track (selectable in the
# player) instead of burned in — burning requires ffmpeg compiled with
# libass, which the default Homebrew formula doesn't include. The .srt
# is also dropped next to the .mp4 so players that prefer sidecar
# subtitles can pick it up automatically.
STAGING=$(mktemp -d)
trap 'rm -rf "$STAGING"' EXIT
cp "$VIDEO" "$STAGING/in.webm"
if [ -n "$CAPTIONS" ]; then
  cp "$CAPTIONS" "$STAGING/captions.srt"
  cp "$CAPTIONS" "$OUT_SRT"

  ffmpeg -y \
    -i "$STAGING/in.webm" -i "$STAGING/captions.srt" \
    -map 0:v -map 1 \
    -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p \
    -c:s mov_text \
    -metadata:s:s:0 language=eng \
    -metadata:s:s:0 title="Walkthrough" \
    -an \
    "$OUT_FILE"
else
  ffmpeg -y -i "$STAGING/in.webm" -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -an "$OUT_FILE"
fi

echo
echo "✓ wrote $OUT_FILE"
ls -lh "$OUT_FILE"
