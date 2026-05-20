# CCTV Beta — EC2 Deployment Bundle

Ready-to-deploy files for the EC2 ingest host. Pair with `backend/docs/DEPLOY-CCTV-BETA.md` for the full step-by-step.

## Files
- `docker-compose.yml` — MediaMTX + S3 sync sidecar + disk cleanup sidecar
- `mediamtx.yml` — MediaMTX config (LL-HLS, RTMP, SRT, hooks)
- `hooks/on-publish.sh` — HMAC-signed webhook on stream start
- `hooks/on-unpublish.sh` — webhook on stream end (with file size + S3 key)
- `hooks/on-ready.sh` — no-op placeholder (required so MediaMTX doesn't error)
- `.env.example` — copy to `.env` and fill values

## Storage flow

```
camera ──► MediaMTX ──► /var/cctv/hls (EC2 disk, hot)
                              │
                              ├──► s3-sync  (every 15s)  ──► s3://$S3_BUCKET/hls (durable)
                              └──► cleanup  (every 5min) ──► deletes files mtime > 10min
```

- **Live playback** uses EC2 LL-HLS directly (`:8888`) — `recordingStatus === 'recording'` rows in admin/runner UI point here for ~1s latency.
- **Archived playback** uses the S3 master manifest written into `s3MasterManifestUrl` on `on-unpublish`.
- **Cleanup** never touches files still being written (mtime keeps updating). After a 1h fmp4 segment closes it's eligible for deletion 10 min later — by which time s3-sync has pushed it (it runs every 15s).
- Tweak via `.env`:
  - `BETA_CLEANUP_AGE_MIN=10` — minutes before deletion (raise for a wider safety window)
  - `BETA_CLEANUP_INTERVAL_SEC=300` — how often the cleanup loop runs

## Quick deploy (on EC2)

```bash
# 1. Push bundle to EC2 from your local machine
scp -r backend/deploy/cctv-beta ubuntu@<EC2_IP>:/tmp/

# 2. SSH in and place files
ssh ubuntu@<EC2_IP>
sudo mkdir -p /opt/cctv-beta /var/cctv/hls
sudo mv /tmp/cctv-beta/* /opt/cctv-beta/
sudo chmod +x /opt/cctv-beta/hooks/*.sh
cd /opt/cctv-beta

# 3. Configure
sudo cp .env.example .env
sudo nano .env        # fill in CCTV_BETA_INGEST_SECRET, AWS keys, BACKEND_URL
sudo chmod 600 .env

# 4. Start
sudo docker compose up -d
sudo docker compose logs -f
```

## Verify

```bash
# MediaMTX should answer
curl http://localhost:8888/

# Push a test stream from any RTMP-capable tool to:
#   rtmp://<EC2_IP>:1935/live/<streamKey-from-admin-page>
# Then check the admin dashboard — camera status should flip to "publishing".
```

## CCTV_BETA_INGEST_SECRET — get the value

Generate once, then put the SAME value in:
1. `backend/.env` → `CCTV_BETA_INGEST_SECRET=`
2. `/opt/cctv-beta/.env` (this bundle) → `CCTV_BETA_INGEST_SECRET=` and `MTX_INGEST_SECRET=`

If they don't match, every webhook will return 401 and no recordings will save.

## Time sync (Phase 5 — required)

```bash
sudo apt-get install -y chrony
sudo systemctl enable --now chrony
chronyc tracking      # offset should be <50ms
```

The backend trusts EC2 wall-clock at webhook receipt time as authoritative — drift here directly maps to wrong CCTV ↔ runner-scan alignment.
