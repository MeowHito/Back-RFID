import { TimingService } from './timing.service';
import type { ScanData } from './timing.service';
export declare class TimingController {
    private readonly timingService;
    constructor(timingService: TimingService);
    processScan(scanData: ScanData): Promise<import("./timing-record.schema").TimingRecordDocument>;
    getRunnerRecords(eventId: string, runnerId: string): Promise<import("./timing-record.schema").TimingRecordDocument[]>;
    getEventRecords(eventId: string): Promise<import("./timing-record.schema").TimingRecordDocument[]>;
    deleteRecord(id: string): Promise<void>;
}
