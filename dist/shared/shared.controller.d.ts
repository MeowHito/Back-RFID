import { EventsService } from '../events/events.service';
import { RunnersService } from '../runners/runners.service';
import { TimingService } from '../timing/timing.service';
export declare class SharedController {
    private readonly eventsService;
    private readonly runnersService;
    private readonly timingService;
    constructor(eventsService: EventsService, runnersService: RunnersService, timingService: TimingService);
    getSharedResults(token?: string, eventId?: string, category?: string, gender?: string, ageGroup?: string, box?: string, status?: string, search?: string, checkpoint?: string): Promise<{
        event: {
            _id: any;
            name: any;
            date: any;
            status: any;
            location: any;
            categories: any;
            checkpoints: any;
            startTime: any;
        };
        runners: import("../runners/runner.schema").RunnerDocument[];
        totalRunners: number;
    }>;
    getSharedRunnerDetails(token: string, runnerId: string): Promise<{
        runner: import("../runners/runner.schema").RunnerDocument;
        timingRecords: import("../timing/timing-record.schema").TimingRecordDocument[];
    }>;
}
