# Database Indexes & Performance Optimization

## สิ่งที่ปรับเพื่อให้โหลดเร็วขึ้น

### รอบที่ 1 (เดิม)
- **Campaign:** เพิ่ม index `isFeatured` และใช้ `.lean()` ใน findFeatured + findAll
- **Runners:** เพิ่ม `countByEvent()` ใช้ `countDocuments` แทนโหลด list ทั้งหมด, จำกัด `findByEvent()` สูงสุด 2000 รายการ
- **Events:** จำกัด `findAll` / `findByFilter` สูงสุด 500 รายการ
- **Checkpoints:** `findByCampaign` และ `findMappingsByEvent` ใช้ `.lean()`

### รอบที่ 2 (ล่าสุด – ปรับทั้งระบบ)

**เพิ่ม Index ใหม่:**
- **Runner:** `eventId+category+status+netTime` (ranking), `eventId+ageGroup` (age aggregation), `eventId+category+ageGroup+gender` (detailed ranking), `eventId+status+netTime` (finish-by-time), `createdAt` (findAll sort)
- **Event:** `status` (findByFilter), `campaignId+date` (findByCampaign sorted)
- **SyncLog:** `campaignId+status` (getSyncData count queries)

**แก้ N+1 Query (ปัญหาใหญ่สุด):**
- **`updateRankings`** – เปลี่ยนจาก loop `findByIdAndUpdate` ทีละคน → **`bulkWrite`** (1000 นักวิ่ง = 1 DB call แทน 1000+)
- **`checkpoints.updateMany`** – loop → **`bulkWrite`**
- **`checkpoints.updateMappings`** – loop → **`bulkWrite`**

**แก้ Memory Load:**
- **`getFinishByTime`** – เปลี่ยนจากโหลดนักวิ่งทั้งหมดเข้า memory → **MongoDB aggregation pipeline** (ประมวลผลใน DB)

**เพิ่ม `.lean()` ทุก read-only query:**
- `runners.findByEventWithPaging`, `findByBib`, `findByRfid`, `findByChipCode`, `getParticipantWithStationByEvent`, `getLatestParticipantByCheckpoint`
- `events.findByCampaign`, `findByUuid`, `findByShareToken`
- `timing.getRunnerRecords`, `getEventRecords`
- `sync.getSyncData` (logs query)

**Parallelize Sequential Queries:**
- **`sync.getSyncData`** – 4 sequential DB queries → **`Promise.all`** (4 ขนานพร้อมกัน)

หลัง deploy backend ใหม่ index จะถูกสร้าง/sync เอง

---

## สรุป Index ทั้งหมด

Mongoose สร้าง index ตามที่ประกาศใน schema ตอนที่ backend เริ่มทำงาน

### Campaigns (6 indexes)
| Index | ใช้สำหรับ |
|-------|------------|
| `uuid` (unique) | ค้นหาด้วย uuid |
| `eventDate` (-1) | เรียงรายการอีเวนต์ |
| `status` | กรองสถานะ |
| `isDraft, status` | กรอง campaign ที่เผยแพร่ |
| `isDraft, eventDate` | รายการที่เผยแพร่เรียงตามวัน |
| `isFeatured` | ดึง campaign ที่กดดาว (featured) |

### Events (6 indexes)
| Index | ใช้สำหรับ |
|-------|------------|
| `uuid` (unique) | ค้นหาด้วย uuid |
| `campaignId` | ดึง event ของ campaign |
| `date` (-1) | เรียงตามวัน |
| `shareToken` | public sharing |
| `status` | กรองสถานะ |
| `campaignId, date` | findByCampaign sorted |

### Checkpoints (2 indexes)
| Index | ใช้สำหรับ |
|-------|------------|
| `campaignId, orderNum` | ดึง checkpoint เรียงตามลำดับ |
| `uuid` (unique) | ค้นหาด้วย uuid |

### CheckpointMappings (2 indexes)
| Index | ใช้สำหรับ |
|-------|------------|
| `checkpointId, eventId` (unique) | ค้นหา mapping |
| `eventId, orderNum` | ดึง mapping ของ event |

### Runners (13 indexes)
| Index | ใช้สำหรับ |
|-------|------------|
| `eventId, bib` (unique) | ค้นหา BIB |
| `eventId, rfidTag` | ค้นหาด้วย RFID |
| `eventId, chipCode` | ค้นหาด้วย chip |
| `eventId, status` | กรองสถานะ |
| `eventId, category, netTime` | ผลการแข่งขัน |
| `eventId, gender, status` | กรองเพศ+สถานะ |
| `eventId, overallRank` | เรียงอันดับ |
| `eventId, category, gender, status` | กรองรวม |
| `eventId, latestCheckpoint` | ติดตาม checkpoint |
| `eventId, category, status, netTime` | ranking calculation |
| `eventId, ageGroup` | age group aggregation |
| `eventId, category, ageGroup, gender` | detailed ranking |
| `eventId, status, netTime` | finish-by-time aggregation |

### TimingRecords (5 indexes)
| Index | ใช้สำหรับ |
|-------|------------|
| `eventId, runnerId` | ค้นหา timing ของนักวิ่ง |
| `eventId, bib, checkpoint` | ค้นหาด้วย bib+checkpoint |
| `scanTime` (-1) | เรียงตามเวลา |
| `eventId, checkpoint, scanTime` | per-checkpoint queries |
| `runnerId, order` | runner timeline |

### SyncLogs (3 indexes)
| Index | ใช้สำหรับ |
|-------|------------|
| `campaignId, createdAt` (-1) | ดึง log ล่าสุด |
| `status` | กรองสถานะ |
| `campaignId, status` | count queries ใน getSyncData |

### Users (3 indexes)
| Index | ใช้สำหรับ |
|-------|------------|
| `email` (unique) | login |
| `uuid` (unique) | ค้นหาด้วย uuid |
| `username` | ค้นหาด้วย username |

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
