import { create } from 'zustand';

interface SettingsIF {
    name: string;
    iconName: string;
    items: {
        name: string;
        iconName: string;
        path: string;
        key: string;
        permission: string;
    }[];
}

interface PermissionStoreIF {
    permissions: string[];
    user: any;
    role: any;
    settings: SettingsIF[];
    refreshSidebar: number;
    checkPermission: (permission?: string) => boolean;
    checkRolePermission: (permission?: string) => boolean;
    setPermissions: (permissions: string[]) => void;
    updateRefreshSidebar: () => void;
}

export const usePermissionStore = create<PermissionStoreIF>((set, get) => ({
    permissions: [],
    user: {},
    role: {},
    settings: [],
    refreshSidebar: 0,
    checkPermission: (permission?: string) => {
        const { user } = get();
        if (user?.role?.name === 'superadmin') return true;
        if (!permission) return false;
        return get().permissions.includes(permission);
    },
    checkRolePermission: (permission?: string) => {
        const { role } = get();
        if (role?.name === 'superadmin') return true;
        if (!permission) return false;
        return get().permissions.includes(permission);
    },
    setPermissions: (permissions: string[]) => {
        const user = JSON.parse(window.sessionStorage.getItem('user') || '{}');
        const role = JSON.parse(window.sessionStorage.getItem('role') || '{}');
        set({ user, role });
        const allowedSettings = allSettings
            .map((setting: SettingsIF) => {
                const items = setting.items.filter((item: { permission: string }) => {
                    if (role?.name === 'superadmin') return true;
                    return permissions.includes(item.permission);
                });
                if (items.length === 0) return null;
                return {
                    ...setting,
                    items
                };
            })
            .filter((setting): setting is SettingsIF => setting !== null); // Type-safe filter to remove null values

        set({ permissions, settings: allowedSettings });
    },
    updateRefreshSidebar: () => {
        set({ refreshSidebar: get().refreshSidebar + 1 });
    }
}));

const allSettings: SettingsIF[] = [
    {
        name: 'User Management',
        iconName: 'Users',
        items: [
            {
                name: 'Users',
                iconName: 'Users',
                path: '/config/user/list',
                key: 'user',
                permission: 'read:user'
            }
        ]
    },
    {
        name: 'Role & Permissions',
        iconName: 'ShieldCheck',
        items: [
            {
                name: 'Modules',
                iconName: 'Package',
                path: '/config/module/list',
                key: 'module',
                permission: 'read:module'
            },
            {
                name: 'Features',
                iconName: 'Star',
                path: '/config/feature/list',
                key: 'feature',
                permission: 'read:feature'
            },
            {
                name: 'Roles',
                iconName: 'UserRoundCheck',
                path: '/config/role/list',
                key: 'role',
                permission: 'read:role'
            }
        ]
    },
    {
        name: 'Billing & Subscriptions',
        iconName: 'Receipt',
        items: [
            {
                name: 'Tenants',
                iconName: 'CalendarCheck',
                path: '/config/tenant/list',
                key: 'tenant',
                permission: 'read:tenant'
            },
            {
                name: 'Subscription Models',
                iconName: 'CalendarCheck',
                path: '/config/subscription-model/list',
                key: 'subscription-model',
                permission: 'read:subscription-model'
            }
        ]
    },
    {
        name: 'Builder Tools',
        iconName: 'Component',
        items: [
            {
                name: 'Formbuilder',
                iconName: 'BookText',
                path: '/config/formbuilder/list',
                key: 'formbuilder',
                permission: 'read:formbuilder'
            },
            {
                name: 'Tablebuilder',
                iconName: 'Sheet',
                path: '/config/tablebuilder/list',
                key: 'tablebuilder',
                permission: 'read:tablebuilder'
            },
            {
                name: 'Exportbuilder',
                iconName: 'Upload',
                path: '/config/exportbuilder/list',
                key: 'exportbuilder',
                permission: 'read:exportbuilder'
            },
            {
                name: 'Makez Agents',
                iconName: 'Upload',
                path: '/config/makez-agent/list',
                key: 'makez-agent',
                permission: 'read:makez-agent'
            }
        ]
    },
    {
        name: 'Docsnap',
        iconName: 'Book',
        items: [
            {
                name: 'Comments',
                iconName: 'MessageSquareText',
                path: '/config/comment',
                key: 'comment',
                permission: 'read:comment'
            },
            {
                name: 'Prompt Tuning',
                iconName: 'SquareTerminal',
                path: '/config/prompt-tuning',
                key: 'prompt-tuning',
                permission: 'read:prompt-tuning'
            }
        ]
    }
];

