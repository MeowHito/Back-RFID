import { EventsService } from '../events/events.service';
import { RunnersService } from '../runners/runners.service';
import { TimingService } from '../timing/timing.service';
export declare class SharedController {
    private readonly eventsService;
    private readonly runnersService;
    private readonly timingService;
    constructor(eventsService: EventsService, runnersService: RunnersService, timingService: TimingService);
    getSharedResults(token: string, category?: string, gender?: string, ageGroup?: string, box?: string, status?: string, search?: string, checkpoint?: string): Promise<{
        event: {
            id: any;
            name: string;
            date: Date;
            status: string;
            categories: string[];
            checkpoints: string[];
            startTime: Date;
        };
        runners: import("../runners/runner.schema").RunnerDocument[];
        totalRunners: number;
    }>;
    getSharedRunnerDetails(token: string, runnerId: string): Promise<{
        runner: import("../runners/runner.schema").RunnerDocument;
        timingRecords: import("../timing/timing-record.schema").TimingRecordDocument[];
    }>;
}
