"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeedService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const campaign_schema_1 = require("./campaigns/campaign.schema");
const event_schema_1 = require("./events/event.schema");
const runner_schema_1 = require("./runners/runner.schema");
const checkpoint_schema_1 = require("./checkpoints/checkpoint.schema");
const user_schema_1 = require("./users/user.schema");
const uuid_1 = require("uuid");
const bcrypt = __importStar(require("bcrypt"));
let SeedService = class SeedService {
    campaignModel;
    eventModel;
    runnerModel;
    checkpointModel;
    userModel;
    constructor(campaignModel, eventModel, runnerModel, checkpointModel, userModel) {
        this.campaignModel = campaignModel;
        this.eventModel = eventModel;
        this.runnerModel = runnerModel;
        this.checkpointModel = checkpointModel;
        this.userModel = userModel;
    }
    async onModuleInit() {
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
        const hashedPassword = await bcrypt.hash('admin123', 10);
        const adminUser = await this.userModel.create({
            uuid: (0, uuid_1.v4)(),
            email: 'admin@rfidtiming.com',
            username: 'admin',
            password: hashedPassword,
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin',
        });
        console.log('👤 Created admin user: admin@rfidtiming.com / admin123');
        const campaign = await this.campaignModel.create({
            uuid: (0, uuid_1.v4)(),
            name: 'Bangkok Marathon 2026',
            shortName: 'BKK26',
            description: 'Annual Bangkok Marathon Event',
            eventDate: new Date('2026-03-15'),
            location: 'Sanam Luang, Bangkok',
            status: 'active',
            isDraft: false,
            rfidToken: (0, uuid_1.v4)(),
            allowRFIDSync: true,
        });
        console.log('🏃 Created campaign: Bangkok Marathon 2026');
        const checkpointNames = [
            { name: 'START', type: 'start', orderNum: 1 },
            { name: '10K', type: 'checkpoint', orderNum: 2 },
            { name: '21K', type: 'checkpoint', orderNum: 3 },
            { name: '30K', type: 'checkpoint', orderNum: 4 },
            { name: 'FINISH', type: 'finish', orderNum: 5 },
        ];
        const checkpoints = await this.checkpointModel.insertMany(checkpointNames.map(cp => ({
            uuid: (0, uuid_1.v4)(),
            campaignId: campaign._id,
            name: cp.name,
            type: cp.type,
            orderNum: cp.orderNum,
            active: true,
        })));
        console.log('📍 Created 5 checkpoints');
        const events = await this.eventModel.insertMany([
            {
                uuid: (0, uuid_1.v4)(),
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
                shareToken: (0, uuid_1.v4)(),
            },
            {
                uuid: (0, uuid_1.v4)(),
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
                shareToken: (0, uuid_1.v4)(),
            },
            {
                uuid: (0, uuid_1.v4)(),
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
                shareToken: (0, uuid_1.v4)(),
            },
        ]);
        console.log('🎽 Created 3 events: 42K, 21K, 5K');
        const firstNames = ['Somchai', 'Somsri', 'Prasert', 'Malee', 'Wichai', 'Sombat', 'Narin', 'Jiraporn', 'Kittisak', 'Sumalee'];
        const lastNames = ['Jaidee', 'Sawasdee', 'Mongkol', 'Thongchai', 'Srisuk', 'Rungruang', 'Srisuwan', 'Kamolrat', 'Chaiyasit', 'Pattana'];
        const ageGroups = ['18-24', '25-29', '30-39', '40-49', '50-59', '60+'];
        const runners = [];
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
};
exports.SeedService = SeedService;
exports.SeedService = SeedService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(campaign_schema_1.Campaign.name)),
    __param(1, (0, mongoose_1.InjectModel)(event_schema_1.Event.name)),
    __param(2, (0, mongoose_1.InjectModel)(runner_schema_1.Runner.name)),
    __param(3, (0, mongoose_1.InjectModel)(checkpoint_schema_1.Checkpoint.name)),
    __param(4, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], SeedService);
//# sourceMappingURL=seed.service.js.map