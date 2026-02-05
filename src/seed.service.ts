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

        // Create campaign
        const campaign = await this.campaignModel.create({
            uuid: uuidv4(),
            name: 'Bangkok Marathon 2026',
            shortName: 'BKK26',
            description: 'Annual Bangkok Marathon Event',
            eventDate: new Date('2026-03-15'),
            location: 'Sanam Luang, Bangkok',
            status: 'active',
            isDraft: false,
            rfidToken: uuidv4(),
            allowRFIDSync: true,
        });
        console.log('🏃 Created campaign: Bangkok Marathon 2026');

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
                campaignId: campaign._id,
                name: cp.name,
                type: cp.type,
                orderNum: cp.orderNum,
                active: true,
            }))
        );
        console.log('📍 Created 5 checkpoints');

        // Create events matching homepage display
        const events = await this.eventModel.insertMany([
            {
                uuid: 'doi-inthanon',
                campaignId: campaign._id,
                name: 'DOI INTHANON BY UTMB',
                description: 'Thailand\'s most challenging ultra-trail race at Doi Inthanon National Park',
                date: new Date('2025-12-06T10:00:00'),
                category: 'Trail Running',
                categories: ['100M', '100K', '50K', '20K', '10K'],
                distance: 175,
                timeLimit: 2880, // 48 hours
                status: 'live',
                location: 'อุทยานแห่งชาติดอยอินทนนท์, เชียงใหม่',
                bannerImage: 'https://images.unsplash.com/photo-1516214104703-d870798883c5?auto=format&fit=crop&w=600&q=80',
                checkpoints: ['START', '50K', '100K', 'FINISH'],
                shareToken: uuidv4(),
            },
            {
                uuid: 'tanaosri-trail',
                campaignId: campaign._id,
                name: 'TANAOSRI TRAIL (TNT)',
                description: 'Beautiful trail race through the forests of Ratchaburi',
                date: new Date('2025-12-10T04:00:00'),
                category: 'Trail Running',
                categories: ['100K', '50K', '30K', '15K', '5K'],
                distance: 102,
                timeLimit: 1920, // 32 hours
                status: 'upcoming',
                location: 'สวนพฤกษศาสตร์วรรณคดี, ราชบุรี',
                bannerImage: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=600&q=80',
                checkpoints: ['START', '30K', '50K', 'FINISH'],
                shareToken: uuidv4(),
            },
            {
                uuid: 'buriram-marathon',
                campaignId: campaign._id,
                name: 'BURIRAM MARATHON',
                description: 'Night marathon at Chang International Circuit',
                date: new Date('2026-01-25T18:30:00'),
                category: 'Road Running',
                categories: ['Full Marathon', 'Half Marathon', 'Mini Marathon', 'Fun Run'],
                distance: 42.195,
                timeLimit: 420, // 7 hours
                status: 'upcoming',
                location: 'สนามช้าง อินเตอร์เนชั่นแนล เซอร์กิต',
                bannerImage: 'https://images.unsplash.com/photo-1549488497-6d602330a3e6?q=80&w=600&auto=format&fit=crop',
                checkpoints: ['START', '10K', '21K', '30K', 'FINISH'],
                shareToken: uuidv4(),
            },
            {
                uuid: 'bangsaen-21',
                campaignId: campaign._id,
                name: 'BANGSAEN 21',
                description: 'Scenic half marathon along Bangsaen Beach',
                date: new Date('2025-12-16T03:30:00'),
                category: 'Road Running',
                categories: ['Half Marathon', 'Mini Marathon', 'Micro Marathon'],
                distance: 21.1,
                timeLimit: 240, // 4 hours
                status: 'finished',
                location: 'ชายหาดบางแสน, ชลบุรี',
                bannerImage: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=400&h=300&auto=format&fit=crop',
                checkpoints: ['START', '10K', 'FINISH'],
                shareToken: uuidv4(),
            },
        ]);
        console.log('🎽 Created 4 events: DOI INTHANON, TANAOSRI TRAIL, BURIRAM MARATHON, BANGSAEN 21');

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
