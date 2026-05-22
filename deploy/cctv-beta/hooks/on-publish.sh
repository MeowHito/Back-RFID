#!/bin/sh
# Called by MediaMTX runOnPublish hook.
# Args: $1 = MTX_PATH (e.g. live/abc_xyz), $2 = MTX_SOURCE_TYPE (rtmpConn|srtConn)
#
# Behavior:
#   1. Clear any stale .ended marker — if the same streamKey was used for a
#      previous session and that ended cleanly, the marker is still on disk.
#      Without removing it, the s3-sync manifest builder would append
#      #EXT-X-ENDLIST to the NEW session's manifest and players would refuse
#      to load further segments.
#   2. Predict the S3 manifest URL (hls/$path/index.m3u8). The s3-sync sidecar
#      generates this manifest within ~30 s of the first segment arriving on
#      S3, so by the time the backend exposes the row to players, the manifest
#      is already there.
#   3. POST signed webhook to backend with predicted s3Bucket/s3Key/url so the
#      DB row carries a playable URL from second 1 (instead of waiting for
#      on-unpublish to set s3MasterManifestUrl).
set -e

STREAM_KEY=$(printf '%s' "$1" | awk -F'/' '{print $NF}')
REC_DIR="/recordings/$1"

# (1) clear stale .ended marker from a previous session
rm -f "$REC_DIR/.ended" 2>/dev/null || true

# (2) predicted manifest path
#     Example: hls/live/abc_xyz/index.m3u8
S3_KEY="hls/$1/index.m3u8"
S3_URL=""
if [ -n "${S3_BUCKET:-}" ]; then
  REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
  if [ -n "$REGION" ]; then
    S3_URL="https://${S3_BUCKET}.s3.${REGION}.amazonaws.com/${S3_KEY}"
  else
    S3_URL="https://${S3_BUCKET}.s3.amazonaws.com/${S3_KEY}"
  fi
fi

# (3) POST signed webhook
PAYLOAD=$(printf '{"path":"%s","sourceType":"%s","s3Bucket":"%s","s3Key":"%s","s3MasterManifestUrl":"%s"}' \
  "$1" "$2" "${S3_BUCKET:-}" "$S3_KEY" "$S3_URL")
SIG=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$MTX_INGEST_SECRET" -hex | awk '{print $2}')
curl -fsS -X POST "$BACKEND_URL/cctv-beta/ingest/on-publish" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Signature: $SIG" \
  -d "$PAYLOAD"
