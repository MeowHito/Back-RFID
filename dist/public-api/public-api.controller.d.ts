import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { RunnersService } from '../runners/runners.service';
import { CheckpointsService } from '../checkpoints/checkpoints.service';
import { TimingService } from '../timing/timing.service';
import { CreateUserDto, LoginStationDto, UpdatePasswordDto } from '../users/dto/user.dto';
interface NormalizedResponse {
    status: {
        code: string;
        description: string;
    };
    data?: any;
}
export declare class PublicApiController {
    private readonly usersService;
    private readonly authService;
    private readonly campaignsService;
    private readonly runnersService;
    private readonly checkpointsService;
    private readonly timingService;
    constructor(usersService: UsersService, authService: AuthService, campaignsService: CampaignsService, runnersService: RunnersService, checkpointsService: CheckpointsService, timingService: TimingService);
    private successResponse;
    private errorResponse;
    register(body: CreateUserDto): Promise<NormalizedResponse>;
    loginStation(headers: Record<string, string>, body: LoginStationDto): Promise<NormalizedResponse>;
    checkUserEmail(body: {
        email: string;
    }): Promise<NormalizedResponse>;
    getUserToken(id: string): Promise<NormalizedResponse>;
    updateUserToken(body: {
        uuid: string;
        npw: string;
    }): Promise<NormalizedResponse>;
    updatePassword(body: UpdatePasswordDto): Promise<NormalizedResponse>;
    getCampaignByDate(type: string, user: string, role: string, pagingJson: string): Promise<NormalizedResponse>;
    getCampaignById(id: string): Promise<NormalizedResponse>;
    getCampaignDetailById(id: string): Promise<NormalizedResponse>;
    getCheckpointById(id: string): Promise<NormalizedResponse>;
    getAllParticipantByEvent(id: string, pagingJson: string, eventName: string, gender: string, ageGroup: string, favorites: string, type: string): Promise<NormalizedResponse>;
    getAllStatusByEvent(id: string): Promise<NormalizedResponse>;
    getStartersByAge(id: string): Promise<NormalizedResponse>;
    getFinishByTime(id: string): Promise<NormalizedResponse>;
    getParticipantByChipCode(id: string, chipCode: string, bibNo: string): Promise<NormalizedResponse>;
    getLatestParticipantByCheckpoint(id: string, eventUuid: string, pagingJson: string, checkpointName: string, gender: string, ageGroup: string): Promise<NormalizedResponse>;
    createRaceTimestampWithQRCode(headers: Record<string, string>, body: {
        campaignUuid: string;
        stationUuid: string;
        bibNo: string;
        scanTime: string;
        checkpoint: string;
    }): Promise<NormalizedResponse>;
    getRaceTimestampByStation(id: string, campaignUuid: string, pagingJson: string): Promise<NormalizedResponse>;
    getParticipantByCampaign(id: string, campaignUuid: string): Promise<NormalizedResponse>;
}
export {};
