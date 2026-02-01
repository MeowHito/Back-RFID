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
exports.TimingRecordSchema = exports.TimingRecord = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let TimingRecord = class TimingRecord {
    eventId;
    runnerId;
    bib;
    checkpoint;
    scanTime;
    rfidTag;
    order;
    note;
    splitTime;
    elapsedTime;
};
exports.TimingRecord = TimingRecord;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Event', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TimingRecord.prototype, "eventId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Runner', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TimingRecord.prototype, "runnerId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], TimingRecord.prototype, "bib", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], TimingRecord.prototype, "checkpoint", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Date)
], TimingRecord.prototype, "scanTime", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], TimingRecord.prototype, "rfidTag", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 1 }),
    __metadata("design:type", Number)
], TimingRecord.prototype, "order", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], TimingRecord.prototype, "note", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], TimingRecord.prototype, "splitTime", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], TimingRecord.prototype, "elapsedTime", void 0);
exports.TimingRecord = TimingRecord = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], TimingRecord);
exports.TimingRecordSchema = mongoose_1.SchemaFactory.createForClass(TimingRecord);
exports.TimingRecordSchema.index({ eventId: 1, runnerId: 1 });
exports.TimingRecordSchema.index({ eventId: 1, bib: 1, checkpoint: 1 });
exports.TimingRecordSchema.index({ scanTime: -1 });
//# sourceMappingURL=timing-record.schema.js.map