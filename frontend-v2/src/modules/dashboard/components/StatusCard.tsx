import { ChevronRight, ThumbsUp, CheckCircle, Clock, AlertCircle, FileWarning } from 'lucide-react';
import { useDashboardState } from '../hooks/dashboardContext';
import { useEffect } from 'react';
import { useDashboardApi } from '../hooks/useDashboardApi';
import { useNavigate } from 'react-router-dom';
import { usePermissionStore } from '../../../zustand-store/PermissionStore';
import { useExtractionStore } from '../../../zustand-store/extractionStore';

export const StatusCardComponent: React.FC<{ module: string }> = ({ module }) => {
    const { state, setState } = useDashboardState();
    const { getStatusCountApi } = useDashboardApi();
    const navigate = useNavigate();
    const { checkPermission } = usePermissionStore();
    const { refreshRecord } = useExtractionStore();

    useEffect(() => {
        getStatusCountApi();
    }, [module, refreshRecord]);

    const statusItems = [
        {
            label: 'Processed Documents',
            count: state.statusCounts?.submitted || 0,
            icon: (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                    <ThumbsUp className="text-[#53c31c]" size={28} />
                </span>
            ),
            navigateTo: '/docsnap/record/list?status=submitted'
        },
        {
            label: 'Ready to Review',
            count: state.statusCounts?.extracted || 0,
            icon: (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                    <CheckCircle className="text-blue-500" size={28} />
                </span>
            ),
            navigateTo: '/docsnap/record/list?status=extracted'
        },
        {
            label: 'In Progress',
            count: state.statusCounts?.processing || 0,
            icon: (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
                    <Clock className="text-yellow-500" size={28} />
                </span>
            ),
            navigateTo: '/docsnap/record/list?status=processing'
        },
        {
            label: 'Invalid Files',
            count: state.statusCounts?.invalid || 0,
            icon: (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                    <FileWarning className="text-red-500" size={28} />
                </span>
            ),
            navigateTo: '/docsnap/record/list?status=invalid'
        },
        {
            label: 'Failed Files',
            count: state.statusCounts?.failed || 0,
            icon: (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                    <AlertCircle className="text-red-500" size={28} />
                </span>
            ),
            navigateTo: '/docsnap/record/list?status=failed'
        }
    ];

    if (!checkPermission('read:record')) {
        return (
            <div className="order-[-1] flex h-fit w-full flex-col gap-y-4 rounded-2xl border border-[#F9F0FF] bg-white px-5 py-6 lg:order-1 lg:h-full lg:w-100">
                <div className="flex items-center justify-between">
                    <div className="text-gray-800">Quick Summary</div>
                </div>
                <div className="flex flex-1 items-center justify-center text-sm text-gray-400">You do not have permission to view quick summary</div>
            </div>
        );
    }
    if (!state.loadingRecords && state.records?.length === 0) {
        return (
            <div className="order-[-1] flex h-fit w-full flex-col gap-y-4 rounded-2xl border border-[#F9F0FF] bg-white px-5 py-6 lg:order-1 lg:h-full lg:w-100">
                <div className="flex items-center justify-between">
                    <div className="text-gray-800">Quick Summary</div>
                </div>
                <div className="flex flex-1 items-center justify-center text-gray-400">Quick Summary will appear here</div>
            </div>
        );
    }

    return (
        <div className="order-[-1] flex h-fit w-full flex-col gap-y-4 rounded-2xl border border-[#F9F0FF] bg-white px-5 py-6 lg:order-1 lg:h-full lg:w-100">
            <div className="flex items-center justify-between">
                <div className="text-gray-800">Quick Summary</div>
            </div>
            <div className="mb-1 flex items-center justify-between rounded-xl border bg-white px-4 py-4 xl:py-[17px]">
                {state.loadingStatusCounts ? (
                    <>
                        <div className="h-7 w-18 animate-pulse rounded bg-gray-200" />
                        <div className="h-5 w-30 animate-pulse rounded bg-gray-200" />
                    </>
                ) : (
                    <>
                        <div className="text-[24px]">{state.statusCounts?.total}</div>
                        <div className="text-sm font-light text-gray-500">Total Documents</div>
                    </>
                )}
            </div>
            {/* <div className="border-b" /> */}
            <div className="flex h-full flex-col gap-y-4">
                {statusItems.map((item, idx) => (
                    <div
                        onClick={() => navigate(item.navigateTo)}
                        key={item.label}
                        className="flex min-h-17 flex-1 cursor-pointer items-center justify-between rounded-xl border bg-white px-5 transition"
                    >
                        <div className="flex items-center gap-3">
                            {item.icon}
                            <div className="flex flex-col gap-1">
                                {state.loadingStatusCounts ? (
                                    <>
                                        <div className="h-[15px] w-30 animate-pulse rounded bg-gray-200" />
                                        <div className="h-[16px] w-10 animate-pulse rounded bg-gray-200" />
                                    </>
                                ) : (
                                    <>
                                        <span className="text-[12px] font-light text-gray-500">{item.label}</span>
                                        <span className="font-semibold text-gray-700">{item.count}</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <ChevronRight className="text-sky-500" size={22} />
                    </div>
                ))}
            </div>
        </div>
    );
};
