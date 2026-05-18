/**
 * Role-based default permissions.
 *
 * Behaviour rules (per project spec):
 *   - admin / admin_master  → full access; modulePermissions are ignored by guards
 *   - organizer             → READ-ONLY across all modules they can see. May ONLY view
 *                              data for campaigns listed in allowedCampaigns. Cannot
 *                              create / edit / delete ANYTHING.
 *   - station               → may ONLY use the Checkpoint Monitor for campaigns in
 *                              allowedCampaigns. No other module is visible.
 *   - user                  → public-facing role; no admin module access at all.
 *
 * These permissions are enforced by `applyRolePermissions()` on every create/update
 * so a client can never grant itself extra rights by sending custom payloads.
 */

export type ModulePerm = {
    view: boolean;
    create: boolean;
    delete: boolean;
    export: boolean;
};

const NONE: ModulePerm = { view: false, create: false, delete: false, export: false };
const READ_ONLY: ModulePerm = { view: true, create: false, delete: false, export: false };

const ALL_MODULES = [
    'participants',
    'checkpoints',
    'rfidCheckin',
    'photos',
    'certificates',
    'reports',
    'results',
    'settings',
    'userManagement',
    'cctvMonitor',
] as const;

export type ModuleKey = (typeof ALL_MODULES)[number];

/**
 * Returns the locked-down permission map a user MUST have based on their role.
 * Admin returns an empty object (guards bypass anyway).
 */
export function getRolePermissions(role: string): Record<string, ModulePerm> {
    switch (role) {
        case 'admin':
        case 'admin_master':
            // Admin bypasses all checks in PermissionsGuard, so just give full perms
            // for any frontend code that inspects the map directly.
            return ALL_MODULES.reduce((acc, key) => {
                acc[key] = { view: true, create: true, delete: true, export: true };
                return acc;
            }, {} as Record<string, ModulePerm>);

        case 'organizer':
            // View everything inside their assigned campaigns. Never write.
            return ALL_MODULES.reduce((acc, key) => {
                acc[key] = key === 'userManagement' ? { ...NONE } : { ...READ_ONLY };
                return acc;
            }, {} as Record<string, ModulePerm>);

        case 'station':
            // ONLY the Checkpoint Monitor is visible.
            return ALL_MODULES.reduce((acc, key) => {
                acc[key] = key === 'checkpoints' ? { ...READ_ONLY } : { ...NONE };
                return acc;
            }, {} as Record<string, ModulePerm>);

        case 'user':
        default:
            return ALL_MODULES.reduce((acc, key) => {
                acc[key] = { ...NONE };
                return acc;
            }, {} as Record<string, ModulePerm>);
    }
}

/**
 * Returns true if a role requires `allowedCampaigns` to be set in order to see anything.
 */
export function roleNeedsCampaignScope(role: string): boolean {
    return role === 'organizer' || role === 'station';
}
