import { RunnersService } from './runners.service';
import type { RunnerFilter } from './runners.service';
import { CreateRunnerDto } from './dto/create-runner.dto';
export declare class RunnersController {
    private readonly runnersService;
    constructor(runnersService: RunnersService);
    create(createRunnerDto: CreateRunnerDto): Promise<import("./runner.schema").RunnerDocument>;
    createMany(runners: CreateRunnerDto[]): Promise<any[]>;
    findByEvent(filter: RunnerFilter): Promise<import("./runner.schema").RunnerDocument[]>;
    findByEventWithPaging(eventId: string, category: string, gender: string, ageGroup: string, status: string, search: string, page: number, limit: number): Promise<{
        data: import("./runner.schema").RunnerDocument[];
        total: number;
    }>;
    getStatistics(eventId: string): Promise<{
        status: {
            status: string;
            count: number;
        }[];
        starters: any[];
        withdrawals: any[];
        finishTimes: any[];
    }>;
    getAllStatusByEvent(eventId: string): Promise<{
        status: string;
        count: number;
    }[]>;
    getStartersByAge(eventId: string): Promise<any[]>;
    getFinishByTime(eventId: string): Promise<any[]>;
    getLatestParticipantByCheckpoint(eventId: string, checkpoint: string, gender: string, ageGroup: string): Promise<import("./runner.schema").RunnerDocument[]>;
    findOne(id: string): Promise<import("./runner.schema").RunnerDocument>;
    findByBib(eventId: string, bib: string): Promise<import("./runner.schema").RunnerDocument | null>;
    findByChipCode(eventId: string, chipCode: string): Promise<import("./runner.schema").RunnerDocument | null>;
    update(id: string, updateData: any): Promise<import("./runner.schema").RunnerDocument | null>;
    updateStatus(id: string, status: string): Promise<import("./runner.schema").RunnerDocument | null>;
    delete(id: string): Promise<void>;
    deleteByEvent(eventId: string): Promise<void>;
    publicRegister(registrationData: CreateRunnerDto): Promise<import("./runner.schema").RunnerDocument>;
    getRegistrationCount(eventId: string): Promise<{
        count: number;
    }>;
}
