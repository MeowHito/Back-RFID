// Run this script to seed demo data: npx ts-node src/seed.ts
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid-timing';

// Schemas
const EventSchema = new mongoose.Schema({
    name: String,
    description: String,
    date: Date,
    categories: [String],
    status: { type: String, default: 'upcoming' },
    location: String,
    checkpoints: [String],
    startTime: Date,
    shareToken: String,
}, { timestamps: true });

const RunnerSchema = new mongoose.Schema({
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    bib: String,
    firstName: String,
    lastName: String,
    firstNameTh: String,
    lastNameTh: String,
    gender: String,
    ageGroup: String,
    age: Number,
    box: String,
    team: String,
    category: String,
    status: { type: String, default: 'not_started' },
    rfidTag: String,
    startTime: Date,
    finishTime: Date,
    netTime: Number,
    elapsedTime: Number,
    overallRank: { type: Number, default: 0 },
    genderRank: { type: Number, default: 0 },
    ageGroupRank: { type: Number, default: 0 },
    latestCheckpoint: String,
}, { timestamps: true });

const TimingRecordSchema = new mongoose.Schema({
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    runnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Runner' },
    bib: String,
    checkpoint: String,
    scanTime: Date,
    order: Number,
    splitTime: Number,
    elapsedTime: Number,
    note: String,
}, { timestamps: true });

const Event = mongoose.model('Event', EventSchema);
const Runner = mongoose.model('Runner', RunnerSchema);
const TimingRecord = mongoose.model('TimingRecord', TimingRecordSchema);

// Sample Thai names
const thaiFirstNames = ['สมชาย', 'สมหญิง', 'วิชัย', 'วิภา', 'สุรชัย', 'สุภาพร', 'ประยุทธ์', 'พิมพา', 'อนุชา', 'นภา'];
const thaiLastNames = ['ใจดี', 'รักเรียน', 'มีสุข', 'สมบูรณ์', 'วงศ์สุข', 'เจริญศรี', 'ภูมิพัฒน์', 'ศรีสุข', 'ชัยมงคล', 'วิไลวรรณ'];
const englishFirstNames = ['Somchai', 'Somying', 'Wichai', 'Wipa', 'Surachai', 'Supaporn', 'Prayut', 'Pimpa', 'Anucha', 'Napa'];
const englishLastNames = ['Jaidee', 'Rakrien', 'Mesuk', 'Somboon', 'Wongsuk', 'Charoensri', 'Pumipat', 'Srisuk', 'Chaimongkon', 'Wilaiwan'];
const teams = ['BKK Runners', 'Chiang Mai Club', 'Phuket Running', 'None', 'Speed Team', 'Marathon Pro'];

async function seed() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Clear existing data
        await Event.deleteMany({});
        await Runner.deleteMany({});
        await TimingRecord.deleteMany({});
        console.log('Cleared existing data');

        // Create demo event
        const event = await Event.create({
            name: 'PuPaYaPoh: The Last Call',
            description: 'Annual running event in beautiful mountain trails',
            date: new Date(),
            categories: ['HuaiNamRee 160K', '21K', '10K', '5K'],
            status: 'live',
            location: 'Chiang Mai, Thailand',
            checkpoints: ['START', 'CP1', 'CP2', 'CP3', 'FINISH'],
            startTime: new Date(Date.now() - 5 * 60 * 60 * 1000), // Started 5 hours ago
            shareToken: 'demo', // Use 'demo' for easy testing
        });
        console.log(`Created event: ${event.name}`);

        // Create runners
        const runners: any[] = [];
        const statuses = ['finished', 'finished', 'finished', 'in_progress', 'in_progress', 'not_started', 'dnf'];

        for (let i = 0; i < 20; i++) {
            const isMale = Math.random() > 0.5;
            const nameIndex = Math.floor(Math.random() * 10);
            const lastNameIndex = Math.floor(Math.random() * 10);
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            const category = event.categories[Math.floor(Math.random() * event.categories.length)];
            const age = 20 + Math.floor(Math.random() * 40);
            const ageGroup = age < 30 ? '18-29' : age < 40 ? '30-39' : age < 50 ? '40-49' : age < 60 ? '50-59' : '60+';

            const startTime = new Date(event.startTime!.getTime() + Math.random() * 10000);
            let finishTime: Date | undefined;
            let netTime: number | undefined;
            let elapsedTime: number | undefined;
            let latestCheckpoint = 'START';

            if (status === 'finished') {
                const raceTime = (2 + Math.random() * 8) * 60 * 60 * 1000; // 2-10 hours
                finishTime = new Date(startTime.getTime() + raceTime);
                netTime = raceTime;
                elapsedTime = Date.now() - startTime.getTime();
                latestCheckpoint = 'FINISH';
            } else if (status === 'in_progress') {
                elapsedTime = Date.now() - startTime.getTime();
                latestCheckpoint = ['CP1', 'CP2', 'CP3'][Math.floor(Math.random() * 3)];
            } else if (status === 'dnf') {
                latestCheckpoint = ['CP1', 'CP2'][Math.floor(Math.random() * 2)];
            }

            const runner = await Runner.create({
                eventId: event._id,
                bib: (900 + i).toString(),
                firstName: englishFirstNames[nameIndex],
                lastName: englishLastNames[lastNameIndex],
                firstNameTh: thaiFirstNames[nameIndex],
                lastNameTh: thaiLastNames[lastNameIndex],
                gender: isMale ? 'M' : 'F',
                ageGroup,
                age,
                box: 'A',
                team: teams[Math.floor(Math.random() * teams.length)],
                category,
                status,
                rfidTag: uuidv4(),
                startTime,
                finishTime,
                netTime,
                elapsedTime,
                latestCheckpoint,
            });
            runners.push(runner);
        }

        // Update rankings for finished runners
        const finishedRunners = runners
            .filter(r => r.status === 'finished')
            .sort((a, b) => (a.netTime || 0) - (b.netTime || 0));

        for (let i = 0; i < finishedRunners.length; i++) {
            await Runner.findByIdAndUpdate(finishedRunners[i]._id, {
                overallRank: i + 1,
                genderRank: i + 1,
                ageGroupRank: Math.ceil((i + 1) / 2),
            });
        }

        console.log(`Created ${runners.length} runners`);

        // Create timing records for each runner
        for (const runner of runners) {
            const checkpoints = event.checkpoints;
            let lastTime = runner.startTime;
            let order = 1;

            for (const checkpoint of checkpoints) {
                if (checkpoint === 'START') {
                    await TimingRecord.create({
                        eventId: event._id,
                        runnerId: runner._id,
                        bib: runner.bib,
                        checkpoint,
                        scanTime: runner.startTime,
                        order: order++,
                        splitTime: 0,
                        elapsedTime: 0,
                        note: 'Check-in',
                    });
                } else if (runner.status === 'finished' ||
                    (runner.status === 'in_progress' && checkpoint !== 'FINISH') ||
                    (runner.status === 'dnf' && ['CP1', 'CP2'].includes(checkpoint))) {

                    if (checkpoint === runner.latestCheckpoint ||
                        (runner.status === 'finished' && checkpoint !== 'FINISH')) {
                        const splitTime = (30 + Math.random() * 60) * 60 * 1000;
                        const scanTime = new Date(lastTime.getTime() + splitTime);

                        await TimingRecord.create({
                            eventId: event._id,
                            runnerId: runner._id,
                            bib: runner.bib,
                            checkpoint,
                            scanTime,
                            order: order++,
                            splitTime,
                            elapsedTime: scanTime.getTime() - runner.startTime.getTime(),
                        });

                        lastTime = scanTime;
                    }

                    if (checkpoint === runner.latestCheckpoint && runner.status !== 'finished') {
                        break;
                    }
                }

                if (checkpoint === 'FINISH' && runner.status === 'finished') {
                    await TimingRecord.create({
                        eventId: event._id,
                        runnerId: runner._id,
                        bib: runner.bib,
                        checkpoint: 'FINISH',
                        scanTime: runner.finishTime,
                        order: order++,
                        splitTime: runner.finishTime!.getTime() - lastTime.getTime(),
                        elapsedTime: runner.netTime,
                    });
                }
            }
        }

        console.log('Created timing records');
        console.log('\n✅ Seed completed! Visit http://localhost:3000/shared/results?token=demo');

        await mongoose.disconnect();
    } catch (error) {
        console.error('Seed failed:', error);
        process.exit(1);
    }
}

seed();
