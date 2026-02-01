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
exports.CheckpointsController = void 0;
const common_1 = require("@nestjs/common");
const checkpoints_service_1 = require("./checkpoints.service");
const create_checkpoint_dto_1 = require("./dto/create-checkpoint.dto");
let CheckpointsController = class CheckpointsController {
    checkpointsService;
    constructor(checkpointsService) {
        this.checkpointsService = checkpointsService;
    }
    create(createDto) {
        return this.checkpointsService.create(createDto);
    }
    createMany(checkpoints) {
        return this.checkpointsService.createMany(checkpoints);
    }
    findOne(id) {
        return this.checkpointsService.findById(id);
    }
    findByUuid(uuid) {
        return this.checkpointsService.findByUuid(uuid);
    }
    findByCampaign(campaignId) {
        return this.checkpointsService.findByCampaign(campaignId);
    }
    update(id, updateData) {
        return this.checkpointsService.update(id, updateData);
    }
    updateMany(checkpoints) {
        return this.checkpointsService.updateMany(checkpoints);
    }
    delete(id) {
        return this.checkpointsService.delete(id);
    }
    createMapping(createDto) {
        return this.checkpointsService.createMapping(createDto);
    }
    createManyMappings(mappings) {
        return this.checkpointsService.createManyMappings(mappings);
    }
    findMappingsByEvent(eventId) {
        return this.checkpointsService.findMappingsByEvent(eventId);
    }
    findMappingsByCampaignAndEvent(campaignId, eventId) {
        return this.checkpointsService.findMappingsByCampaignAndEvent(campaignId, eventId);
    }
    updateMappings(mappings) {
        return this.checkpointsService.updateMappings(mappings);
    }
};
exports.CheckpointsController = CheckpointsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_checkpoint_dto_1.CreateCheckpointDto]),
    __metadata("design:returntype", void 0)
], CheckpointsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('bulk'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", void 0)
], CheckpointsController.prototype, "createMany", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CheckpointsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)('uuid/:uuid'),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CheckpointsController.prototype, "findByUuid", null);
__decorate([
    (0, common_1.Get)('campaign/:campaignId'),
    __param(0, (0, common_1.Param)('campaignId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CheckpointsController.prototype, "findByCampaign", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CheckpointsController.prototype, "update", null);
__decorate([
    (0, common_1.Put)('bulk/update'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", void 0)
], CheckpointsController.prototype, "updateMany", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CheckpointsController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)('mapping'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_checkpoint_dto_1.CreateCheckpointMappingDto]),
    __metadata("design:returntype", void 0)
], CheckpointsController.prototype, "createMapping", null);
__decorate([
    (0, common_1.Post)('mapping/bulk'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", void 0)
], CheckpointsController.prototype, "createManyMappings", null);
__decorate([
    (0, common_1.Get)('mapping/event/:eventId'),
    __param(0, (0, common_1.Param)('eventId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CheckpointsController.prototype, "findMappingsByEvent", null);
__decorate([
    (0, common_1.Get)('mapping/:campaignId/:eventId'),
    __param(0, (0, common_1.Param)('campaignId')),
    __param(1, (0, common_1.Param)('eventId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], CheckpointsController.prototype, "findMappingsByCampaignAndEvent", null);
__decorate([
    (0, common_1.Put)('mapping/bulk'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", void 0)
], CheckpointsController.prototype, "updateMappings", null);
exports.CheckpointsController = CheckpointsController = __decorate([
    (0, common_1.Controller)('checkpoints'),
    __metadata("design:paramtypes", [checkpoints_service_1.CheckpointsService])
], CheckpointsController);
//# sourceMappingURL=checkpoints.controller.js.map