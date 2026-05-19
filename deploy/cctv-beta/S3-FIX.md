# แก้ปัญหา CCTV Beta Recordings เล่นไม่ได้ (S3 Access Denied)

## สาเหตุ
1. **S3 objects เป็น private** — เพราะ `aws s3 sync` upload โดยไม่ใส่ ACL
2. **`s3Key` ใน DB เก็บเป็นโฟลเดอร์** (`hls/xxx/`) ไม่ใช่ไฟล์ manifest (`hls/xxx/index.m3u8`)

## แก้ในโค้ดแล้ว
- `hooks/on-unpublish.sh` → `S3_KEY="hls/$STREAM_KEY/index.m3u8"`
- `docker-compose.yml` → เพิ่ม `--acl public-read` ใน aws s3 sync

## ต้องทำต่อบน EC2 / AWS Console

### 1) Deploy script ใหม่ขึ้น EC2
```bash
# บน EC2
cd /opt/cctv-beta
git pull       # หรือ scp ไฟล์ใหม่ขึ้น
docker compose up -d --force-recreate s3-sync
```

### 2) เปิด S3 Bucket ให้ public read (สำหรับ HLS เท่านั้น)

**AWS Console → S3 → bucket `cctv-rfid`:**

**A. Permissions → Block public access:** ปิด 2 อันนี้ (อีก 2 อันคงไว้ก็ได้)
- ❌ Block public access to buckets and objects granted through new public bucket or access point policies
- ❌ Block public and cross-account access to buckets and objects through any public bucket or access point policies

**B. Permissions → Bucket policy:** วาง policy นี้
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

**C. Permissions → CORS:** วาง config นี้ (ให้ browser fetch จาก domain ได้)
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "https://live.action.in.th",
      "http://localhost:3000"
    ],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
    "MaxAgeSeconds": 3000
  }
]
```

### 3) Fix existing recordings (ปรับ s3Key ที่บันทึกผิดไว้)

รันบน Mongo shell ของ local หรือ EC2:
```js
db.cctvbetarecordings.find({ s3Key: /\/$/ }).forEach(doc => {
  const newKey = doc.s3Key + 'index.m3u8';
  const newUrl = `https://${doc.s3Bucket}.s3.amazonaws.com/${newKey}`;
  db.cctvbetarecordings.updateOne(
    { _id: doc._id },
    { $set: { s3Key: newKey, s3MasterManifestUrl: newUrl } }
  );
  print(`Fixed ${doc._id}`);
});
```

### 4) Fix existing files in S3 (set public-read ย้อนหลัง)

บน EC2 หรือเครื่องที่มี AWS CLI:
```bash
aws s3 cp s3://cctv-rfid/hls/ s3://cctv-rfid/hls/ \
  --recursive --acl public-read --metadata-directive REPLACE
```

## ตรวจหลังแก้

1. เปิด URL ตรงๆ ในเบราว์เซอร์:
   `https://cctv-rfid.s3.amazonaws.com/hls/616e6d_fbc95ecdadf2dc2eb4bb566b/index.m3u8`
   → ต้องเห็น text ของ HLS manifest (ขึ้นต้น `#EXTM3U`) ไม่ใช่ XML error

2. กลับไปที่ `/admin/cctv-beta-recordings` → กด Play
   → วิดีโอควรเล่นได้
