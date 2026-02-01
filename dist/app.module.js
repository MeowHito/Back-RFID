"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const events_module_1 = require("./events/events.module");
const runners_module_1 = require("./runners/runners.module");
const timing_module_1 = require("./timing/timing.module");
const shared_module_1 = require("./shared/shared.module");
const campaigns_module_1 = require("./campaigns/campaigns.module");
const checkpoints_module_1 = require("./checkpoints/checkpoints.module");
const users_module_1 = require("./users/users.module");
const auth_module_1 = require("./auth/auth.module");
const public_api_module_1 = require("./public-api/public-api.module");
const sync_module_1 = require("./sync/sync.module");
const seed_service_1 = require("./seed.service");
const campaign_schema_1 = require("./campaigns/campaign.schema");
const event_schema_1 = require("./events/event.schema");
const runner_schema_1 = require("./runners/runner.schema");
const checkpoint_schema_1 = require("./checkpoints/checkpoint.schema");
const user_schema_1 = require("./users/user.schema");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
            }),
            mongoose_1.MongooseModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: async (configService) => ({
                    uri: configService.get('MONGODB_URI') || 'mongodb://localhost:27017/rfid-timing',
                }),
                inject: [config_1.ConfigService],
            }),
            mongoose_1.MongooseModule.forFeature([
                { name: campaign_schema_1.Campaign.name, schema: campaign_schema_1.CampaignSchema },
                { name: event_schema_1.Event.name, schema: event_schema_1.EventSchema },
                { name: runner_schema_1.Runner.name, schema: runner_schema_1.RunnerSchema },
                { name: checkpoint_schema_1.Checkpoint.name, schema: checkpoint_schema_1.CheckpointSchema },
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
            ]),
            events_module_1.EventsModule,
            runners_module_1.RunnersModule,
            timing_module_1.TimingModule,
            shared_module_1.SharedModule,
            campaigns_module_1.CampaignsModule,
            checkpoints_module_1.CheckpointsModule,
            users_module_1.UsersModule,
            auth_module_1.AuthModule,
            public_api_module_1.PublicApiModule,
            sync_module_1.SyncModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService, seed_service_1.SeedService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map