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
exports.CheckpointMappingSchema = exports.CheckpointMapping = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let CheckpointMapping = class CheckpointMapping {
    checkpointId;
    eventId;
    distanceFromStart;
    cutoffTime;
    active;
    orderNum;
};
exports.CheckpointMapping = CheckpointMapping;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Checkpoint', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], CheckpointMapping.prototype, "checkpointId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Event', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], CheckpointMapping.prototype, "eventId", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], CheckpointMapping.prototype, "distanceFromStart", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], CheckpointMapping.prototype, "cutoffTime", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], CheckpointMapping.prototype, "active", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], CheckpointMapping.prototype, "orderNum", void 0);
exports.CheckpointMapping = CheckpointMapping = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], CheckpointMapping);
exports.CheckpointMappingSchema = mongoose_1.SchemaFactory.createForClass(CheckpointMapping);
exports.CheckpointMappingSchema.index({ checkpointId: 1, eventId: 1 }, { unique: true });
exports.CheckpointMappingSchema.index({ eventId: 1, orderNum: 1 });
//# sourceMappingURL=checkpoint-mapping.schema.js.map