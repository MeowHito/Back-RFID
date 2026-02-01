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

        // Create events
        const events = await this.eventModel.insertMany([
            {
                uuid: uuidv4(),
                campaignId: campaign._id,
                name: 'Full Marathon 42K',
                date: new Date('2026-03-15T06:00:00'),
                category: '42K',
                categories: ['42K'],
                distance: 42.195,
                timeLimit: 420,
                status: 'upcoming',
                location: 'Sanam Luang, Bangkok',
                checkpoints: checkpointNames.map(cp => cp.name),
                shareToken: uuidv4(),
            },
            {
                uuid: uuidv4(),
                campaignId: campaign._id,
                name: 'Half Marathon 21K',
                date: new Date('2026-03-15T06:30:00'),
                category: '21K',
                categories: ['21K'],
                distance: 21.0975,
                timeLimit: 240,
                status: 'upcoming',
                location: 'Sanam Luang, Bangkok',
                checkpoints: ['START', '10K', 'FINISH'],
                shareToken: uuidv4(),
            },
            {
                uuid: uuidv4(),
                campaignId: campaign._id,
                name: 'Fun Run 5K',
                date: new Date('2026-03-15T07:00:00'),
                category: '5K',
                categories: ['5K'],
                distance: 5,
                timeLimit: 90,
                status: 'upcoming',
                location: 'Sanam Luang, Bangkok',
                checkpoints: ['START', 'FINISH'],
                shareToken: uuidv4(),
            },
        ]);
        console.log('🎽 Created 3 events: 42K, 21K, 5K');

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
        console.log('   - 3 Events (42K, 21K, 5K)');
        console.log('   - 30 Runners (20 for 42K, 10 for 21K)');
    }
}
