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
exports.TimingController = void 0;
const common_1 = require("@nestjs/common");
const timing_service_1 = require("./timing.service");
let TimingController = class TimingController {
    timingService;
    constructor(timingService) {
        this.timingService = timingService;
    }
    processScan(scanData) {
        return this.timingService.processScan(scanData);
    }
    getRunnerRecords(eventId, runnerId) {
        return this.timingService.getRunnerRecords(eventId, runnerId);
    }
    getEventRecords(eventId) {
        return this.timingService.getEventRecords(eventId);
    }
    deleteRecord(id) {
        return this.timingService.deleteRecord(id);
    }
};
exports.TimingController = TimingController;
__decorate([
    (0, common_1.Post)('scan'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TimingController.prototype, "processScan", null);
__decorate([
    (0, common_1.Get)('runner/:eventId/:runnerId'),
    __param(0, (0, common_1.Param)('eventId')),
    __param(1, (0, common_1.Param)('runnerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TimingController.prototype, "getRunnerRecords", null);
__decorate([
    (0, common_1.Get)('event/:eventId'),
    __param(0, (0, common_1.Param)('eventId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TimingController.prototype, "getEventRecords", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TimingController.prototype, "deleteRecord", null);
exports.TimingController = TimingController = __decorate([
    (0, common_1.Controller)('timing'),
    __metadata("design:paramtypes", [timing_service_1.TimingService])
], TimingController);
//# sourceMappingURL=timing.controller.js.map