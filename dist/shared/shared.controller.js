"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharedController = void 0;
const common_1 = require("@nestjs/common");
const events_service_1 = require("../events/events.service");
const runners_service_1 = require("../runners/runners.service");
const timing_service_1 = require("../timing/timing.service");
let SharedController = class SharedController {
    eventsService;
    runnersService;
    timingService;
    constructor(eventsService, runnersService, timingService) {
        this.eventsService = eventsService;
        this.runnersService = runnersService;
        this.timingService = timingService;
    }
    async getSharedResults(token, category, gender, ageGroup, box, status, search, checkpoint) {
        if (!token) {
            throw new common_1.NotFoundException('Token is required');
        }
        const event = await this.eventsService.findByShareToken(token);
        if (!event) {
            throw new common_1.NotFoundException('Event not found');
        }
        const runners = await this.runnersService.findByEvent({
            eventId: event._id.toString(),
            category,
            gender,
            ageGroup,
            box,
            status,
            search,
            checkpoint,
        });
        return {
            event: {
                id: event._id,
                name: event.name,
                date: event.date,
                status: event.status,
                categories: event.categories,
                checkpoints: event.checkpoints,
                startTime: event.startTime,
            },
            runners,
            totalRunners: runners.length,
        };
    }
    async getSharedRunnerDetails(token, runnerId) {
        if (!token || !runnerId) {
            throw new common_1.NotFoundException('Token and runnerId are required');
        }
        const event = await this.eventsService.findByShareToken(token);
        if (!event) {
            throw new common_1.NotFoundException('Event not found');
        }
        const runner = await this.runnersService.findOne(runnerId);
        const timingRecords = await this.timingService.getRunnerRecords(event._id.toString(), runnerId);
        return {
            runner,
            timingRecords,
        };
    }
};
exports.SharedController = SharedController;
__decorate([
    (0, common_1.Get)('results'),
    __param(0, (0, common_1.Query)('token')),
    __param(1, (0, common_1.Query)('category')),
    __param(2, (0, common_1.Query)('gender')),
    __param(3, (0, common_1.Query)('ageGroup')),
    __param(4, (0, common_1.Query)('box')),
    __param(5, (0, common_1.Query)('status')),
    __param(6, (0, common_1.Query)('search')),
    __param(7, (0, common_1.Query)('checkpoint')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], SharedController.prototype, "getSharedResults", null);
__decorate([
    (0, common_1.Get)('runner'),
    __param(0, (0, common_1.Query)('token')),
    __param(1, (0, common_1.Query)('runnerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], SharedController.prototype, "getSharedRunnerDetails", null);
exports.SharedController = SharedController = __decorate([
    (0, common_1.Controller)('shared'),
    __metadata("design:paramtypes", [events_service_1.EventsService,
        runners_service_1.RunnersService,
        timing_service_1.TimingService])
], SharedController);
//# sourceMappingURL=shared.controller.js.map