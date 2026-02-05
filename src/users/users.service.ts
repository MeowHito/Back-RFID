import { Injectable, NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema';
import { CreateUserDto, UpdatePasswordDto } from './dto/user.dto';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
    constructor(
        @InjectModel(User.name) private userModel: Model<UserDocument>,
    ) { }

    async create(createUserDto: CreateUserDto): Promise<UserDocument> {
        // Check if email exists
        const existingUser = await this.findByEmail(createUserDto.email);
        if (existingUser) {
            throw new ConflictException('Email already exists');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

        const user = new this.userModel({
            ...createUserDto,
            uuid: uuidv4(),
            password: hashedPassword,
            username: createUserDto.username || createUserDto.email.split('@')[0],
        });

        return user.save();
    }

    async findAll(paging?: { page: number; limit: number }): Promise<{ data: UserDocument[]; total: number }> {
        const page = paging?.page || 1;
        const limit = paging?.limit || 20;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.userModel.find().select('-password').skip(skip).limit(limit).exec(),
            this.userModel.countDocuments().exec(),
        ]);

        return { data, total };
    }

    async findById(id: string): Promise<UserDocument | null> {
        return this.userModel.findById(id).select('-password').exec();
    }

    async findByUuid(uuid: string): Promise<UserDocument | null> {
        return this.userModel.findOne({ uuid }).exec();
    }

    async findByEmail(email: string): Promise<UserDocument | null> {
        return this.userModel.findOne({ email }).exec();
    }

    async findByUsername(username: string): Promise<UserDocument | null> {
        return this.userModel.findOne({ username }).exec();
    }

    async validatePassword(email: string, password: string): Promise<UserDocument | null> {
        const user = await this.findByEmail(email);
        if (!user) return null;

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;

        return user;
    }

    async update(id: string, updateData: Partial<CreateUserDto>): Promise<UserDocument> {
        const user = await this.userModel.findByIdAndUpdate(id, updateData, { new: true }).select('-password').exec();
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    async updatePassword(data: UpdatePasswordDto): Promise<void> {
        const user = await this.findByUuid(data.uuid || '');
        if (!user) throw new NotFoundException('User not found');

        if (data.opw) {
            const isValid = await bcrypt.compare(data.opw, user.password);
            if (!isValid) throw new UnauthorizedException('Invalid old password');
        }

        const hashedPassword = await bcrypt.hash(data.npw, 10);
        await this.userModel.findByIdAndUpdate(user._id, { password: hashedPassword }).exec();
    }

    async updateRole(id: string, role: string): Promise<UserDocument> {
        const user = await this.userModel.findByIdAndUpdate(id, { role }, { new: true }).select('-password').exec();
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    async createResetToken(email: string): Promise<string | null> {
        const user = await this.findByEmail(email);
        if (!user) return null;

        const resetToken = uuidv4();
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

        await this.userModel.findByIdAndUpdate(user._id, {
            resetToken,
            resetTokenExpiry,
        }).exec();

        return resetToken;
    }

    async validateResetToken(token: string): Promise<boolean> {
        const user = await this.userModel.findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: new Date() },
        }).exec();
        return !!user;
    }

    async resetPasswordByToken(token: string, newPassword: string): Promise<void> {
        const user = await this.userModel.findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: new Date() },
        }).exec();

        if (!user) throw new NotFoundException('Invalid or expired token');

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await this.userModel.findByIdAndUpdate(user._id, {
            password: hashedPassword,
            resetToken: null,
            resetTokenExpiry: null,
        }).exec();
    }

    async updateLastLogin(id: string): Promise<void> {
        await this.userModel.findByIdAndUpdate(id, { lastLogin: new Date() }).exec();
    }

    async updateProfile(uuid: string, updateData: { firstName?: string; lastName?: string; username?: string; phone?: string; avatarUrl?: string }): Promise<UserDocument> {
        const user = await this.findByUuid(uuid);
        if (!user) throw new NotFoundException('User not found');

        // Check username uniqueness if updating
        if (updateData.username && updateData.username !== user.username) {
            const existingUser = await this.findByUsername(updateData.username);
            if (existingUser) throw new ConflictException('Username already exists');
        }

        const updated = await this.userModel.findByIdAndUpdate(user._id, updateData, { new: true }).select('-password').exec();
        if (!updated) throw new NotFoundException('User not found');
        return updated;
    }

    async updateAvatar(uuid: string, file: any): Promise<UserDocument> {
        const user = await this.findByUuid(uuid);
        if (!user) throw new NotFoundException('User not found');

        if (!file) throw new NotFoundException('No file uploaded');

        // Convert file to base64 data URL for simple storage
        const base64 = file.buffer.toString('base64');
        const mimeType = file.mimetype;
        const avatarUrl = `data:${mimeType};base64,${base64}`;

        const updated = await this.userModel.findByIdAndUpdate(user._id, { avatarUrl }, { new: true }).select('-password').exec();
        if (!updated) throw new NotFoundException('User not found');
        return updated;
    }

    async delete(id: string): Promise<void> {
        const result = await this.userModel.findByIdAndDelete(id).exec();
        if (!result) throw new NotFoundException('User not found');
    }
}
