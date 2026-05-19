#!/bin/sh
# Called by MediaMTX runOnUnpublish hook.
# Args: $1 = MTX_PATH (e.g. "live/616e6d_abc...")
set -e
# Determine recorded file size on disk (best-effort)
STREAM_KEY=$(printf '%s' "$1" | awk -F'/' '{print $NF}')
REC_DIR="/recordings/$1"
SIZE=0
if [ -d "$REC_DIR" ]; then
  SIZE=$(du -sb "$REC_DIR" 2>/dev/null | awk '{print $1}' || echo 0)
fi
# s3Key must point to the master HLS manifest FILE so the player can fetch it directly.
# Pointing to a folder ("hls/xxx/") returns AccessDenied / XML error from S3.
S3_KEY="hls/$STREAM_KEY/index.m3u8"
PAYLOAD=$(printf '{"path":"%s","fileSize":%s,"s3Bucket":"%s","s3Key":"%s"}' "$1" "$SIZE" "$S3_BUCKET" "$S3_KEY")
SIG=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$MTX_INGEST_SECRET" -hex | awk '{print $2}')
curl -fsS -X POST "$BACKEND_URL/cctv-beta/ingest/on-unpublish" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Signature: $SIG" \
  -d "$PAYLOAD"
