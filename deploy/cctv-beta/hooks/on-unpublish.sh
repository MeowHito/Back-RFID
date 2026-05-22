#!/bin/sh
# Called by MediaMTX runOnUnpublish hook.
# Args: $1 = MTX_PATH (e.g. "live/616e6d_abc...")
#
# Behavior:
#   1. Drop a /recordings/$path/.ended marker file. The s3-sync sidecar's
#      manifest builder picks this up on its next pass and appends
#      #EXT-X-ENDLIST to the S3 index.m3u8 — that tells players the stream
#      is finished so they stop polling for new segments.
#   2. Sum total bytes shipped to S3 for this streamKey (approximate — we
#      sum the local on-disk segments that haven't been pruned yet) so the
#      backend can update the row's fileSize. Once all segments are pruned
#      this becomes 0, but by then the recording is well-archived.
#   3. POST signed on-unpublish webhook to backend so it flips the row to
#      'archived'. The s3 fields were already set by on-publish so we don't
#      need to repeat them here.
set -e

STREAM_KEY=$(printf '%s' "$1" | awk -F'/' '{print $NF}')
REC_DIR="/recordings/$1"

# (1) marker file — the manifest builder loop reads this every 30 s
if [ -d "$REC_DIR" ]; then
  : > "$REC_DIR/.ended"
fi

# (2) best-effort size — sum of .ts segments still on local disk (a lower
# bound on the true total, since s3-sync may have already pruned older ones).
SIZE=0
if [ -d "$REC_DIR" ]; then
  SIZE=$(find "$REC_DIR" -type f -name '*.ts' -exec stat -c%s {} \; 2>/dev/null \
    | awk 'BEGIN{s=0}{s+=$1}END{print s}')
  [ -z "$SIZE" ] && SIZE=0
fi

# (3) POST signed webhook — backend handles the s3Bucket/s3Key already set
# in on-publish, so we just send size + path here.
PAYLOAD=$(printf '{"path":"%s","fileSize":%s}' "$1" "$SIZE")
SIG=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$MTX_INGEST_SECRET" -hex | awk '{print $2}')
curl -fsS -X POST "$BACKEND_URL/cctv-beta/ingest/on-unpublish" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Signature: $SIG" \
  -d "$PAYLOAD"
