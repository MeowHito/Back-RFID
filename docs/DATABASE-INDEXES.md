# Database Indexes & Deployment (EC2 / Vercel)

## สิ่งที่ปรับเพื่อให้โหลดเร็วขึ้น (ที่ทำไปแล้ว)

- **Campaign:** เพิ่ม index `isFeatured` และใช้ `.lean()` ใน findFeatured + findAll
- **Runners:** เพิ่ม `countByEvent()` ใช้ `countDocuments` แทนโหลด list ทั้งหมด (ใช้ใน registration count, BIB สร้างอัตโนมัติ), จำกัด `findByEvent()` สูงสุด 2000 รายการ และใช้ `.lean()`
- **Events:** จำกัด `findAll` / `findByFilter` สูงสุด 500 รายการ และใช้ `.lean()`
- **Checkpoints:** `findByCampaign` และ `findMappingsByEvent` ใช้ `.lean()`
- **Frontend (จัดการจุด Checkpoint):** โหลด campaigns + featured พร้อมกัน (ลดจาก 3 เป็น 2 รอบ)

หลัง deploy backend ใหม่ index จะถูกสร้าง/ sync เอง (รวม `isFeatured`)

---

## สรุป Index ที่มีในโปรเจกต์

Mongoose สร้าง index ตามที่ประกาศใน schema ตอนที่ backend เริ่มทำงาน (เมื่อเชื่อมต่อ MongoDB)

### Campaigns
| Index | ใช้สำหรับ |
|-------|------------|
| `uuid` (unique) | ค้นหาด้วย uuid |
| `eventDate` (-1) | เรียงรายการอีเวนต์ |
| `status` | กรองสถานะ |
| `isDraft, status` | กรอง campaign ที่เผยแพร่ |
| `isDraft, eventDate` | รายการที่เผยแพร่เรียงตามวัน |
| **`isFeatured`** | **ดึง campaign ที่กดดาว (featured) – ใช้บ่อยใน admin** |

### Checkpoints
| Index | ใช้สำหรับ |
|-------|------------|
| `campaignId, orderNum` | ดึง checkpoint ของ campaign เรียงตามลำดับ |
| `uuid` (unique) | ค้นหาด้วย uuid |

### Runners, TimingRecords, Users, Events, etc.
มี index ครบตาม schema ใน `backend/src/**/*.schema.ts`

---

## ต้องทำอะไรกับ EC2 (Backend) / Vercel (Frontend)?

### EC2 (Backend)
- **ไม่ต้องรัน script แยก** – เมื่อ **deploy backend ใหม่** (รัน `npm run start` หรือ `node dist/main`) Mongoose จะ **sync index** กับ MongoDB เอง (สร้าง index ที่ยังไม่มี)
- ถ้าอยากให้ index ถูกสร้างทันทีหลัง deploy ครั้งถัดไป: แค่ **redeploy backend บน EC2** (build ใหม่แล้ว restart service)
- ถ้าใช้ PM2: `pm2 restart all` หลัง pull code ใหม่ (ที่รวม index `isFeatured` แล้ว)

### Vercel (Frontend)
- **ไม่เกี่ยวกับ database โดยตรง** – Frontend บน Vercel ไม่ต่อ MongoDB
- ถ้าโหลดช้า มักเป็นเพราะ:
  1. **API ช้า** – request จาก Vercel ไปที่ Backend (EC2) หรือไป MongoDB ผ่าน Backend
  2. **Cold start** – serverless function ของ Vercel หรือ backend ถ้าเป็น serverless
  3. **ระยะทาง / เครือข่าย** – Vercel ↔ EC2 หรือ EC2 ↔ MongoDB อยู่คนละ region จะช้า

ดังนั้น **การเพิ่ม index ที่ Backend (EC2) จะช่วยให้ API ตอบเร็วขึ้น → หน้าเว็บบน Vercel โหลดเร็วขึ้น** เพราะ frontend รอ response จาก API

---

## ตรวจสอบว่า index ถูกสร้างแล้ว (ถ้าต้องการ)

### วิธีที่ 1: MongoDB Shell / Compass
```bash
# เชื่อมต่อ MongoDB แล้ว
use <database_name>

db.campaigns.getIndexes()
# ควรเห็น index ชื่อ isFeatured_1 ถ้า backend ถูก restart หลังเพิ่ม index แล้ว

db.checkpoints.getIndexes()
db.runners.getIndexes()
```

### วิธีที่ 2: ให้ Backend สร้าง index ตอนเริ่มต้น (ทำอยู่แล้ว)
Mongoose เรียก `ensureIndexes()` ตอนเชื่อมต่อ (โดย default) ดังนั้นแค่ **restart backend บน EC2** หลัง deploy code ล่าสุด index จะถูกสร้าง/อัปเดตให้

---

## สรุปสั้นๆ
| สิ่งที่ทำ | EC2 (Backend) | Vercel (Frontend) |
|-----------|----------------|-------------------|
| สร้าง index ใน DB | ✅ ทำแล้วใน schema – **redeploy/restart backend** แล้ว index จะถูกสร้าง | ไม่ใช้ (ไม่มี DB) |
| ทำให้โหลดเร็วขึ้น | ✅ index ช่วยให้ query เร็ว → API ตอบเร็ว | ได้ผลทางอ้อมเมื่อ API เร็วขึ้น |

**ขั้นตอนที่แนะนำ:**  
1. แก้ schema เพิ่ม index (เช่น `isFeatured`) แล้ว push code  
2. บน EC2: pull code → build → restart backend  
3. หลัง restart แล้ว index จะถูกสร้างใน MongoDB อัตโนมัติ  

---

## ทำไงต่อ (หลังแก้ให้โหลดเร็วขึ้น)

1. **Deploy Backend บน EC2**
   - `git pull` แล้ว `npm run build` และ restart process (เช่น `pm2 restart all`)
   - MongoDB จะได้ index ใหม่และ query ใช้ `.lean()` / limit ตามที่แก้แล้ว

2. **Deploy Frontend บน Vercel**
   - push code ขึ้น repo แล้ว Vercel จะ build/deploy เอง
   - หน้าเว็บจะได้การโหลด campaigns+featured แบบ parallel

3. **ถ้ายังช้าอยู่**
   - ดูว่า API ไหนช้า: เปิด DevTools → Network → ดู request ที่ใช้เวลานาน
   - ตรวจสอบว่า Backend กับ MongoDB อยู่ region ใกล้กัน (ลด latency)
   - ถ้า Vercel อยู่คนละ region กับ EC2 อาจใช้ CDN หรือพิจารณา host frontend ใกล้ backend
