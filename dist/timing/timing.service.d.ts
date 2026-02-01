import { Model } from 'mongoose';
import { TimingRecordDocument } from './timing-record.schema';
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
export declare class TimingService {
    private timingModel;
    private runnersService;
    private timingGateway;
    constructor(timingModel: Model<TimingRecordDocument>, runnersService: RunnersService, timingGateway: TimingGateway);
    processScan(scanData: ScanData): Promise<TimingRecordDocument>;
    getRunnerRecords(eventId: string, runnerId: string): Promise<TimingRecordDocument[]>;
    getEventRecords(eventId: string): Promise<TimingRecordDocument[]>;
    deleteRecord(id: string): Promise<void>;
}
