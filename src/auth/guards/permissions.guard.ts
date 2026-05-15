import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { User, UserDocument } from '../../users/user.schema';


interface PermissionMeta {
    moduleKey?: string;
    action?: 'view' | 'create' | 'delete' | 'export';
    adminOnly?: boolean;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        @InjectModel(User.name) private userModel: Model<UserDocument>,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const meta = this.reflector.getAllAndOverride<PermissionMeta>(PERMISSIONS_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        // No permission decorator → allow
        if (!meta) return true;

        const request = context.switchToHttp().getRequest();
        const jwtUser = request.user; // from JwtStrategy: { sub, email, role }
        if (!jwtUser) throw new ForbiddenException('Not authenticated');

        const role = jwtUser.role;

        // admin / admin_master bypass all checks
        if (role === 'admin' || role === 'admin_master') return true;

        // Admin-only endpoint
        if (meta.adminOnly) {
            throw new ForbiddenException('Admin access required');
        }

        // Module permission check — load fresh permissions from DB
        if (meta.moduleKey && meta.action) {
            const dbUser = await this.userModel
                .findOne({ uuid: jwtUser.sub })
                .select('modulePermissions')
                .lean()
                .exec();

            if (!dbUser) throw new ForbiddenException('User not found');

            const perms = (dbUser as any).modulePermissions || {};
            const modulePerm = perms[meta.moduleKey];

            if (!modulePerm || modulePerm[meta.action] !== true) {
                throw new ForbiddenException(
                    `Permission denied: ${meta.moduleKey}.${meta.action}`,
                );
            }
        }

        return true;
    }
}
