# CCTV Beta Recording playback — known incidents

## 2026-05: ไฟล์หายระหว่าง 2026-05-16 → 2026-05-20

### อาการ
- หน้า `/runner/[id]` กดเปิดวิดีโอ Beta แล้วหมุนค้างหรือขึ้น "HLS Playback Failed"
- recordings ใน DB status=`archived` แต่ S3 ไม่มีไฟล์

### Root cause (สองชั้นซ้อน)
1. **s3-sync upload fail** — `aws s3 sync ... --acl public-read` ใช้ไม่ได้กับ bucket ที่ตั้ง
   **Bucket owner enforced** (default ใหม่ของ AWS ตั้งแต่ Apr 2023) → ทุก PutObject fail
   ด้วย `AccessControlListNotSupported`. logs ของ container แสดง upload failed ต่อเนื่อง
2. **cleanup ลบไฟล์ก่อน sync เสร็จ** — cleanup container ลบไฟล์อายุ > 10 นาทีโดย
   ไม่ตรวจว่า upload สำเร็จไหม → ไฟล์ที่ค้างใน queue หายตลอดกาล
3. **ingest hook ส่ง s3Key ผิด format** — `hooks/on-unpublish.sh` รุ่นแรกตั้ง
   `S3_KEY="hls/$STREAM_KEY/index.m3u8"` แต่ MediaMTX ไม่ได้ archive LL-HLS manifest
   ขึ้น S3 (มีแค่ fmp4 segments) ทำให้แม้ sync ปกติก็ยังหา playback ไม่เจอ

### ที่แก้ในรอบนี้
- `docker-compose.yml` — ลบ `--acl public-read` ออกจาก s3-sync command
- `.env.example` — `BETA_CLEANUP_AGE_MIN`: 10 → **1440 (24h)** เพื่อ grace period
- `hooks/on-unpublish.sh` — หา fmp4 master file ใน `/recordings/{path}/` แล้วตั้ง
  `S3_KEY="hls/<MTX_PATH>/<filename>.mp4"` ตรงกับ path ที่ s3-sync เขียนจริง
- DB: recordings 9 ตัวที่ status=archived แต่ไม่มีไฟล์ → mark `error` พร้อม
  `errorMessage` อธิบายสาเหตุ

### ที่ทำใน AWS Console (ครั้งเดียว เพื่อความถาวร)
**Bucket policy** (เปิดอยู่แล้วใน production):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadHLS",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::cctv-rfid/hls/*"
  }]
}
```

**CORS** (สำหรับ browser HLS player):
```json
[{
  "AllowedHeaders": ["*"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedOrigins": ["https://live.action.in.th", "http://localhost:3000"],
  "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
  "MaxAgeSeconds": 3000
}]
```

### ตรวจหลัง deploy ใหม่
1. `docker logs --tail 30 cctv-beta-s3-sync-1` ไม่มี `upload failed`
2. หลัง stream ใหม่: `aws s3 ls s3://cctv-rfid/hls/live/<streamKey>/` มี master `.mp4`
3. DB ของ recording ใหม่: `s3Key` ลงท้าย `.mp4` ไม่ใช่ `.m3u8`
4. เปิด URL `s3MasterManifestUrl` ตรงๆ — ต้องได้ HTTP 200 + binary mp4 stream
5. หน้า `/runner/[id]` กดเปิดวิดีโอ → HlsPlayer detect `.mp4` แล้วเล่นเป็น progressive MP4
