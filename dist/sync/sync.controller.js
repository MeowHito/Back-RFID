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
exports.SyncController = void 0;
const common_1 = require("@nestjs/common");
const sync_service_1 = require("./sync.service");
let SyncController = class SyncController {
    syncService;
    constructor(syncService) {
        this.syncService = syncService;
    }
    successResponse(data) {
        return {
            status: { code: '200', description: 'success' },
            data,
        };
    }
    async wasLastSyncError(headers, campaignId) {
        const isError = await this.syncService.wasLastSyncError(campaignId);
        return this.successResponse(isError);
    }
    async getAllCampaignSyncErrors(headers) {
        const errors = await this.syncService.getAllCampaignSyncErrors();
        return this.successResponse(errors);
    }
    async getSyncData(headers, id) {
        const data = await this.syncService.getSyncData(id);
        return this.successResponse(data);
    }
};
exports.SyncController = SyncController;
__decorate([
    (0, common_1.Get)('last-sync-error'),
    __param(0, (0, common_1.Headers)()),
    __param(1, (0, common_1.Query)('campaignId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "wasLastSyncError", null);
__decorate([
    (0, common_1.Get)('all-campaign-sync-errors'),
    __param(0, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "getAllCampaignSyncErrors", null);
__decorate([
    (0, common_1.Get)('sync-data'),
    __param(0, (0, common_1.Headers)()),
    __param(1, (0, common_1.Query)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "getSyncData", null);
exports.SyncController = SyncController = __decorate([
    (0, common_1.Controller)('api/sync'),
    __metadata("design:paramtypes", [sync_service_1.SyncService])
], SyncController);
//# sourceMappingURL=sync.controller.js.map