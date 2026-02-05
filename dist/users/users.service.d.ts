import { Model } from 'mongoose';
import { UserDocument } from './user.schema';
import { CreateUserDto, UpdatePasswordDto } from './dto/user.dto';
export declare class UsersService {
    private userModel;
    constructor(userModel: Model<UserDocument>);
    create(createUserDto: CreateUserDto): Promise<UserDocument>;
    findAll(paging?: {
        page: number;
        limit: number;
    }): Promise<{
        data: UserDocument[];
        total: number;
    }>;
    findById(id: string): Promise<UserDocument | null>;
    findByUuid(uuid: string): Promise<UserDocument | null>;
    findByEmail(email: string): Promise<UserDocument | null>;
    findByUsername(username: string): Promise<UserDocument | null>;
    validatePassword(email: string, password: string): Promise<UserDocument | null>;
    update(id: string, updateData: Partial<CreateUserDto>): Promise<UserDocument>;
    updatePassword(data: UpdatePasswordDto): Promise<void>;
    updateRole(id: string, role: string): Promise<UserDocument>;
    createResetToken(email: string): Promise<string | null>;
    validateResetToken(token: string): Promise<boolean>;
    resetPasswordByToken(token: string, newPassword: string): Promise<void>;
    updateLastLogin(id: string): Promise<void>;
    updateProfile(uuid: string, updateData: {
        firstName?: string;
        lastName?: string;
        username?: string;
        phone?: string;
        avatarUrl?: string;
    }): Promise<UserDocument>;
    updateAvatar(uuid: string, file: any): Promise<UserDocument>;
    delete(id: string): Promise<void>;
}
