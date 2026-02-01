import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TimingRecord, TimingRecordDocument } from './timing-record.schema';
import { RunnersService } from '../runners/runners.service';
import { TimingGateway } from './timing.gateway';

export interface ScanData {
    eventId: string;
    bib?: string;
    rfidTag?: string;
    checkpoint: string;
    scanTime: Date;
    note?: string;
}

@Injectable()
export class TimingService {
    constructor(
        @InjectModel(TimingRecord.name) private timingModel: Model<TimingRecordDocument>,
        private runnersService: RunnersService,
        private timingGateway: TimingGateway,
    ) { }

    async processScan(scanData: ScanData): Promise<TimingRecordDocument> {
        // Find runner by BIB or RFID
        const runner = scanData.bib
            ? await this.runnersService.findByBib(scanData.eventId, scanData.bib)
            : await this.runnersService.findByRfid(scanData.eventId, scanData.rfidTag || '');

        if (!runner) {
            throw new Error(`Runner not found: ${scanData.bib || scanData.rfidTag}`);
        }

        // Get existing records to calculate order and split time
        const existingRecords = await this.getRunnerRecords(scanData.eventId, runner._id.toString());
        const order = existingRecords.length + 1;

        // Calculate elapsed time from start
        let elapsedTime = 0;
        let splitTime = 0;
        if (runner.startTime) {
            elapsedTime = new Date(scanData.scanTime).getTime() - new Date(runner.startTime).getTime();
        }
        if (existingRecords.length > 0) {
            const lastRecord = existingRecords[existingRecords.length - 1];
            splitTime = new Date(scanData.scanTime).getTime() - new Date(lastRecord.scanTime).getTime();
        }

        // Create timing record
        const record = new this.timingModel({
            eventId: new Types.ObjectId(scanData.eventId),
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

        // Update runner status and timing
        const isStart = scanData.checkpoint.toUpperCase() === 'START';
        const isFinish = scanData.checkpoint.toUpperCase() === 'FINISH';

        const updateData: any = {
            latestCheckpoint: scanData.checkpoint,
            elapsedTime,
        };

        if (isStart) {
            updateData.startTime = scanData.scanTime;
            updateData.status = 'in_progress';
        } else if (isFinish) {
            updateData.finishTime = scanData.scanTime;
            updateData.netTime = elapsedTime;
            updateData.status = 'finished';
        } else if (runner.status === 'not_started') {
            updateData.status = 'in_progress';
        }

        await this.runnersService.update(runner._id.toString(), updateData);

        // Update rankings if finished
        if (isFinish) {
            await this.runnersService.updateRankings(scanData.eventId, runner.category);
        }

        // Broadcast update via WebSocket
        const updatedRunner = await this.runnersService.findOne(runner._id.toString());
        this.timingGateway.broadcastRunnerUpdate(scanData.eventId, updatedRunner);

        return record;
    }

    async getRunnerRecords(eventId: string, runnerId: string): Promise<TimingRecordDocument[]> {
        return this.timingModel
            .find({
                eventId: new Types.ObjectId(eventId),
                runnerId: new Types.ObjectId(runnerId),
            })
            .sort({ order: 1 })
            .exec();
    }

    async getEventRecords(eventId: string): Promise<TimingRecordDocument[]> {
        return this.timingModel
            .find({ eventId: new Types.ObjectId(eventId) })
            .sort({ scanTime: -1 })
            .limit(100)
            .exec();
    }

    async deleteRecord(id: string): Promise<void> {
        await this.timingModel.findByIdAndDelete(id).exec();
    }
}
