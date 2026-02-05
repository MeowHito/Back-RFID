import { UsersService } from './users.service';
import { CreateUserDto, UpdatePasswordDto, UpdateProfileDto } from './dto/user.dto';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    create(createUserDto: CreateUserDto): Promise<import("./user.schema").UserDocument>;
    findAll(page: number, limit: number): Promise<{
        data: import("./user.schema").UserDocument[];
        total: number;
    }>;
    findOne(id: string): Promise<import("./user.schema").UserDocument | null>;
    findByUuid(uuid: string): Promise<import("./user.schema").UserDocument | null>;
    update(id: string, updateData: Partial<CreateUserDto>): Promise<import("./user.schema").UserDocument>;
    updateRole(id: string, role: string): Promise<import("./user.schema").UserDocument>;
    updatePassword(data: UpdatePasswordDto): Promise<void>;
    updateProfile(uuid: string, updateData: UpdateProfileDto): Promise<import("./user.schema").UserDocument>;
    uploadAvatar(uuid: string, file: any): Promise<import("./user.schema").UserDocument>;
    delete(id: string): Promise<void>;
}
