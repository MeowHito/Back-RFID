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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncLogSchema = exports.SyncLog = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let SyncLog = class SyncLog {
    campaignId;
    status;
    message;
    recordsProcessed;
    recordsFailed;
    startTime;
    endTime;
    errorDetails;
};
exports.SyncLog = SyncLog;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Campaign', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], SyncLog.prototype, "campaignId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: ['success', 'error', 'pending'] }),
    __metadata("design:type", String)
], SyncLog.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], SyncLog.prototype, "message", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], SyncLog.prototype, "recordsProcessed", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], SyncLog.prototype, "recordsFailed", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], SyncLog.prototype, "startTime", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], SyncLog.prototype, "endTime", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object }),
    __metadata("design:type", Object)
], SyncLog.prototype, "errorDetails", void 0);
exports.SyncLog = SyncLog = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], SyncLog);
exports.SyncLogSchema = mongoose_1.SchemaFactory.createForClass(SyncLog);
exports.SyncLogSchema.index({ campaignId: 1, createdAt: -1 });
exports.SyncLogSchema.index({ status: 1 });
//# sourceMappingURL=sync-log.schema.js.map