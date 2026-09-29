import { AudioLines, CircuitBoard, FilePenLine, FileText, Settings, X, LocateFixed, FileCheck, FileSpreadsheet, Calculator } from 'lucide-react';
import { cn } from '../../global-utils/twMerge';
import { useNavigate } from 'react-router-dom';
import { usePermissionStore } from '../../zustand-store/PermissionStore';
import { useProductTour } from '../inApp-Tour/hooks/useProductTour';

interface SidebarComponentIF {
    showSidebar?: boolean;
    setShowSidebar: (state: boolean) => void;
}

export const SidebarComponent: React.FC<SidebarComponentIF> = ({ showSidebar = false, setShowSidebar }) => {
    const sidebarMenuItems = [
        {
            name: 'DocSnap',
            icon: <FileCheck size={26} strokeWidth={2} className="text-white" />,
            path: '/docsnap',
            key: 'docsnap',
            permission: 'docsnap:module',
            description: 'Capture and extract data from documents instantly. Upload documents and let AI process them for you.'
        },
        {
            name: 'Data Entry',
            icon: <FilePenLine size={26} strokeWidth={2} className="text-white" />,
            path: '/data-entry',
            key: 'data-entry',
            permission: 'dataentry:module',
            description: 'Efficiently manage and input structured data with custom forms and validation.'
        },
        {
            name: 'Tracking ID',
            icon: <LocateFixed size={26} strokeWidth={2} className="text-white" />,
            path: '/invoice-tracking',
            key: 'invoice-tracking',
            permission: 'invoiceTracking:module',
            description: 'Track and monitor invoices, payment status, and manage your billing workflow.'
        },
        // {
        //     name: 'PPE Detection',
        //     icon: <UserSearch size={26} strokeWidth={2} className="text-white" />,
        //     path: '/ppe-detection',
        //     key: 'ppe-detection',
        //     permission: 'ppeDetection:module'
        // },
        {
            name: 'Transcription',
            icon: <AudioLines size={26} strokeWidth={2} className="text-white" />,
            path: '/transcription/record/list',
            key: 'transcription',
            permission: 'transcript:module',
            description: 'Convert audio and video recordings into accurate text transcriptions with AI.'
        },
        {
            name: 'SLD',
            icon: <CircuitBoard size={26} strokeWidth={2} className="text-white" />,
            path: '/sld',
            key: 'sld',
            permission: 'sld:module',
            description: 'Create and manage Single Line Diagrams for electrical systems and circuits.'
        },
        {
            name: 'Document Generation',
            icon: <FileText size={26} strokeWidth={2} className="text-white" />,
            path: '/document-generation',
            key: 'document-generation',
            permission: 'documentGeneration:module',
            description: 'Generate professional documents automatically from templates and data sources.'
        },

        {
            name: 'Content Creation',
            icon: <FileSpreadsheet size={26} strokeWidth={2} className="text-white" />,
            path: '/content-creation',
            key: 'content-creation',
            permission: 'contentCreation:module',
            description: 'Create and manage content with advanced tools for spreadsheets and data manipulation.'
        },
        {
            name: 'Tally',
            icon: <Calculator size={26} strokeWidth={2} className="text-white" />,
            path: '/tally',
            key: 'tally',
            permission: 'tally:module',
            description: 'Track and manage tallies with streamlined workflows and reporting.'
        }
    ];

    return (
        <>
            <DesktopSidebar sidebarMenuItems={sidebarMenuItems} />
            <MobileSidebar showSidebar={showSidebar} setShowSidebar={setShowSidebar} sidebarMenuItems={sidebarMenuItems} />
        </>
    );
};

interface DesktopSidebarIF {
    sidebarMenuItems: any[];
}

interface MobileSidebarIF {
    showSidebar?: boolean;
    setShowSidebar: (state: boolean) => void;
    sidebarMenuItems: any[];
}

const DesktopSidebar: React.FC<DesktopSidebarIF> = ({ sidebarMenuItems }) => {
    const { settings, checkPermission, checkRolePermission } = usePermissionStore();
    const module = sessionStorage.getItem('module');

    const navigate = useNavigate();

    // Filter items based on permissions for the tour
    const visibleItems = sidebarMenuItems.filter(item => checkRolePermission(item.permission));
    
    // Initialize product tour
    useProductTour({
        items: visibleItems,
        enabled: true
    });

    return (
        <div className={`hidden h-full min-w-16 max-w-16 pt-2 flex-col gap-2 bg-[#012D56] transition-all duration-300 ease-in-out md:flex`}>
            {sidebarMenuItems.map(item => {
                if (!checkRolePermission(item.permission)) return null;
                const isActive = item.key === module;
                // const isActive = location.pathname.includes(item.key) || item.key === module || (item.key === 'docsnap' && location.pathname === '/');
                return (
                    <div
                        onClick={() => {
                            sessionStorage.setItem('module', item.key);
                            navigate(item.path);
                        }}
                        key={item.key}
                        data-tour-id={item.key}
                        className={cn(
                            'group flex h-16 cursor-pointer hover:bg-blue-900 flex-col items-center justify-center rounded-md transition-all duration-200 relative',
                            isActive && 'bg-blue-900'
                        )}
                    >
                        <div className="min-h-8 ">{item.icon}</div>
                        <div className="invisible z-10 group-hover:visible absolute bottom-4 left-[101%] bg-blue-950 py-2 px-3 rounded-md transition-all duration-300">
                            <div className="text-xs text-nowrap text-white font-semibold">{item.name}</div>
                        </div>
                    </div>
                );
            })}
            {settings.length > 0 && checkPermission('read:settings') && (
                <div className={`flex flex-1 flex-col justify-end gap-4 pb-2 text-gray-400 items-center text-[10px]`}>
                    <div
                        onClick={() => navigate('/config/user/list')}
                        data-tour-id="settings"
                        className={cn('group flex h-16 cursor-pointer flex-col items-center justify-center rounded-md transition-all duration-200 relative')}
                    >
                        <div className="min-h-8 ">
                            <Settings size={26} strokeWidth={2} className="text-white" />
                        </div>
                        <div className="invisible z-10 group-hover:visible absolute bottom-4 left-[152%] bg-blue-950 py-2 px-3 rounded-md transition-all duration-300">
                            <div className="text-xs text-nowrap text-white font-semibold">Settings</div>
                        </div>
                    </div>
                    <span className="flex justify-center text-xs transition-opacity duration-300">V 1.0.0</span>
                </div>
            )}
        </div>
    );
};

const MobileSidebar = ({ showSidebar, setShowSidebar, sidebarMenuItems }: MobileSidebarIF) => {
    const { checkPermission } = usePermissionStore();
    const navigate = useNavigate();

    if (!showSidebar) return null;
    return (
        <div className="absolute top-0 left-0 z-20 flex h-screen w-screen bg-[#00000080] md:hidden">
            <div onClick={() => setShowSidebar(false)} className="flex h-full flex-1 justify-end">
                <div className="flex h-16 w-16 items-center justify-center">
                    <X className="cursor-pointer" color="white" size={20} />
                </div>
                <div className="absolute left-0 bottom-0 h-[calc(100vh-64px)] w-3/4 bg-[#012D56] flex flex-col gap-3 pt-3">
                    {sidebarMenuItems.map(item => {
                        if (!checkPermission(item.permission)) return null;
                        const isActive = location.pathname.includes(item.key) || (item.key === 'docsnap' && location.pathname === '/');
                        return (
                            <div
                                onClick={() => navigate(item.path)}
                                key={item.key}
                                className={cn(
                                    'group flex h-16 cursor-pointer flex-col items-start pl-4 justify-center rounded-md transition-all duration-200 relative hover:bg-blue-900',
                                    isActive && 'bg-blue-900'
                                )}
                            >
                                <div className="min-h-8 flex gap-2 items-center text-white">
                                    {item.icon} {item.name}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
