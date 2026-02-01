"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("./user.schema");
const uuid_1 = require("uuid");
const bcrypt = __importStar(require("bcrypt"));
let UsersService = class UsersService {
    userModel;
    constructor(userModel) {
        this.userModel = userModel;
    }
    async create(createUserDto) {
        const existingUser = await this.findByEmail(createUserDto.email);
        if (existingUser) {
            throw new common_1.ConflictException('Email already exists');
        }
        const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
        const user = new this.userModel({
            ...createUserDto,
            uuid: (0, uuid_1.v4)(),
            password: hashedPassword,
            username: createUserDto.username || createUserDto.email.split('@')[0],
        });
        return user.save();
    }
    async findAll(paging) {
        const page = paging?.page || 1;
        const limit = paging?.limit || 20;
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.userModel.find().select('-password').skip(skip).limit(limit).exec(),
            this.userModel.countDocuments().exec(),
        ]);
        return { data, total };
    }
    async findById(id) {
        return this.userModel.findById(id).select('-password').exec();
    }
    async findByUuid(uuid) {
        return this.userModel.findOne({ uuid }).exec();
    }
    async findByEmail(email) {
        return this.userModel.findOne({ email }).exec();
    }
    async findByUsername(username) {
        return this.userModel.findOne({ username }).exec();
    }
    async validatePassword(email, password) {
        const user = await this.findByEmail(email);
        if (!user)
            return null;
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid)
            return null;
        return user;
    }
    async update(id, updateData) {
        const user = await this.userModel.findByIdAndUpdate(id, updateData, { new: true }).select('-password').exec();
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return user;
    }
    async updatePassword(data) {
        const user = await this.findByUuid(data.uuid || '');
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (data.opw) {
            const isValid = await bcrypt.compare(data.opw, user.password);
            if (!isValid)
                throw new common_1.UnauthorizedException('Invalid old password');
        }
        const hashedPassword = await bcrypt.hash(data.npw, 10);
        await this.userModel.findByIdAndUpdate(user._id, { password: hashedPassword }).exec();
    }
    async updateRole(id, role) {
        const user = await this.userModel.findByIdAndUpdate(id, { role }, { new: true }).select('-password').exec();
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return user;
    }
    async createResetToken(email) {
        const user = await this.findByEmail(email);
        if (!user)
            return null;
        const resetToken = (0, uuid_1.v4)();
        const resetTokenExpiry = new Date(Date.now() + 3600000);
        await this.userModel.findByIdAndUpdate(user._id, {
            resetToken,
            resetTokenExpiry,
        }).exec();
        return resetToken;
    }
    async validateResetToken(token) {
        const user = await this.userModel.findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: new Date() },
        }).exec();
        return !!user;
    }
    async resetPasswordByToken(token, newPassword) {
        const user = await this.userModel.findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: new Date() },
        }).exec();
        if (!user)
            throw new common_1.NotFoundException('Invalid or expired token');
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await this.userModel.findByIdAndUpdate(user._id, {
            password: hashedPassword,
            resetToken: null,
            resetTokenExpiry: null,
        }).exec();
    }
    async updateLastLogin(id) {
        await this.userModel.findByIdAndUpdate(id, { lastLogin: new Date() }).exec();
    }
    async delete(id) {
        const result = await this.userModel.findByIdAndDelete(id).exec();
        if (!result)
            throw new common_1.NotFoundException('User not found');
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], UsersService);
//# sourceMappingURL=users.service.js.map