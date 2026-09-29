import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useDashboardApi } from '../hooks/useDashboardApi';
import { useDashboardState } from '../hooks/dashboardContext';
import { formatDate } from '../../../builders/tablebuilder/render-tablebuilder/utils/formatDate';
import SkeletonLoader from './SkeletonLoader';
import { RecordStatusCustomUI } from '../../docsnap/record/list-record/components/RecordStatusCustomUI';
import { usePermissionStore } from '../../../zustand-store/PermissionStore';
import { Polink } from '../../docsnap/record/list-record/ListRecordComponent';
import { useExtractionStore } from '../../../zustand-store/extractionStore';

const RecentFilesCardComponent: React.FC<{ module: string }> = ({ module }) => {
    const { state, setState } = useDashboardState();
    const { checkPermission, user } = usePermissionStore();
    const { refreshRecord } = useExtractionStore();

    const navigate = useNavigate();
    const { getRecordsApi } = useDashboardApi();

    useEffect(() => {
        getRecordsApi();
    }, [refreshRecord, module]);

    let showPoLink = String(user?.tenant?.name).toLowerCase() === 'rehabmart' ? true : false;
    const showBlogLink = module === 'content-creation' ? true : false;

    showPoLink = showBlogLink ? false : showPoLink;

    const rowClickHandler = (row: any) => {
        if (module === 'document-generation') {
            navigate(`/document-generation/view/${row._id}`);
        } else if (module === 'content-creation') {
            navigate(`/content-creation/view/${row._id}`);
        } else if (module === 'transcript') {
            navigate(`/transcript/record/view/${row._id}`);
        } else {
            navigate(`/docsnap/record/view/${row._id}`);
        }
    };

    useEffect(() => {
        const selectedModule = sessionStorage.getItem('module');
        navigate(`/${selectedModule}`);
    }, [module]);

    return (
        <div className="flex h-auto flex-1 flex-col gap-y-3 overflow-y-hidden rounded-2xl border border-[#F9F0FF] bg-white px-3 lg:h-full lg:flex-1 lg:px-4">
            <div className="flex items-center justify-between px-4 pt-6">
                <div className="text-gray-800">Recent {module === 'data-entry' ? 'Data Entries' : module === 'content-creation' ? 'Contents' : 'Files'}</div>
                {state.records.length > 0 && checkPermission('read:record') && (
                    <span
                        onClick={() => navigate(`/${module}/record/list`)}
                        className="flex cursor-pointer items-center gap-2 text-sm font-light text-sky-600 hover:text-sky-600"
                    >
                        View All <ChevronRight size={14} className="text-sky-600" />
                    </span>
                )}
            </div>
            {!checkPermission('read:record') ? (
                <div className="flex h-full w-full flex-col items-center justify-center text-sm text-gray-400">
                    You do not have permission to view recent {state.module === 'docsnap' ? 'files' : 'entries'}
                </div>
            ) : state.loadingRecords ? (
                <SkeletonLoader />
            ) : state.records.length > 0 ? (
                <div className="h-full overflow-y-hidden">
                    <table className="min-w-full">
                        <thead className="sticky top-0 left-0 border-b border-gray-100 bg-white text-nowrap">
                            <tr>
                                <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">Name</th>
                                {state.module === 'transcript' && <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">Patient ID</th>}
                                {state.module === 'docsnap' && <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">Document No.</th>}
                                <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">Extracted By</th>
                                {showPoLink && <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">Assigned To</th>}
                                <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">Status</th>
                                {showPoLink && <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">PO Link</th>}
                                {showBlogLink && <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">Blog Link</th>}
                                {/* {!showPoLink && <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">Document Date</th>} */}
                                <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">Completed On</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {state.records.map((row, idx) => (
                                <tr key={idx} className="cursor-pointer" onClick={() => rowClickHandler(row)}>
                                    <td title={row.name} className="max-w-50 min-w-25 truncate px-5 py-4 text-sm font-light whitespace-nowrap text-gray-900">
                                        {row.name}
                                    </td>
                                    {state.module === 'transcript' && (
                                        <td className="max-w-50 min-w-25 px-5 py-4 text-sm font-light whitespace-nowrap text-gray-900">{row.patientId}</td>
                                    )}
                                    {state.module === 'docsnap' && (
                                        <td className="max-w-50 min-w-25 px-5 py-4 text-sm font-light whitespace-nowrap text-gray-900">
                                            {row.documentNumber ? row.documentNumber : 'N/A'}
                                        </td>
                                    )}
                                    <td className="max-w-50 min-w-25 px-5 py-4 text-sm font-light whitespace-nowrap text-gray-900">{row.extractedBy}</td>
                                    {showPoLink && (
                                        <td className="max-w-50 min-w-25 px-5 py-4 text-sm whitespace-nowrap">{row.assignedTo ? row.assignedTo : 'N/A'}</td>
                                    )}
                                    <td className="max-w-50 min-w-25 px-5 py-4 text-sm whitespace-nowrap">
                                        <RecordStatusCustomUI data={row} />
                                    </td>
                                    {showPoLink || showBlogLink ? (
                                        <td className="max-w-50 min-w-25 px-5 py-4 text-sm whitespace-nowrap">
                                            <Polink data={row} />
                                        </td>
                                    ) : null}
                                    <td className="max-w-50 min-w-25 px-7 py-4 text-sm font-light whitespace-nowrap text-gray-900">
                                        {formatDate(row.updatedAt)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="flex h-full w-full items-center justify-center rounded-2xl bg-white text-sm text-gray-400">
                    Your recently uploaded files will appear here
                </div>
            )}
        </div>
    );
};

export default RecentFilesCardComponent;
