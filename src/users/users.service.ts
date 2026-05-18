import { Injectable, NotFoundException, ConflictException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './user.schema';
import { CreateUserDto, UpdatePasswordDto } from './dto/user.dto';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { getRolePermissions, roleNeedsCampaignScope } from './role-permissions';

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

        // admin_master can only be created via the database / seed script
        if (createUserDto.role === 'admin_master') {
            throw new ConflictException('admin_master cannot be created from the API');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

        const role = createUserDto.role || 'user';
        const allEventsAccess = role === 'admin' ? true : (createUserDto.allEventsAccess ?? false);
        const allowedCampaigns = role === 'admin' ? [] : this.normalizeCampaignIds(createUserDto.allowedCampaigns);

        // Role-based permissions are always derived server-side so a client cannot
        // grant themselves extra rights.
        const modulePermissions = getRolePermissions(role);

        const user = new this.userModel({
            ...createUserDto,
            uuid: uuidv4(),
            password: hashedPassword,
            username: createUserDto.username || createUserDto.email.split('@')[0],
            role,
            allEventsAccess,
            allowedCampaigns,
            modulePermissions,
        });

        return user.save();
    }

    private normalizeCampaignIds(ids?: string[]): Types.ObjectId[] {
        if (!Array.isArray(ids)) return [];
        const out: Types.ObjectId[] = [];
        for (const id of ids) {
            if (typeof id === 'string' && Types.ObjectId.isValid(id)) {
                out.push(new Types.ObjectId(id));
            }
        }
        return out;
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
        const existing = await this.userModel.findById(id).select('role').exec();
        if (!existing) throw new NotFoundException('User not found');

        // admin_master cannot be modified via this endpoint
        if (existing.role === 'admin_master') {
            throw new ForbiddenException('admin_master cannot be modified from the API');
        }

        const patch: any = { ...updateData };
        // Never accept password through this endpoint
        delete patch.password;

        // If role is changing, re-apply role-based defaults so privileges stay aligned
        if (patch.role && patch.role !== existing.role) {
            if (patch.role === 'admin_master') {
                throw new ForbiddenException('Cannot promote to admin_master');
            }
            patch.modulePermissions = getRolePermissions(patch.role);
            if (patch.role === 'admin') {
                patch.allEventsAccess = true;
                patch.allowedCampaigns = [];
            }
        }

        if (Array.isArray(patch.allowedCampaigns)) {
            patch.allowedCampaigns = this.normalizeCampaignIds(patch.allowedCampaigns);
        }

        const user = await this.userModel.findByIdAndUpdate(id, patch, { new: true }).select('-password').exec();
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    async updatePassword(data: UpdatePasswordDto, requestor?: { uuid: string; role: string }): Promise<{ success: true }> {
        const targetUuid = data.uuid || requestor?.uuid;
        if (!targetUuid) throw new UnauthorizedException('Missing target user');

        const user = await this.findByUuid(targetUuid);
        if (!user) throw new NotFoundException('User not found');

        const isSelf = requestor?.uuid === user.uuid;
        const isAdmin = requestor?.role === 'admin' || requestor?.role === 'admin_master';

        if (!requestor || (!isSelf && !isAdmin)) {
            throw new ForbiddenException('Cannot change another user\'s password');
        }

        // Self-service password change requires the old password. Admins may reset
        // anyone (except admin_master) without supplying it.
        if (isSelf && !isAdmin) {
            if (!data.opw) throw new UnauthorizedException('Old password is required');
            const isValid = await bcrypt.compare(data.opw, user.password);
            if (!isValid) throw new UnauthorizedException('Invalid old password');
        }

        if (user.role === 'admin_master' && requestor.role !== 'admin_master' && !isSelf) {
            throw new ForbiddenException('Cannot reset admin_master password');
        }

        const hashedPassword = await bcrypt.hash(data.npw, 10);
        await this.userModel.findByIdAndUpdate(user._id, { password: hashedPassword }).exec();
        return { success: true };
    }

    async updateRole(id: string, role: string, requestorRole?: string): Promise<UserDocument> {
        // admin_master can only be set directly in the database
        if (role === 'admin_master') {
            throw new ConflictException('admin_master can only be assigned directly in the database');
        }

        // Check if target user is admin_master — only admin_master can change admin_master
        const targetUser = await this.userModel.findById(id).select('role').exec();
        if (!targetUser) throw new NotFoundException('User not found');

        if (targetUser.role === 'admin_master' && requestorRole !== 'admin_master') {
            throw new ConflictException('Cannot modify admin_master role');
        }

        const update: any = {
            role,
            modulePermissions: getRolePermissions(role),
        };
        if (role === 'admin') {
            update.allEventsAccess = true;
            update.allowedCampaigns = [];
        } else if (role === 'user') {
            update.allEventsAccess = false;
            update.allowedCampaigns = [];
        }

        const user = await this.userModel.findByIdAndUpdate(id, update, { new: true }).select('-password').exec();
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

        // Security: Validate file type
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new NotFoundException('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.');
        }

        // Security: Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            throw new NotFoundException('File too large. Maximum size is 5MB.');
        }

        // Convert file to base64 data URL for simple storage
        const base64 = file.buffer.toString('base64');
        const mimeType = file.mimetype;
        const avatarUrl = `data:${mimeType};base64,${base64}`;

        const updated = await this.userModel.findByIdAndUpdate(user._id, { avatarUrl }, { new: true }).select('-password').exec();
        if (!updated) throw new NotFoundException('User not found');
        return updated;
    }

    async updatePermissions(
        id: string,
        data: {
            allEventsAccess?: boolean;
            allowedCampaigns?: string[];
            modulePermissions?: Record<string, { view: boolean; create: boolean; delete: boolean; export: boolean }>;
        },
    ): Promise<UserDocument> {
        const existing = await this.userModel.findById(id).select('role').exec();
        if (!existing) throw new NotFoundException('User not found');
        if (existing.role === 'admin_master') {
            throw new ForbiddenException('admin_master permissions cannot be modified');
        }

        const updateData: any = {};

        if (existing.role === 'admin') {
            // Admins always have everything; ignore any restriction attempt.
            updateData.allEventsAccess = true;
            updateData.allowedCampaigns = [];
            updateData.modulePermissions = getRolePermissions('admin');
        } else {
            // Force role-derived permissions; the client cannot pick custom rights.
            updateData.modulePermissions = getRolePermissions(existing.role);
            updateData.allEventsAccess = false;
            updateData.allowedCampaigns = this.normalizeCampaignIds(data.allowedCampaigns);
        }

        const user = await this.userModel.findByIdAndUpdate(id, updateData, { new: true }).select('-password').exec();
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    async delete(
        id: string,
        requestor?: { uuid: string; role: string },
        secondaryConfirm?: { email?: string; password?: string },
    ): Promise<void> {
        const existing = await this.userModel.findById(id).select('role uuid').exec();
        if (!existing) throw new NotFoundException('User not found');

        if (existing.role === 'admin_master') {
            throw new ForbiddenException('admin_master cannot be deleted');
        }
        if (requestor && existing.uuid === requestor.uuid) {
            throw new ForbiddenException('You cannot delete your own account');
        }

        // Deleting another admin requires a second admin to confirm with their
        // own credentials. This prevents a single compromised admin account from
        // wiping out other admins.
        if (existing.role === 'admin') {
            if (!secondaryConfirm?.email || !secondaryConfirm?.password) {
                throw new ForbiddenException(
                    'Deleting an admin requires confirmation by a second admin (email + password)',
                );
            }
            const confirmer = await this.validatePassword(
                secondaryConfirm.email,
                secondaryConfirm.password,
            );
            if (!confirmer) {
                throw new UnauthorizedException('Confirming admin credentials are invalid');
            }
            if (confirmer.role !== 'admin' && confirmer.role !== 'admin_master') {
                throw new ForbiddenException('Confirming user must be an admin');
            }
            if (requestor && confirmer.uuid === requestor.uuid) {
                throw new ForbiddenException(
                    'Confirming admin must be a different person from the requester',
                );
            }
            if (confirmer.uuid === existing.uuid) {
                throw new ForbiddenException('An admin cannot confirm their own deletion');
            }
        }

        await this.userModel.findByIdAndDelete(id).exec();
    }
}
