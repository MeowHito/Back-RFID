import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Campaign, CampaignDocument } from './campaigns/campaign.schema';
import { Event, EventDocument } from './events/event.schema';
import { Runner, RunnerDocument } from './runners/runner.schema';
import { Checkpoint, CheckpointDocument } from './checkpoints/checkpoint.schema';
import { User, UserDocument } from './users/user.schema';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SeedService implements OnModuleInit {
    constructor(
        @InjectModel(Campaign.name) private campaignModel: Model<CampaignDocument>,
        @InjectModel(Event.name) private eventModel: Model<EventDocument>,
        @InjectModel(Runner.name) private runnerModel: Model<RunnerDocument>,
        @InjectModel(Checkpoint.name) private checkpointModel: Model<CheckpointDocument>,
        @InjectModel(User.name) private userModel: Model<UserDocument>,
    ) { }

    async onModuleInit() {
        // Check if data already exists
        const campaignCount = await this.campaignModel.countDocuments();
        if (campaignCount > 0) {
            console.log('📦 Seed data already exists, skipping...');
            return;
        }

        console.log('🌱 Seeding database with sample data...');
        await this.seed();
        console.log('✅ Seed completed!');
    }

    async seed() {
        // Create admin user
        const hashedPassword = await bcrypt.hash('admin123', 10);
        const adminUser = await this.userModel.create({
            uuid: uuidv4(),
            email: 'admin@rfidtiming.com',
            username: 'admin',
            password: hashedPassword,
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
        });
        console.log('👤 Created admin user: admin@rfidtiming.com / admin123');

        // Create campaigns with categories
        const doiInthanon = await this.campaignModel.create({
            uuid: 'doi-inthanon',
            name: 'DOI INTHANON BY UTMB',
            shortName: 'DIBU',
            description: 'Thailand\'s most challenging ultra-trail race at Doi Inthanon National Park',
            eventDate: new Date('2025-12-06'),
            eventEndDate: new Date('2025-12-08'),
            location: 'ดอยอินทนนท์, เชียงใหม่',
            pictureUrl: 'https://images.unsplash.com/photo-1516214104703-d870798883c5?auto=format&fit=crop&w=600&q=80',
            status: 'live',
            isDraft: false,
            allowRFIDSync: true,
            rfidToken: uuidv4(),
            categories: [
                { name: '100M', distance: '175 KM', startTime: '10:00', cutoff: '48ชม.', elevation: '10,400 m+', badgeColor: '#e60000', status: 'live', itra: 6, utmbIndex: 'M' },
                { name: '100K', distance: '100 KM', startTime: '05:00', cutoff: '30ชม.', elevation: '6,100 m+', badgeColor: '#cc0000', status: 'wait', itra: 4, utmbIndex: 'K' },
                { name: '50K', distance: '50 KM', startTime: '06:00', cutoff: '14ชม.', elevation: '2,800 m+', badgeColor: '#f59e0b', status: 'wait', itra: 2, utmbIndex: '50K' },
                { name: '20K', distance: '20 KM', startTime: '07:00', cutoff: '7ชม.', elevation: '900 m+', badgeColor: '#10b981', status: 'wait', itra: 1, utmbIndex: '20K' },
                { name: '10K', distance: '10 KM', startTime: '08:00', cutoff: '4ชม.', elevation: '350 m+', badgeColor: '#3b82f6', status: 'wait' },
            ],
        });

        const tanaosriTrail = await this.campaignModel.create({
            uuid: 'tanaosri-trail',
            name: 'TANAOSRI TRAIL (TNT)',
            shortName: 'TNT',
            description: 'Beautiful trail race through the forests of Ratchaburi',
            eventDate: new Date('2025-12-10'),
            eventEndDate: new Date('2025-12-11'),
            location: 'สวนพฤกษศาสตร์วรรณคดี, ราชบุรี',
            pictureUrl: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=600&q=80',
            status: 'upcoming',
            isDraft: false,
            allowRFIDSync: true,
            rfidToken: uuidv4(),
            countdownDate: new Date('2025-12-10T03:00:00'),
            categories: [
                { name: '100K', distance: '102 KM', startTime: '03:00', cutoff: '32ชม.', elevation: '4,800 m+', badgeColor: '#4caf50', status: 'wait', itra: 4 },
                { name: '60K', distance: '60 KM', startTime: '04:00', cutoff: '18ชม.', elevation: '2,800 m+', badgeColor: '#f59e0b', status: 'wait', itra: 3 },
                { name: '30K', distance: '30 KM', startTime: '05:30', cutoff: '9ชม.', elevation: '1,400 m+', badgeColor: '#10b981', status: 'wait', itra: 1 },
                { name: '20K', distance: '20 KM', startTime: '07:00', cutoff: '7ชม.', elevation: '800 m+', badgeColor: '#3b82f6', status: 'wait' },
                { name: 'Fun', distance: '5 KM', startTime: '07:30', cutoff: '2ชม.', elevation: '150 m+', badgeColor: '#9c27b0', status: 'wait' },
            ],
        });

        const buriramMarathon = await this.campaignModel.create({
            uuid: 'buriram-marathon',
            name: 'BURIRAM MARATHON',
            shortName: 'BRM',
            description: 'Night marathon at Chang International Circuit',
            eventDate: new Date('2026-01-25'),
            location: 'สนามช้าง อินเตอร์เนชั่นแนล เซอร์กิต, บุรีรัมย์',
            pictureUrl: 'https://images.unsplash.com/photo-1549488497-6d602330a3e6?q=80&w=600&auto=format&fit=crop',
            status: 'upcoming',
            isDraft: false,
            allowRFIDSync: true,
            rfidToken: uuidv4(),
            countdownDate: new Date('2026-01-25T18:30:00'),
            categories: [
                { name: 'Full', distance: '42.195 KM', startTime: '18:30', cutoff: '7ชม.', raceType: 'Marathon', badgeColor: '#003366', status: 'wait' },
                { name: 'Half', distance: '21.1 KM', startTime: '20:00', cutoff: '4ชม.', raceType: 'Half Marathon', badgeColor: '#00bcd4', status: 'wait' },
                { name: 'Mini', distance: '10 KM', startTime: '20:30', cutoff: '2ชม.', raceType: 'Mini Marathon', badgeColor: '#4caf50', status: 'wait' },
                { name: 'Fun', distance: '4.5 KM', startTime: '20:45', cutoff: '1ชม.', raceType: 'Fun Run', badgeColor: '#ff9800', status: 'wait' },
            ],
        });

        const bangsaen21 = await this.campaignModel.create({
            uuid: 'bangsaen-21',
            name: 'BANGSAEN 21',
            shortName: 'BS21',
            description: 'Scenic half marathon along Bangsaen Beach',
            eventDate: new Date('2025-12-16'),
            location: 'ชายหาดบางแสน, ชลบุรี',
            pictureUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=400&h=300&auto=format&fit=crop',
            status: 'finished',
            isDraft: false,
            allowRFIDSync: true,
            rfidToken: uuidv4(),
            categories: [
                { name: 'Half', distance: '21.1 KM', startTime: '03:30', cutoff: '4ชม.', raceType: 'Half Marathon', badgeColor: '#00bcd4', status: 'finished' },
                { name: 'Mini', distance: '10 KM', startTime: '04:30', cutoff: '2.5ชม.', raceType: 'Mini Marathon', badgeColor: '#4caf50', status: 'finished' },
                { name: 'Micro', distance: '5 KM', startTime: '05:00', cutoff: '1.5ชม.', raceType: 'Micro Marathon', badgeColor: '#ff9800', status: 'finished' },
            ],
        });

        console.log('🏃 Created 4 campaigns: DOI INTHANON, TANAOSRI TRAIL, BURIRAM MARATHON, BANGSAEN 21');

        // Create checkpoints
        const checkpointNames = [
            { name: 'START', type: 'start', orderNum: 1 },
            { name: '10K', type: 'checkpoint', orderNum: 2 },
            { name: '21K', type: 'checkpoint', orderNum: 3 },
            { name: '30K', type: 'checkpoint', orderNum: 4 },
            { name: 'FINISH', type: 'finish', orderNum: 5 },
        ];

        const checkpoints = await this.checkpointModel.insertMany(
            checkpointNames.map(cp => ({
                uuid: uuidv4(),
                campaignId: doiInthanon._id,
                name: cp.name,
                type: cp.type,
                orderNum: cp.orderNum,
                active: true,
            }))
        );
        console.log('📍 Created 5 checkpoints');

        // Create events linked to campaigns (one simplified event per campaign for runners)
        const events = await this.eventModel.insertMany([
            {
                uuid: 'doi-inthanon-100m',
                campaignId: doiInthanon._id,
                name: 'DOI INTHANON BY UTMB - 100M',
                description: 'Thailand\'s most challenging ultra-trail race at Doi Inthanon National Park',
                date: new Date('2025-12-06T10:00:00'),
                category: '100M',
                categories: ['100M', '100K', '50K', '20K', '10K'],
                distance: 175,
                timeLimit: 2880,
                status: 'live',
                location: 'ดอยอินทนนท์, เชียงใหม่',
                bannerImage: 'https://images.unsplash.com/photo-1516214104703-d870798883c5?auto=format&fit=crop&w=600&q=80',
                checkpoints: ['START', '50K', '100K', 'FINISH'],
                shareToken: uuidv4(),
            },
            {
                uuid: 'tanaosri-100k',
                campaignId: tanaosriTrail._id,
                name: 'TANAOSRI TRAIL - 100K',
                description: 'Beautiful trail race through the forests of Ratchaburi',
                date: new Date('2025-12-10T04:00:00'),
                category: '100K',
                categories: ['100K', '60K', '30K', '20K', 'Fun'],
                distance: 102,
                timeLimit: 1920,
                status: 'upcoming',
                location: 'สวนพฤกษศาสตร์วรรณคดี, ราชบุรี',
                bannerImage: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=600&q=80',
                checkpoints: ['START', '30K', '50K', 'FINISH'],
                shareToken: uuidv4(),
            },
            {
                uuid: 'buriram-full',
                campaignId: buriramMarathon._id,
                name: 'BURIRAM MARATHON - Full',
                description: 'Night marathon at Chang International Circuit',
                date: new Date('2026-01-25T18:30:00'),
                category: 'Full Marathon',
                categories: ['Full', 'Half', 'Mini', 'Fun'],
                distance: 42.195,
                timeLimit: 420,
                status: 'upcoming',
                location: 'สนามช้าง อินเตอร์เนชั่นแนล เซอร์กิต, บุรีรัมย์',
                bannerImage: 'https://images.unsplash.com/photo-1549488497-6d602330a3e6?q=80&w=600&auto=format&fit=crop',
                checkpoints: ['START', '10K', '21K', '30K', 'FINISH'],
                shareToken: uuidv4(),
            },
            {
                uuid: 'bangsaen-half',
                campaignId: bangsaen21._id,
                name: 'BANGSAEN 21 - Half',
                description: 'Scenic half marathon along Bangsaen Beach',
                date: new Date('2025-12-16T03:30:00'),
                category: 'Half Marathon',
                categories: ['Half', 'Mini', 'Micro'],
                distance: 21.1,
                timeLimit: 240,
                status: 'finished',
                location: 'ชายหาดบางแสน, ชลบุรี',
                bannerImage: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=400&h=300&auto=format&fit=crop',
                checkpoints: ['START', '10K', 'FINISH'],
                shareToken: uuidv4(),
            },
        ]);
        console.log('🎽 Created 4 events linked to campaigns');

        // Create sample runners for 42K event
        const firstNames = ['Somchai', 'Somsri', 'Prasert', 'Malee', 'Wichai', 'Sombat', 'Narin', 'Jiraporn', 'Kittisak', 'Sumalee'];
        const lastNames = ['Jaidee', 'Sawasdee', 'Mongkol', 'Thongchai', 'Srisuk', 'Rungruang', 'Srisuwan', 'Kamolrat', 'Chaiyasit', 'Pattana'];
        const ageGroups = ['18-24', '25-29', '30-39', '40-49', '50-59', '60+'];

        const runners: any[] = [];
        for (let i = 1; i <= 20; i++) {
            runners.push({
                eventId: events[0]._id,
                bib: String(i).padStart(4, '0'),
                firstName: firstNames[i % firstNames.length],
                lastName: lastNames[i % lastNames.length],
                gender: i % 3 === 0 ? 'F' : 'M',
                category: '42K',
                ageGroup: ageGroups[i % ageGroups.length],
                rfidTag: `RFID${String(i).padStart(6, '0')}`,
                chipCode: `CHIP${String(i).padStart(6, '0')}`,
                status: 'not_started',
                allowRFIDSync: true,
            });
        }

        // Add runners for 21K
        for (let i = 21; i <= 30; i++) {
            runners.push({
                eventId: events[1]._id,
                bib: String(i).padStart(4, '0'),
                firstName: firstNames[i % firstNames.length],
                lastName: lastNames[i % lastNames.length],
                gender: i % 2 === 0 ? 'F' : 'M',
                category: '21K',
                ageGroup: ageGroups[i % ageGroups.length],
                rfidTag: `RFID${String(i).padStart(6, '0')}`,
                chipCode: `CHIP${String(i).padStart(6, '0')}`,
                status: 'not_started',
                allowRFIDSync: true,
            });
        }

        await this.runnerModel.insertMany(runners);
        console.log('👟 Created 30 sample runners');

        console.log('\n📊 Summary:');
        console.log('   - 1 Admin User (admin@rfidtiming.com / admin123)');
        console.log('   - 1 Campaign (Bangkok Marathon 2026)');
        console.log('   - 5 Checkpoints (START, 10K, 21K, 30K, FINISH)');
        console.log('   - 4 Events (DOI INTHANON, TANAOSRI, BURIRAM, BANGSAEN)');
        console.log('   - 30 Runners (20 for DOI INTHANON, 10 for TANAOSRI)');
    }
}
