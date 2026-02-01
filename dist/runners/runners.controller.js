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
exports.RunnersController = void 0;
const common_1 = require("@nestjs/common");
const runners_service_1 = require("./runners.service");
const create_runner_dto_1 = require("./dto/create-runner.dto");
let RunnersController = class RunnersController {
    runnersService;
    constructor(runnersService) {
        this.runnersService = runnersService;
    }
    create(createRunnerDto) {
        return this.runnersService.create(createRunnerDto);
    }
    createMany(runners) {
        return this.runnersService.createMany(runners);
    }
    findByEvent(filter) {
        return this.runnersService.findByEvent(filter);
    }
    findByEventWithPaging(eventId, category, gender, ageGroup, status, search, page, limit) {
        const filter = { eventId, category, gender, ageGroup, status, search };
        const paging = { page: page || 1, limit: limit || 50, search };
        return this.runnersService.findByEventWithPaging(filter, paging);
    }
    async getStatistics(eventId) {
        const [status, starters, withdrawals, finishTimes] = await Promise.all([
            this.runnersService.getAllStatusByEvent(eventId),
            this.runnersService.getStartersByAge(eventId),
            this.runnersService.getWithdrawalByAge(eventId),
            this.runnersService.getFinishByTime(eventId),
        ]);
        return { status, starters, withdrawals, finishTimes };
    }
    getAllStatusByEvent(eventId) {
        return this.runnersService.getAllStatusByEvent(eventId);
    }
    getStartersByAge(eventId) {
        return this.runnersService.getStartersByAge(eventId);
    }
    getFinishByTime(eventId) {
        return this.runnersService.getFinishByTime(eventId);
    }
    getLatestParticipantByCheckpoint(eventId, checkpoint, gender, ageGroup) {
        return this.runnersService.getLatestParticipantByCheckpoint(eventId, checkpoint, gender, ageGroup);
    }
    findOne(id) {
        return this.runnersService.findOne(id);
    }
    findByBib(eventId, bib) {
        return this.runnersService.findByBib(eventId, bib);
    }
    findByChipCode(eventId, chipCode) {
        return this.runnersService.findByChipCode(eventId, chipCode);
    }
    update(id, updateData) {
        return this.runnersService.update(id, updateData);
    }
    updateStatus(id, status) {
        return this.runnersService.updateStatus(id, status);
    }
    delete(id) {
        return this.runnersService.delete(id);
    }
    deleteByEvent(eventId) {
        return this.runnersService.deleteByEvent(eventId);
    }
};
exports.RunnersController = RunnersController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_runner_dto_1.CreateRunnerDto]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('bulk'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "createMany", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "findByEvent", null);
__decorate([
    (0, common_1.Get)('paged'),
    __param(0, (0, common_1.Query)('eventId')),
    __param(1, (0, common_1.Query)('category')),
    __param(2, (0, common_1.Query)('gender')),
    __param(3, (0, common_1.Query)('ageGroup')),
    __param(4, (0, common_1.Query)('status')),
    __param(5, (0, common_1.Query)('search')),
    __param(6, (0, common_1.Query)('page')),
    __param(7, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, Number, Number]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "findByEventWithPaging", null);
__decorate([
    (0, common_1.Get)('statistics/:eventId'),
    __param(0, (0, common_1.Param)('eventId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RunnersController.prototype, "getStatistics", null);
__decorate([
    (0, common_1.Get)('status/:eventId'),
    __param(0, (0, common_1.Param)('eventId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "getAllStatusByEvent", null);
__decorate([
    (0, common_1.Get)('starters-by-age/:eventId'),
    __param(0, (0, common_1.Param)('eventId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "getStartersByAge", null);
__decorate([
    (0, common_1.Get)('finish-by-time/:eventId'),
    __param(0, (0, common_1.Param)('eventId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "getFinishByTime", null);
__decorate([
    (0, common_1.Get)('by-checkpoint/:eventId/:checkpoint'),
    __param(0, (0, common_1.Param)('eventId')),
    __param(1, (0, common_1.Param)('checkpoint')),
    __param(2, (0, common_1.Query)('gender')),
    __param(3, (0, common_1.Query)('ageGroup')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "getLatestParticipantByCheckpoint", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)('bib/:eventId/:bib'),
    __param(0, (0, common_1.Param)('eventId')),
    __param(1, (0, common_1.Param)('bib')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "findByBib", null);
__decorate([
    (0, common_1.Get)('chip/:eventId/:chipCode'),
    __param(0, (0, common_1.Param)('eventId')),
    __param(1, (0, common_1.Param)('chipCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "findByChipCode", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "update", null);
__decorate([
    (0, common_1.Put)(':id/status'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "delete", null);
__decorate([
    (0, common_1.Delete)('event/:eventId'),
    __param(0, (0, common_1.Param)('eventId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RunnersController.prototype, "deleteByEvent", null);
exports.RunnersController = RunnersController = __decorate([
    (0, common_1.Controller)('runners'),
    __metadata("design:paramtypes", [runners_service_1.RunnersService])
], RunnersController);
//# sourceMappingURL=runners.controller.js.map