# CCTV Beta (Larix → EC2 → S3) — Deployment Guide

ระบบ CCTV รุ่นใหม่ที่แยกออกจากของเดิม 100% สำหรับ A/B test ก่อน sunset ระบบ WebSocket เดิม

## สถาปัตยกรรม

```
มือถือ + Larix Broadcaster
        │ (SRT/RTMP over Internet)
        ▼
┌────────────────────────────┐
│ EC2 ingest (แยกจาก web)    │
│  - MediaMTX (1935/8890/8888)│
│  - nginx (serve HLS local) │
│  - aws-cli sync sidecar    │
│  - chronyd (NTP)           │
└──────────┬─────────────────┘
           │ HTTPS playback
           ▼
   Admin browser (hls.js)
           │
           ▼ (cold storage)
       S3 bucket
```

## Env vars (backend `.env`)

```
CCTV_BETA_INGEST_HOST=ingest.your-domain.com
CCTV_BETA_PLAYBACK_HOST=play.your-domain.com
CCTV_BETA_INGEST_SECRET=<random-32-bytes-hex>
```

`CCTV_BETA_INGEST_SECRET` เป็น shared secret ระหว่าง MediaMTX webhook wrapper กับ NestJS — HMAC-SHA256

## Phase 1 — Provision EC2 ingest

**Instance:** `c6i.large` (2 vCPU, 4GB RAM) — รับ ~4-8 streams 1080p พร้อมกัน

**Security group inbound:**
| Port | Proto | Source | ใช้สำหรับ |
|------|-------|--------|-----------|
| 1935 | TCP | 0.0.0.0/0 | RTMP ingest |
| 8890 | UDP | 0.0.0.0/0 | SRT ingest |
| 8888 | TCP | CloudFront / VPC | HLS playback |
| 8889 | TCP | CloudFront / VPC | WebRTC (WHEP) |
| 22   | TCP | admin IP only | SSH |

**IAM role:** `s3:PutObject`, `s3:ListBucket` บน bucket archive

## Phase 2 — docker-compose.yml

วางไว้ที่ `/opt/cctv-beta/docker-compose.yml`:

```yaml
version: '3.8'
services:
  mediamtx:
    image: bluenviron/mediamtx:1.9.0
    network_mode: host
    restart: unless-stopped
    volumes:
      - ./mediamtx.yml:/mediamtx.yml:ro
      - /var/cctv/hls:/recordings
      - ./hooks:/hooks:ro
    environment:
      - MTX_INGEST_SECRET=${CCTV_BETA_INGEST_SECRET}
      - BACKEND_URL=https://api.your-domain.com

  s3-sync:
    image: amazon/aws-cli:latest
    restart: unless-stopped
    volumes:
      - /var/cctv/hls:/data:ro
    environment:
      - AWS_DEFAULT_REGION=ap-southeast-1
      - S3_BUCKET=cctv-beta-archive
    entrypoint: /bin/sh
    command: -c "while true; do aws s3 sync /data s3://$$S3_BUCKET/hls --exclude '*.tmp' --storage-class STANDARD_IA; sleep 60; done"
```

## Phase 3 — mediamtx.yml

```yaml
hlsAddress: :8888
hlsVariant: lowLatency
hlsSegmentCount: 7
hlsSegmentDuration: 1s
hlsPartDuration: 200ms
hlsDirectory: /recordings

rtmpAddress: :1935
srtAddress: :8890
webrtcAddress: :8889

pathDefaults:
  record: yes
  recordPath: /recordings/%path/%Y-%m-%d_%H-%M-%S
  recordFormat: fmp4
  recordSegmentDuration: 1h
  runOnPublish: /hooks/on-publish.sh $MTX_PATH $MTX_SOURCE_TYPE
  runOnUnpublish: /hooks/on-unpublish.sh $MTX_PATH
  runOnReady: /hooks/on-ready.sh $MTX_PATH

paths:
  ~^live/.+$:
```

## Phase 4 — Webhook wrappers (`hooks/on-publish.sh`)

```bash
#!/bin/sh
set -e
PAYLOAD=$(printf '{"path":"%s","sourceType":"%s"}' "$1" "$2")
SIG=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -hmac "$MTX_INGEST_SECRET" -hex | awk '{print $2}')
curl -fsS -X POST "$BACKEND_URL/cctv-beta/ingest/on-publish" \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Signature: $SIG" \
  -d "$PAYLOAD"
```

ทำ `on-unpublish.sh` กับ `on-ready.sh` แบบเดียวกัน (เปลี่ยน endpoint เป็น `/cctv-beta/ingest/on-unpublish` กับ `/on-error`)

## Phase 5 — Time sync (สำคัญที่สุด)

```bash
sudo dnf install chrony -y
sudo systemctl enable --now chronyd
chronyc tracking   # ตรวจ offset ต้อง <50ms
```

ระบบเชื่อ `serverIngestStart` (เวลา EC2 ตอน webhook ยิง) เป็น authoritative — **ห้าม** ใช้ encoder timestamp จากมือถือ (อาจ drift หลายวินาที)

## Phase 6 — Larix setup บนมือถือ

1. ติดตั้ง **Larix Broadcaster** (iOS/Android, ฟรี)
2. Settings → Connections → Add → URL = สแกน QR จากหน้า `/admin/cctv-beta-cameras`
3. Mode: SRT (แนะนำสำหรับ 4G/5G — ทน packet loss) หรือ RTMP
4. Video: 1080p30, bitrate 2-4 Mbps, keyframe 1s
5. กดปุ่ม **Live** — กล้องจะขึ้น `publishing` ใน admin ภายใน 2-3 วินาที

## Phase 7 — Verification checklist

- [ ] `curl https://ingest.your-domain.com:8888/` ตอบ MediaMTX welcome
- [ ] สร้างกล้องในหน้า `/admin/cctv-beta-cameras` ได้ → ได้ SRT/RTMP URL
- [ ] Larix push เข้าได้ → status ขึ้น `publishing` ภายใน 5s
- [ ] เปิดหน้า `/admin/cctv-beta-live` เห็นภาพสด latency <4s
- [ ] หยุด push → record ลง `/admin/cctv-beta-recordings` status `completed`
- [ ] S3 sync sidecar เห็นไฟล์ใน `s3://cctv-beta-archive/hls/<streamKey>/`
- [ ] รอ 90s → status เปลี่ยนเป็น `archived`
- [ ] Reject test: push ด้วย streamKey มั่ว → MediaMTX ปิด connection (HTTP 401 จาก webhook)

## ค่าใช้จ่ายโดยประมาณ (ap-southeast-1)

| รายการ | ราคา/เดือน |
|--------|------------|
| EC2 c6i.large (24/7) | ~$60 |
| EBS gp3 100GB | ~$8 |
| S3 STANDARD_IA 500GB | ~$6 |
| Egress 100GB | ~$9 |
| **รวม** | **~$83** |

จุดที่ scale: เปลี่ยนเป็น c6i.xlarge ($120) เมื่อมีกล้อง >8 ตัว pivot streams พร้อมกัน

## Sunset legacy CCTV

เมื่อ beta เสถียร (~2-4 สัปดาห์):

1. เพิ่ม env `CCTV_INGEST_MODE=mediamtx` ที่ default
2. Migrate existing `CctvCamera` → `CctvBetaCamera` ผ่าน script (สร้าง streamKey ใหม่ต้องบอก operator)
3. ลบ `cctv.gateway.ts` และ socket-based logic ใน `cctv-cameras/`
4. ลบหน้า `cctv-live` `cctv-recordings` เก่า, rename `cctv-beta-*` → `cctv-*`

## Troubleshooting

- **Larix push ไม่เข้า** → ตรวจ security group port 1935/8890, ตรวจ DNS resolve, ตรวจ stream key match (ดู MediaMTX log)
- **HLS latency >10s** → ตรวจ `hlsVariant: lowLatency` ใน mediamtx.yml + LL-HLS รองรับใน hls.js ≥1.5
- **Webhook 401 ทั้งหมด** → ตรวจ `CCTV_BETA_INGEST_SECRET` ตรงกันระหว่าง EC2 (env) และ backend
- **clock drift** → `chronyc tracking` แล้ว offset ควร <50ms, ถ้าเกินให้ restart chronyd
