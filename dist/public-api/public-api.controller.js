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
exports.PublicApiController = void 0;
const common_1 = require("@nestjs/common");
const users_service_1 = require("../users/users.service");
const auth_service_1 = require("../auth/auth.service");
const campaigns_service_1 = require("../campaigns/campaigns.service");
const runners_service_1 = require("../runners/runners.service");
const checkpoints_service_1 = require("../checkpoints/checkpoints.service");
const timing_service_1 = require("../timing/timing.service");
const user_dto_1 = require("../users/dto/user.dto");
let PublicApiController = class PublicApiController {
    usersService;
    authService;
    campaignsService;
    runnersService;
    checkpointsService;
    timingService;
    constructor(usersService, authService, campaignsService, runnersService, checkpointsService, timingService) {
        this.usersService = usersService;
        this.authService = authService;
        this.campaignsService = campaignsService;
        this.runnersService = runnersService;
        this.checkpointsService = checkpointsService;
        this.timingService = timingService;
    }
    successResponse(data) {
        return {
            status: { code: '200', description: 'success' },
            data,
        };
    }
    errorResponse(code, description) {
        return {
            status: { code, description },
        };
    }
    async register(body) {
        try {
            const existingUser = await this.usersService.findByEmail(body.email);
            if (existingUser) {
                return this.errorResponse('10005', 'Email already exists in the system');
            }
            await this.usersService.create(body);
            return this.successResponse();
        }
        catch (error) {
            return this.errorResponse('500', error.message);
        }
    }
    async loginStation(headers, body) {
        try {
            const result = await this.authService.loginStation(body);
            return this.successResponse(result);
        }
        catch (error) {
            return this.errorResponse('401', 'Invalid credentials');
        }
    }
    async checkUserEmail(body) {
        const user = await this.usersService.findByEmail(body.email);
        if (user) {
            const token = await this.usersService.createResetToken(body.email);
            return this.successResponse({ tokenCreated: !!token });
        }
        return this.successResponse(null);
    }
    async getUserToken(id) {
        const isValid = await this.usersService.validateResetToken(id);
        return this.successResponse(isValid);
    }
    async updateUserToken(body) {
        try {
            await this.usersService.resetPasswordByToken(body.uuid, body.npw);
            return this.successResponse();
        }
        catch (error) {
            return this.errorResponse('400', error.message);
        }
    }
    async updatePassword(body) {
        try {
            await this.usersService.updatePassword(body);
            return this.successResponse();
        }
        catch (error) {
            return this.errorResponse('400', error.message);
        }
    }
    async getCampaignByDate(type, user, role, pagingJson) {
        let paging;
        if (pagingJson) {
            try {
                paging = JSON.parse(pagingJson);
            }
            catch {
            }
        }
        const data = await this.campaignsService.findByDate({ type, user, role }, paging);
        return this.successResponse(data);
    }
    async getCampaignById(id) {
        try {
            const data = await this.campaignsService.findById(id);
            return this.successResponse(data);
        }
        catch (error) {
            return this.errorResponse('404', 'Campaign not found');
        }
    }
    async getCampaignDetailById(id) {
        try {
            const data = await this.campaignsService.getDetailById(id);
            return this.successResponse(data);
        }
        catch (error) {
            return this.errorResponse('404', 'Campaign not found');
        }
    }
    async getCheckpointById(id) {
        const data = await this.checkpointsService.findByCampaign(id);
        return this.successResponse(data);
    }
    async getAllParticipantByEvent(id, pagingJson, eventName, gender, ageGroup, favorites, type) {
        const filter = {
            eventId: id,
            gender,
            ageGroup,
        };
        const data = await this.runnersService.findByEvent(filter);
        return this.successResponse({ data, total: data.length });
    }
    async getAllStatusByEvent(id) {
        const runners = await this.runnersService.findByEvent({ eventId: id });
        const statusCounts = {};
        runners.forEach(runner => {
            statusCounts[runner.status] = (statusCounts[runner.status] || 0) + 1;
        });
        const data = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));
        return this.successResponse(data);
    }
    async getStartersByAge(id) {
        const runners = await this.runnersService.findByEvent({
            eventId: id,
            status: 'in_progress'
        });
        const ageGroups = {};
        runners.forEach(runner => {
            const ag = runner.ageGroup || 'Unknown';
            ageGroups[ag] = (ageGroups[ag] || 0) + 1;
        });
        const data = Object.entries(ageGroups).map(([ageGroup, count]) => ({ ageGroup, count }));
        return this.successResponse(data);
    }
    async getFinishByTime(id) {
        const runners = await this.runnersService.findByEvent({
            eventId: id,
            status: 'finished'
        });
        const timeGroups = {};
        runners.forEach(runner => {
            if (runner.netTime) {
                const hours = Math.floor(runner.netTime / 3600000);
                const key = `${hours}h-${hours + 1}h`;
                timeGroups[key] = (timeGroups[key] || 0) + 1;
            }
        });
        const data = Object.entries(timeGroups).map(([timeRange, count]) => ({ timeRange, count }));
        return this.successResponse(data);
    }
    async getParticipantByChipCode(id, chipCode, bibNo) {
        let runner;
        if (bibNo) {
            runner = await this.runnersService.findByBib(id, bibNo);
        }
        else if (chipCode) {
            runner = await this.runnersService.findByRfid(id, chipCode);
        }
        return this.successResponse(runner ? [runner] : []);
    }
    async getLatestParticipantByCheckpoint(id, eventUuid, pagingJson, checkpointName, gender, ageGroup) {
        const filter = {
            eventId: id,
            checkpoint: checkpointName,
            gender,
            ageGroup,
        };
        const data = await this.runnersService.findByEvent(filter);
        return this.successResponse({ data, total: data.length });
    }
    async createRaceTimestampWithQRCode(headers, body) {
        try {
            const scanData = {
                eventId: body.campaignUuid,
                bib: body.bibNo,
                checkpoint: body.checkpoint,
                scanTime: new Date(body.scanTime),
            };
            await this.timingService.processScan(scanData);
            return this.successResponse();
        }
        catch (error) {
            return this.errorResponse('400', error.message);
        }
    }
    async getRaceTimestampByStation(id, campaignUuid, pagingJson) {
        const data = await this.timingService.getEventRecords(campaignUuid);
        return this.successResponse({ data, total: data.length });
    }
    async getParticipantByCampaign(id, campaignUuid) {
        return this.successResponse([]);
    }
};
exports.PublicApiController = PublicApiController;
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_dto_1.CreateUserDto]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('loginStation'),
    __param(0, (0, common_1.Headers)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, user_dto_1.LoginStationDto]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "loginStation", null);
__decorate([
    (0, common_1.Post)('checkUserEmail'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "checkUserEmail", null);
__decorate([
    (0, common_1.Get)('getUserToken'),
    __param(0, (0, common_1.Query)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "getUserToken", null);
__decorate([
    (0, common_1.Post)('updateUserToken'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "updateUserToken", null);
__decorate([
    (0, common_1.Post)('user/updatePassword'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_dto_1.UpdatePasswordDto]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "updatePassword", null);
__decorate([
    (0, common_1.Get)('campaign/getCampaignByDate'),
    __param(0, (0, common_1.Query)('type')),
    __param(1, (0, common_1.Query)('user')),
    __param(2, (0, common_1.Query)('role')),
    __param(3, (0, common_1.Query)('paging')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "getCampaignByDate", null);
__decorate([
    (0, common_1.Get)('campaign/getCampaignById'),
    __param(0, (0, common_1.Query)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "getCampaignById", null);
__decorate([
    (0, common_1.Get)('campaign/getCampaignDetailById'),
    __param(0, (0, common_1.Query)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "getCampaignDetailById", null);
__decorate([
    (0, common_1.Get)('campaign/getCheckpointById'),
    __param(0, (0, common_1.Query)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "getCheckpointById", null);
__decorate([
    (0, common_1.Get)('campaign/getAllParticipantByEvent'),
    __param(0, (0, common_1.Query)('id')),
    __param(1, (0, common_1.Query)('paging')),
    __param(2, (0, common_1.Query)('eventName')),
    __param(3, (0, common_1.Query)('gender')),
    __param(4, (0, common_1.Query)('ageGroup')),
    __param(5, (0, common_1.Query)('favorites')),
    __param(6, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "getAllParticipantByEvent", null);
__decorate([
    (0, common_1.Get)('campaign/getAllStatusByEvent'),
    __param(0, (0, common_1.Query)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "getAllStatusByEvent", null);
__decorate([
    (0, common_1.Get)('campaign/getStartersByAge'),
    __param(0, (0, common_1.Query)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "getStartersByAge", null);
__decorate([
    (0, common_1.Get)('campaign/getFinishByTime'),
    __param(0, (0, common_1.Query)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "getFinishByTime", null);
__decorate([
    (0, common_1.Get)('campaign/getParticipantByChipCode'),
    __param(0, (0, common_1.Query)('id')),
    __param(1, (0, common_1.Query)('chipCode')),
    __param(2, (0, common_1.Query)('bibNo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "getParticipantByChipCode", null);
__decorate([
    (0, common_1.Get)('campaign/getLatestParticipantByCheckpoint'),
    __param(0, (0, common_1.Query)('id')),
    __param(1, (0, common_1.Query)('eventUuid')),
    __param(2, (0, common_1.Query)('paging')),
    __param(3, (0, common_1.Query)('checkpointName')),
    __param(4, (0, common_1.Query)('gender')),
    __param(5, (0, common_1.Query)('ageGroup')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "getLatestParticipantByCheckpoint", null);
__decorate([
    (0, common_1.Post)('raceTimestamp/createRaceTimestampWithQRCode'),
    __param(0, (0, common_1.Headers)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "createRaceTimestampWithQRCode", null);
__decorate([
    (0, common_1.Get)('raceTimestamp/getRaceTimestampByStation'),
    __param(0, (0, common_1.Query)('id')),
    __param(1, (0, common_1.Query)('campaignUuid')),
    __param(2, (0, common_1.Query)('paging')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "getRaceTimestampByStation", null);
__decorate([
    (0, common_1.Get)('raceTimestamp/getParticipantBycampaign'),
    __param(0, (0, common_1.Query)('id')),
    __param(1, (0, common_1.Query)('campaignUuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PublicApiController.prototype, "getParticipantByCampaign", null);
exports.PublicApiController = PublicApiController = __decorate([
    (0, common_1.Controller)('public-api'),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        auth_service_1.AuthService,
        campaigns_service_1.CampaignsService,
        runners_service_1.RunnersService,
        checkpoints_service_1.CheckpointsService,
        timing_service_1.TimingService])
], PublicApiController);
//# sourceMappingURL=public-api.controller.js.map