#!/bin/sh
# Called by MediaMTX runOnUnpublish hook.
# Args: $1 = MTX_PATH (e.g. "live/616e6d_abc...")
#
# IMPORTANT — picking the right s3Key:
#   The LL-HLS rolling manifest (index.m3u8 + small *.mp4 segments) only retains
#   ~hlsSegmentCount seconds at any moment, so AFTER unpublish s3://.../index.m3u8
#   references segments that no longer exist on disk and the player spins forever.
#
#   The full-clip recording is the FRAGMENTED MP4 written by mediamtx into
#   /recordings/{path}/{YYYY-MM-DD_HH-MM-SS}.mp4 — that's the file we want to
#   point the admin/runner UI at. We pick the most-recently-modified .mp4 in
#   the path's recording directory (there may be multiple if the segment
#   rotated mid-stream).
set -e
STREAM_KEY=$(printf '%s' "$1" | awk -F'/' '{print $NF}')
REC_DIR="/recordings/$1"

# Pick the freshest fmp4 recording file in the dir (ignores LL-HLS segments which
# match a different name pattern: small numeric/uuid prefix). Recording filenames
# look like "2026-05-20_07-13-33.mp4" — match that exact YYYY-MM-DD_HH-MM-SS shape.
S3_KEY=""
SIZE=0
if [ -d "$REC_DIR" ]; then
  REC_FILE=$(find "$REC_DIR" -maxdepth 1 -type f -name '20*-*-*_*-*-*.mp4' -printf '%T@ %p\n' 2>/dev/null \
    | sort -nr | head -n1 | awk '{print $2}')
  if [ -n "$REC_FILE" ] && [ -f "$REC_FILE" ]; then
    BASENAME=$(basename "$REC_FILE")
    S3_KEY="hls/$1/$BASENAME"
    SIZE=$(stat -c%s "$REC_FILE" 2>/dev/null || echo 0)
  fi
  # Fall back to total dir size if no individual recording file found
  if [ "$SIZE" = "0" ]; then
    SIZE=$(du -sb "$REC_DIR" 2>/dev/null | awk '{print $1}' || echo 0)
  fi
fi

# If we still don't have a recording file (shouldn't happen for normal publishes),
# leave s3Key empty so the backend falls back to the EC2 LL-HLS manifest instead.
PAYLOAD=$(printf '{"path":"%s","fileSize":%s,"s3Bucket":"%s","s3Key":"%s"}' \
  "$1" "$SIZE" "$S3_BUCKET" "$S3_KEY")
SIG=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$MTX_INGEST_SECRET" -hex | awk '{print $2}')
curl -fsS -X POST "$BACKEND_URL/cctv-beta/ingest/on-unpublish" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Signature: $SIG" \
  -d "$PAYLOAD"
