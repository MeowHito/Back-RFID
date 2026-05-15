#!/bin/sh
# Called by MediaMTX runOnPublish hook.
# Args: $1 = MTX_PATH (e.g. live/abc_xyz), $2 = MTX_SOURCE_TYPE (rtmpConn|srtConn)
set -e
PAYLOAD=$(printf '{"path":"%s","sourceType":"%s"}' "$1" "$2")
SIG=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$MTX_INGEST_SECRET" -hex | awk '{print $2}')
curl -fsS -X POST "$BACKEND_URL/cctv-beta/ingest/on-publish" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Signature: $SIG" \
  -d "$PAYLOAD"
