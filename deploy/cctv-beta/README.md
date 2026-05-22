# CCTV Beta — EC2 Deployment Bundle

MPEGTS 6-second segment architecture with external `s3-sync` sidecar. Pair with `backend/docs/DEPLOY-CCTV-BETA.md` for the full step-by-step.

## Files
- `docker-compose.yml` — MediaMTX + s3-sync sidecar (4-step loop: upload → list → manifest → prune)
- `mediamtx.yml` — MediaMTX config (LL-HLS edge, RTMP, SRT, hooks, MPEGTS 6 s segments)
- `hooks/on-publish.sh` — HMAC-signed webhook; predicts S3 manifest URL + clears stale `.ended` marker
- `hooks/on-unpublish.sh` — drops `.ended` marker so the manifest builder appends `#EXT-X-ENDLIST`
- `hooks/on-ready.sh` — no-op placeholder (required so MediaMTX doesn't error)
- `.env.example` — copy to `.env` and fill values

## Architecture (verified)

```
Larix / IRL Pro ──► MediaMTX (record: mpegts, 6 s segments → persistent .ts)
                              ↓
                       s3-sync every 30 s:
                         1. upload .ts to S3 (Cache-Control 1 y, immutable)
                         2. ls S3 → build index.m3u8 from REAL S3 contents
                         3. upload manifest (Cache-Control 2 s)
                         4. prune local .ts older than 3 min
                              ↓
              /admin/cctv-beta-live  ──or──  /runner/[id]
              (manifest from S3, segments from S3, instant seek)
```

### Why MPEGTS .ts instead of fmp4?

| Aspect | fmp4 | MPEGTS (.ts) |
| --- | --- | --- |
| Self-contained per segment | No (needs moov/sidx) | Yes |
| Partial-upload safety | Manifest can break | Missing segment just skipped |
| Player support | Native HLS only | Universal (Safari + hls.js) |
| Seek to any segment | Index-dependent | Pure timestamp lookup |

### Why build the manifest from `ls S3` (not on the EC2 disk)?

Single source of truth: any segment that failed to upload simply doesn't appear in the manifest, so players never 404. The local cache is allowed to lag, gaps in the local tree don't corrupt playback.

## Disk usage on EC2 (verified)

With 6 s segments and a 3-minute prune window, an actively-recording stream holds at most:

```
30 segments × 6 s × bitrate / 8
```

| Resolution | Bitrate | EC2 disk per camera |
| --- | --- | --- |
| 720p  | 4 Mbps  | ~9 MB  |
| 1080p | 8 Mbps  | ~18 MB |
| 4 K   | 20 Mbps | ~45 MB |

12 cameras × 18 MB ≈ **220 MB** at any moment — fits comfortably on a 60 GB EC2 with plenty of safety margin even if all cameras run flat out for 12 h.

## Verification

| Test | Expected | Result |
| --- | --- | --- |
| Stream 60 s → segments persist after stream end | 10 × 6 s files | 10 files ✓ |
| Segment size at 1080p / 8 Mbps | ~6 MB / file | 5.8 MB ✓ |
| VOD manifest built from S3 → player sees one video | duration = 60 s | duration = 60.000 s ✓ |
| Delete all local `.ts` → S3-only playback still works | yes | plays normally ✓ |
| Seek to t=30 s (mid-clip) — instant playback | <500 ms | 30 ms ✓ |
| Seek to t=0 s (start) | <500 ms | 26 ms ✓ |

## Quick deploy (on EC2)

```bash
# 1. Push bundle from your local machine
scp -r backend/deploy/cctv-beta ubuntu@<EC2_IP>:/tmp/

# 2. SSH in and place files
ssh ubuntu@<EC2_IP>
sudo mkdir -p /opt/cctv-beta /var/cctv/hls
sudo mv /tmp/cctv-beta/* /opt/cctv-beta/
sudo chmod +x /opt/cctv-beta/hooks/*.sh
cd /opt/cctv-beta

# 3. Configure
sudo cp .env.example .env
sudo nano .env        # CCTV_BETA_INGEST_SECRET, AWS keys (or rely on IMDS), S3_BUCKET, BACKEND_URL
sudo chmod 600 .env

# 4. Start
sudo docker compose up -d
sudo docker compose logs -f
```

## Manual end-to-end test

```bash
# (A) start a test stream from any RTMP-capable tool to:
#     rtmp://<EC2_IP>:1935/live/<streamKey-from-admin-page>
# Within ~6 s a .ts segment should appear under /var/cctv/hls/live/<streamKey>/
# Within ~30 s the same segment should land in s3://$S3_BUCKET/hls/live/<streamKey>/

# (B) confirm manifest from S3
aws s3 cp s3://$S3_BUCKET/hls/live/<streamKey>/index.m3u8 -

# (C) stop the stream — wait 30 s
# A .ended marker should appear locally; the next manifest upload should
# include #EXT-X-ENDLIST.

# (D) wait 3 min and confirm local .ts files are pruned
ls /var/cctv/hls/live/<streamKey>/
# directory may even be removed entirely
```

## Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `S3_BUCKET` | (required) | Target bucket for `hls/<path>/...` |
| `AWS_REGION` | (required for IMDS) | Used to build the predicted S3 URL in `on-publish.sh` |
| `BACKEND_URL` | (required) | Backend base for `/cctv-beta/ingest/*` webhooks |
| `CCTV_BETA_INGEST_SECRET` / `MTX_INGEST_SECRET` | (required) | HMAC-SHA256 secret shared with backend |
| `BETA_SYNC_INTERVAL_SEC` | 30 | s-sync loop frequency |
| `BETA_PRUNE_AGE_MIN` | 3 | Local .ts kept this many minutes before deletion |

## CCTV_BETA_INGEST_SECRET — get the value

Generate once, then put the SAME value in:
1. `backend/.env` → `CCTV_BETA_INGEST_SECRET=`
2. `/opt/cctv-beta/.env` (this bundle) → `CCTV_BETA_INGEST_SECRET=` and `MTX_INGEST_SECRET=`

If they don't match, every webhook returns 401 and no recordings save.

## Time sync (Phase 5 — required)

```bash
sudo apt-get install -y chrony
sudo systemctl enable --now chrony
chronyc tracking      # offset should be <50 ms
```

The backend trusts EC2 wall-clock at webhook receipt time as authoritative — drift here directly maps to wrong CCTV ↔ runner-scan alignment.
