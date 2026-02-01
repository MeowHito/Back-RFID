import { Model } from 'mongoose';
import { RunnerDocument } from './runner.schema';
import { CreateRunnerDto } from './dto/create-runner.dto';
export interface RunnerFilter {
    eventId: string;
    category?: string;
    gender?: string;
    ageGroup?: string;
    box?: string;
    status?: string;
    search?: string;
    checkpoint?: string;
}
export interface PagingData {
    page: number;
    limit: number;
    search?: string;
}
export declare class RunnersService {
    private runnerModel;
    constructor(runnerModel: Model<RunnerDocument>);
    create(createRunnerDto: CreateRunnerDto): Promise<RunnerDocument>;
    createMany(runners: CreateRunnerDto[]): Promise<any[]>;
    findByEvent(filter: RunnerFilter): Promise<RunnerDocument[]>;
    findByEventWithPaging(filter: RunnerFilter, paging?: PagingData): Promise<{
        data: RunnerDocument[];
        total: number;
    }>;
    findOne(id: string): Promise<RunnerDocument>;
    findByBib(eventId: string, bib: string): Promise<RunnerDocument | null>;
    findByRfid(eventId: string, rfidTag: string): Promise<RunnerDocument | null>;
    findByChipCode(eventId: string, chipCode: string): Promise<RunnerDocument | null>;
    update(id: string, updateData: any): Promise<RunnerDocument | null>;
    updateStatus(id: string, status: string): Promise<RunnerDocument | null>;
    updateTiming(id: string, data: {
        latestCheckpoint?: string;
        netTime?: number;
        elapsedTime?: number;
        finishTime?: Date;
        status?: string;
    }): Promise<RunnerDocument | null>;
    updateRankings(eventId: string, category: string): Promise<void>;
    getAllStatusByEvent(eventId: string): Promise<Array<{
        status: string;
        count: number;
    }>>;
    getStartersByAge(eventId: string): Promise<any[]>;
    getWithdrawalByAge(eventId: string): Promise<any[]>;
    getWithdrawalByCheckpoint(eventId: string): Promise<any[]>;
    getFinishByTime(eventId: string): Promise<any[]>;
    getParticipantWithStationByEvent(eventId: string): Promise<RunnerDocument[]>;
    getLatestParticipantByCheckpoint(eventId: string, checkpoint: string, gender?: string, ageGroup?: string): Promise<RunnerDocument[]>;
    delete(id: string): Promise<void>;
    deleteByEvent(eventId: string): Promise<void>;
    deleteAllParticipants(eventId: string): Promise<void>;
}
