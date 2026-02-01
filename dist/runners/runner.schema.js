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
exports.RunnerSchema = exports.Runner = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let Runner = class Runner {
    eventId;
    bib;
    firstName;
    lastName;
    firstNameTh;
    lastNameTh;
    gender;
    ageGroup;
    age;
    box;
    team;
    category;
    status;
    rfidTag;
    checkInTime;
    startTime;
    finishTime;
    netTime;
    elapsedTime;
    overallRank;
    genderRank;
    ageGroupRank;
    latestCheckpoint;
    chipCode;
    nationality;
    birthDate;
    idNo;
    shirtSize;
    teamName;
    registerDate;
    isStarted;
    allowRFIDSync;
    email;
    phone;
    emergencyContact;
    emergencyPhone;
    medicalInfo;
    bloodType;
    chronicDiseases;
    address;
    categoryRank;
};
exports.Runner = Runner;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Event', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Runner.prototype, "eventId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Runner.prototype, "bib", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Runner.prototype, "firstName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Runner.prototype, "lastName", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "firstNameTh", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "lastNameTh", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: ['M', 'F'] }),
    __metadata("design:type", String)
], Runner.prototype, "gender", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "ageGroup", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], Runner.prototype, "age", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "box", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "team", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Runner.prototype, "category", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'not_started' }),
    __metadata("design:type", String)
], Runner.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "rfidTag", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Runner.prototype, "checkInTime", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Runner.prototype, "startTime", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Runner.prototype, "finishTime", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], Runner.prototype, "netTime", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], Runner.prototype, "elapsedTime", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Runner.prototype, "overallRank", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Runner.prototype, "genderRank", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Runner.prototype, "ageGroupRank", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "latestCheckpoint", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "chipCode", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "nationality", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Runner.prototype, "birthDate", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "idNo", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "shirtSize", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "teamName", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Runner.prototype, "registerDate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], Runner.prototype, "isStarted", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], Runner.prototype, "allowRFIDSync", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "email", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "phone", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "emergencyContact", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "emergencyPhone", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "medicalInfo", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "bloodType", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "chronicDiseases", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Runner.prototype, "address", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Runner.prototype, "categoryRank", void 0);
exports.Runner = Runner = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true })
], Runner);
exports.RunnerSchema = mongoose_1.SchemaFactory.createForClass(Runner);
exports.RunnerSchema.index({ eventId: 1, bib: 1 }, { unique: true });
exports.RunnerSchema.index({ eventId: 1, rfidTag: 1 });
exports.RunnerSchema.index({ eventId: 1, chipCode: 1 });
exports.RunnerSchema.index({ eventId: 1, status: 1 });
exports.RunnerSchema.index({ eventId: 1, category: 1, netTime: 1 });
//# sourceMappingURL=runner.schema.js.map