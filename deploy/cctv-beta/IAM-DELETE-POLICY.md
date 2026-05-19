# Backend S3 Delete — IAM Setup

เอกสารนี้บอกวิธีสร้าง IAM user ขั้นต่ำให้ backend ใช้ลบ S3 objects เมื่อ admin
กดปุ่ม Delete ที่ `/admin/cctv-beta-recordings`

## ความเสี่ยง

Backend จะมี access key สำหรับ:
- **List + Delete** ของ bucket `cctv-rfid` (เฉพาะ prefix `hls/`)
- **ไม่มีสิทธิ์ตอน read/write อื่น** (ไม่มี upload, ไม่มีอ่าน bucket อื่น)

หากกุญแจรั่ว → ผู้โจมตีลบไฟล์ใน `hls/` ได้ แต่ทำอย่างอื่นกับ S3 ของคุณไม่ได้

## ขั้นตอน

### 1) สร้าง IAM Policy

AWS Console → **IAM** → **Policies** → **Create policy** → JSON tab → วาง:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListHlsObjects",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::cctv-rfid",
      "Condition": {
        "StringLike": { "s3:prefix": ["hls/*"] }
      }
    },
    {
      "Sid": "DeleteHlsObjects",
      "Effect": "Allow",
      "Action": [
        "s3:DeleteObject",
        "s3:DeleteObjectVersion"
      ],
      "Resource": "arn:aws:s3:::cctv-rfid/hls/*"
    }
  ]
}
```

- ตั้งชื่อ policy: `cctv-rfid-backend-delete`
- Create policy

### 2) สร้าง IAM User + แนบ Policy

AWS Console → **IAM** → **Users** → **Create user**
1. Username: `cctv-rfid-backend`
2. **ไม่ต้องติ๊ก** "Provide user access to the AWS Management Console"
3. Next → **Attach policies directly** → ค้นหา `cctv-rfid-backend-delete` → ติ๊ก
4. Next → Create user

### 3) สร้าง Access Key

หลังจากสร้าง user แล้ว:
1. คลิกชื่อ user → แท็บ **Security credentials**
2. **Access keys** → **Create access key**
3. เลือก **Application running outside AWS** → Next
4. Description tag: `cctv-rfid-backend` → Create
5. **คัดลอก `Access key ID` + `Secret access key`** — ตัว Secret เห็นครั้งเดียวเท่านั้น

### 4) ใส่ใน `backend/.env`

```
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
CCTV_BETA_S3_BUCKET=cctv-rfid
```

### 5) Restart backend

```bash
# On EC2
sudo systemctl restart rfid-backend
# Or via docker
docker compose restart backend
```

Log ตอน boot ควรมี:
```
[CctvBetaS3Service] S3 delete enabled: bucket=cctv-rfid region=ap-southeast-1
```

ถ้าเห็น `S3 delete DISABLED — missing AWS_REGION / ...` แปลว่ายัง config ไม่ครบ

## ทดสอบ

1. เปิด `/admin/cctv-beta-recordings`
2. กด **Delete** ที่ recording ใด recording หนึ่ง
3. Backend log ควรเห็น:
   ```
   [CctvBetaS3Service] S3 deleted 24 object(s) under hls/abc123_xyz/
   ```
4. ไปดูใน S3 Console → bucket → folder `hls/abc123_xyz/` หายแล้ว ✓

## Behavior ถ้าไม่ config

ถ้า env vars ไม่ครบ:
- ปุ่ม Delete ยังทำงาน — ลบ DB row ปกติ
- แต่ S3 file **จะยังคงอยู่**
- Log แจ้งเตือนตอน boot: `S3 delete DISABLED ...`

ในกรณีนี้ใช้ **Lifecycle Rule** ของ S3 เป็น backup:
- AWS Console → S3 → bucket → Management → Lifecycle rules
- Expire current versions: 30 days

## ลบทั้งแคมเปญ

ปุ่ม "ลบทั้งหมดของแคมเปญ (N)" จะ:
1. หา recordings ทั้งหมดของแคมเปญใน DB
2. Loop ลบ S3 prefix ของแต่ละตัว (in parallel)
3. ลบ DB rows ทั้งหมด
4. คืน `{ deleted, s3Deleted }` ให้ frontend

> S3 ของ recordings ที่ status ยังไม่เป็น `archived` (ยังไม่มี s3Key) → ไม่มีอะไรลบใน S3
