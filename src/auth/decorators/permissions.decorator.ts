import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to mark an endpoint with required module permission.
 * Usage: @RequirePermission('participants', 'create')
 *        @RequirePermission('checkpoints', 'delete')
 *
 * Actions: 'view' | 'create' | 'delete' | 'export'
 * admin / admin_master roles bypass all permission checks.
 */
export const RequirePermission = (moduleKey: string, action: 'view' | 'create' | 'delete' | 'export') =>
    SetMetadata(PERMISSIONS_KEY, { moduleKey, action });

/**
 * Decorator to mark an endpoint as admin-only (admin / admin_master).
 */
export const AdminOnly = () => SetMetadata(PERMISSIONS_KEY, { adminOnly: true });
