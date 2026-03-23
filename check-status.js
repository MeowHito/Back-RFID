require('dotenv').config();
const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  // Find NEWDASH1 campaign
  const campaigns = await mongoose.connection.db.collection('campaigns')
    .find({ name: /NEWDASH/i })
    .project({ _id: 1, name: 1, autoSync: 1 })
    .toArray();
  console.log('=== CAMPAIGNS ===');
  campaigns.forEach(c => console.log(`  ${c._id} name=${c.name} autoSync=${c.autoSync}`));
  // Find events for NEWDASH campaigns
  for (const camp of campaigns) {
    const events = await mongoose.connection.db.collection('events')
      .find({ campaignId: camp._id })
      .project({ _id: 1, name: 1, rfidEventId: 1 })
      .toArray();
    console.log(`\n=== EVENTS for ${camp.name} ===`);
    events.forEach(e => console.log(`  ${e._id} name=${e.name} rfidEid=${e.rfidEventId}`));
    for (const ev of events) {
      const runners = await mongoose.connection.db.collection('runners')
        .find({ eventId: ev._id })
        .project({ bib: 1, status: 1, firstName: 1, athleteId: 1 })
        .toArray();
      console.log(`  Runners (${runners.length}):`);
      runners.forEach(r => console.log(`    BIB=${r.bib} status=${r.status} athleteId=${r.athleteId} name=${r.firstName}`));
    }
  }
  process.exit(0);
})();
