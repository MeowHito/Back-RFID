// MongoDB Index Optimization Script
// Run this directly in MongoDB Shell (mongosh) to create/ensure all performance indexes
// Usage: mongosh "mongodb://localhost:27017/your-db-name" create-indexes.js

// ==========================================
// RUNNERS COLLECTION - Critical for live/results pages
// ==========================================
db.runners.createIndex({ eventId: 1, bib: 1 }, { unique: true, background: true });
db.runners.createIndex({ eventId: 1, status: 1, netTime: 1 }, { background: true });
db.runners.createIndex({ eventId: 1, category: 1, status: 1, netTime: 1 }, { background: true });
db.runners.createIndex({ eventId: 1, overallRank: 1, bib: 1 }, { background: true });
db.runners.createIndex({ eventId: 1, category: 1, gender: 1, status: 1 }, { background: true });
db.runners.createIndex({ eventId: 1, gender: 1, status: 1 }, { background: true });
db.runners.createIndex({ eventId: 1, ageGroup: 1 }, { background: true });
db.runners.createIndex({ eventId: 1, category: 1, ageGroup: 1, gender: 1 }, { background: true });
db.runners.createIndex({ eventId: 1, rfidTag: 1 }, { background: true });
db.runners.createIndex({ eventId: 1, chipCode: 1 }, { background: true });
db.runners.createIndex({ eventId: 1, latestCheckpoint: 1 }, { background: true });
db.runners.createIndex({ createdAt: -1 }, { background: true });

// ==========================================
// TIMING RECORDS COLLECTION - Critical for passtime/live view
// ==========================================
db.timingrecords.createIndex({ eventId: 1, runnerId: 1 }, { background: true });
db.timingrecords.createIndex({ eventId: 1, scanTime: -1, runnerId: 1 }, { background: true });
db.timingrecords.createIndex({ eventId: 1, bib: 1, checkpoint: 1 }, { background: true });
db.timingrecords.createIndex({ eventId: 1, checkpoint: 1, scanTime: -1 }, { background: true });
db.timingrecords.createIndex({ runnerId: 1, order: 1 }, { background: true });

// ==========================================
// EVENTS COLLECTION
// ==========================================
db.events.createIndex({ campaignId: 1 }, { background: true });
db.events.createIndex({ campaignId: 1, date: 1 }, { background: true });

// ==========================================
// CAMPAIGNS COLLECTION
// ==========================================
db.campaigns.createIndex({ isDraft: 1, eventDate: -1 }, { background: true });
db.campaigns.createIndex({ isDraft: 1, status: 1 }, { background: true });
db.campaigns.createIndex({ slug: 1 }, { background: true });

print("✅ All indexes created/verified successfully!");
