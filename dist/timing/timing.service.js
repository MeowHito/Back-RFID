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
exports.TimingService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const timing_record_schema_1 = require("./timing-record.schema");
const runners_service_1 = require("../runners/runners.service");
const timing_gateway_1 = require("./timing.gateway");
let TimingService = class TimingService {
    timingModel;
    runnersService;
    timingGateway;
    constructor(timingModel, runnersService, timingGateway) {
        this.timingModel = timingModel;
        this.runnersService = runnersService;
        this.timingGateway = timingGateway;
    }
    async processScan(scanData) {
        const runner = scanData.bib
            ? await this.runnersService.findByBib(scanData.eventId, scanData.bib)
            : await this.runnersService.findByRfid(scanData.eventId, scanData.rfidTag || '');
        if (!runner) {
            throw new Error(`Runner not found: ${scanData.bib || scanData.rfidTag}`);
        }
        const existingRecords = await this.getRunnerRecords(scanData.eventId, runner._id.toString());
        const order = existingRecords.length + 1;
        let elapsedTime = 0;
        let splitTime = 0;
        if (runner.startTime) {
            elapsedTime = new Date(scanData.scanTime).getTime() - new Date(runner.startTime).getTime();
        }
        if (existingRecords.length > 0) {
            const lastRecord = existingRecords[existingRecords.length - 1];
            splitTime = new Date(scanData.scanTime).getTime() - new Date(lastRecord.scanTime).getTime();
        }
        const record = new this.timingModel({
            eventId: new mongoose_2.Types.ObjectId(scanData.eventId),
            runnerId: runner._id,
            bib: runner.bib,
            checkpoint: scanData.checkpoint,
            scanTime: scanData.scanTime,
            rfidTag: scanData.rfidTag || runner.rfidTag,
            order,
            note: scanData.note,
            splitTime,
            elapsedTime,
        });
        await record.save();
        const isStart = scanData.checkpoint.toUpperCase() === 'START';
        const isFinish = scanData.checkpoint.toUpperCase() === 'FINISH';
        const updateData = {
            latestCheckpoint: scanData.checkpoint,
            elapsedTime,
        };
        if (isStart) {
            updateData.startTime = scanData.scanTime;
            updateData.status = 'in_progress';
        }
        else if (isFinish) {
            updateData.finishTime = scanData.scanTime;
            updateData.netTime = elapsedTime;
            updateData.status = 'finished';
        }
        else if (runner.status === 'not_started') {
            updateData.status = 'in_progress';
        }
        await this.runnersService.update(runner._id.toString(), updateData);
        if (isFinish) {
            await this.runnersService.updateRankings(scanData.eventId, runner.category);
        }
        const updatedRunner = await this.runnersService.findOne(runner._id.toString());
        this.timingGateway.broadcastRunnerUpdate(scanData.eventId, updatedRunner);
        return record;
    }
    async getRunnerRecords(eventId, runnerId) {
        return this.timingModel
            .find({
            eventId: new mongoose_2.Types.ObjectId(eventId),
            runnerId: new mongoose_2.Types.ObjectId(runnerId),
        })
            .sort({ order: 1 })
            .exec();
    }
    async getEventRecords(eventId) {
        return this.timingModel
            .find({ eventId: new mongoose_2.Types.ObjectId(eventId) })
            .sort({ scanTime: -1 })
            .limit(100)
            .exec();
    }
    async deleteRecord(id) {
        await this.timingModel.findByIdAndDelete(id).exec();
    }
};
exports.TimingService = TimingService;
exports.TimingService = TimingService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(timing_record_schema_1.TimingRecord.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        runners_service_1.RunnersService,
        timing_gateway_1.TimingGateway])
], TimingService);
//# sourceMappingURL=timing.service.js.map