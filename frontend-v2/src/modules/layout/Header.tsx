import { CircleUser, Menu } from 'lucide-react';
import { MakezLogoHeader } from '../../assets/svg-icons/MakezLogoHeader';
import { useToastStore } from '../../components/toast/ToastStore';
import { useNavigate } from 'react-router-dom';
import { Dropdown } from '../../components/Dropdown';
import ExtractionFloatingWindowNew from '../docsnap/upload-document-new/ExtractionFloatingWindow';
import httpRequest from '../../global-utils/httpRequest';
import { SingleSelect } from '../../components/SingleSelect';
import { useEffect, useState } from 'react';
import { cn } from '../../global-utils/twMerge';
import { config } from '../../config/default';
import { usePermissionStore } from '../../zustand-store/PermissionStore';

interface HeaderComponentIF {
    showSidebar?: boolean;
    setShowSidebar: (state: boolean) => void;
}

const HeaderComponent: React.FC<HeaderComponentIF> = ({ showSidebar, setShowSidebar }) => {
    const toast = useToastStore();
    const navigate = useNavigate();
    const [tenantList, setTenantList] = useState([]);
    const { setPermissions } = usePermissionStore();
    const [roleList, setRoleList] = useState<any[]>([]);
    const { updateRefreshSidebar } = usePermissionStore();
    const selectedTenantFromSessionStorage = window?.sessionStorage?.getItem('selectedTenant') || '';
    const selectedRoleFromSessionStorage = JSON.parse(window?.sessionStorage?.getItem('role') || '{}');

    const user = JSON.parse(window?.sessionStorage.getItem(`${'user'}`) as string);
    const recent: string[] = JSON.parse(localStorage.getItem('recentlyUsedTenant') || '[]');

    // Return tenant dropdown options: 'All Tenants', recently used tenants, then others
    const getTenantOptions = () => {
        const baseOptions = [...tenantList];
        try {
            const recentOptions = recent.map(id => baseOptions.find((o: any) => o.value === id)).filter(Boolean) as any[];
            const remaining = baseOptions.filter((o: any) => !recent.includes(o.value || ''));
            return [{ label: 'All Tenants', value: 'all' }, ...recentOptions, ...remaining];
        } catch (err) {
            return [{ label: 'All Tenants', value: 'all' }, ...tenantList];
        }
    };

    useEffect(() => {
        if (user?.role?.name !== 'superadmin') return;

        const fetchData = async () => {
            try {
                const [tenantList, roleList] = await Promise.all([
                    httpRequest('POST', `${config.nodeApiUrl}/tenant/option-list`, {}),
                    httpRequest('POST', `${config.nodeApiUrl}/role/option-list`, {})
                ]);

                setTenantList(tenantList?.data);
                setRoleList(roleList?.data);
            } catch (error) {
                console.error('Failed to load tenant/role list', error);
            }
        };

        fetchData();
    }, []);

    const updateRolePermission = async (id: string) => {
        try {
            if (!id || id === 'all') {
                window?.sessionStorage?.setItem('permissions', JSON.stringify([]));
                window?.sessionStorage?.setItem('role', JSON.stringify({ name: user?.role?.name, _id: user?.role?._id }));
                setPermissions([]); // reflect immediately
                return;
            }
            const res = await httpRequest('GET', `${config.nodeApiUrl}/role/${id}`);
            const features = res?.data?.features || [];
            window?.sessionStorage?.setItem('permissions', JSON.stringify(features));
            const featureKeys = features.map((f: any) => f.key);
            setPermissions(featureKeys); // this triggers Sidebar to re-render
            if (features?.length > 0) {
                window.location.reload();
            }
        } catch (error) {
            console.error('Failed to load role permission list', error);
        }
    };

    const logOut = async () => {
        setTimeout(() => {
            const isOrientSSO = !!window.sessionStorage.getItem('orientClientId');
            window.sessionStorage.clear();
            const redirectTarget = isOrientSSO ? '/auth/logout-message' : '/auth/login';
            window?.location?.replace(redirectTarget);
        }, 2000);
        await httpRequest('POST', `${config.nodeApiUrl}/auth/logout`, {});
        toast.success('Logged out successfully');
    };
    const onChangeDropDown = (e: string) => {
        if (e === 'Logout') logOut();
        if (e === 'Account') navigate(`/user/account/${user._id}`);
    };

    const navigateToHome = () => {
        if (localStorage.getItem('is_developer') === 'true') {
            navigate('/');
            return;
        }
        if (Number(sessionStorage.getItem('branch_id')) > 0) return;
        navigate('/');
    };

    return (
        <div className="flex min-h-16 justify-between bg-[#012D56]">
            {!showSidebar && (
                <div tabIndex={0} className="flex h-17 w-16 items-center justify-center md:hidden">
                    <Menu onClick={() => setShowSidebar(true)} className="cursor-pointer" color="white" size={30} />
                </div>
            )}
            <div tabIndex={0} className={cn('flex h-full cursor-pointer items-center md:pl-4', showSidebar && 'pl-4')} onClick={() => navigateToHome()}>
                <MakezLogoHeader />
            </div>
            <div className="flex flex-1 items-center justify-end">
                <div className="hidden items-center gap-6 px-6 md:flex">
                    {user?.role?.name === 'superadmin' && (
                        <>
                            <SingleSelect
                                className="min-w-40"
                                value={selectedTenantFromSessionStorage}
                                onValueChange={e => {
                                    // Save selected tenant id to 'recentlyUsedTenant', newest first.so that it can be used to sort tenant options in the dropdown
                                    if (e && e !== 'all') {
                                        const cur: string[] = JSON.parse(localStorage.getItem('recentlyUsedTenant') || '[]');
                                        const filtered = cur.filter(id => id !== e);
                                        filtered.unshift(e);
                                        localStorage.setItem('recentlyUsedTenant', JSON.stringify(filtered));
                                    }
                                    sessionStorage.setItem('selectedTenant', e);
                                    window.location.reload();
                                }}
                                placeholder="Select Tenant"
                                options={getTenantOptions()}
                            />

                            <SingleSelect
                                className="min-w-40"
                                value={selectedRoleFromSessionStorage?._id}
                                onValueChange={e => {
                                    const allOptions = [{ label: 'All Roles', value: 'all' }, ...roleList];
                                    const selectedOption = allOptions.find((role: { label: string; value: string }) => role.value === e);
                                    sessionStorage.setItem('role', JSON.stringify({ name: selectedOption?.label || '', _id: e }));
                                    updateRolePermission(e);
                                }}
                                placeholder="Select Role"
                                options={[{ label: 'All Roles', value: 'all' }, ...roleList]}
                            />
                        </>
                    )}
                    <Dropdown onChange={onChangeDropDown} options={['Account', 'Logout']}>
                        <span className="flex items-center gap-2 text-sm text-gray-300 capitalize">
                            <CircleUser size={20} className="cursor-pointer text-gray-300 hover:text-white" />
                            {user?.firstName}
                        </span>
                    </Dropdown>
                </div>
            </div>
            <ExtractionFloatingWindowNew />
        </div>
    );
};

export default HeaderComponent;
