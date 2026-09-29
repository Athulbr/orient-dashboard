import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTablebuilderSettings } from '../../create-tablebuilder/hooks/useTablebuilderSettingsContext';
import { useTablebuilderState } from '../hooks/useTablebuilderStateContext';
import { useFetchDataFromApi } from '../hooks/useFetchDataFromApi';
import useTablepersistance from '../../../../hooks/useTablepersistance';
import { useEffect, useState } from 'react';
import { Button } from '../../../../components/Button';
import Tooltip from '../../../../components/Tooltip';
import PageInput from '../components/PageInput';

export function TableFooter() {
    return (
        <div className="flex flex-wrap-reverse items-center justify-between gap-2">
            <DocumentsDetails />
            <SelectedDocumentsCount />
            <PaginationComponent />
        </div>
    );
}

// ============================================================================================================================================

const DocumentsDetails = () => {
    const { settings, state } = useTablebuilderState();
    const { pagination } = settings;
    const { total, page, pageRows } = state;

    if (!pagination.showPaginaion || total === 0) return null;

    if (!pagination.showPaginaionDetails) return <div className="w-47"></div>;

    const start = total > 0 ? (page - 1) * pageRows + 1 : 0;
    const end = Math.min(page * pageRows, total);

    return (
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
            <span className="font-medium">
                Showing&nbsp;{start}&nbsp;to&nbsp;{end}&nbsp;of&nbsp;{total}
                &nbsp;results
            </span>
        </div>
    );
};

// ============================================================================================================================================

const SelectedDocumentsCount = () => {
    const { state, settings } = useTablebuilderState();

    if (state.selectedIds.length === 0 || !settings.rowSelection.showSelectedRowCount) return null;

    return (
        <div className="mt-2 text-sm text-gray-500">
            Selected&nbsp;Documents:&nbsp;
            <span className="text-blue-400">{state.selectedIds.length}</span>
        </div>
    );
};

// ============================================================================================================================================

const PaginationComponent = () => {
    const { state, settings, setState } = useTablebuilderState();
    const { getDataFromApi } = useFetchDataFromApi();

    const { total, page, pageRows } = state;
    const { pagination } = settings;

    const totalPages = Math.ceil(total / pageRows);

    const { setPageQueryParam } = useTablepersistance();

    const setPage = (pageNumber: number) => {
        setState(prev => ({ ...prev, page: pageNumber }));
        setPageQueryParam(pageNumber);
        getDataFromApi({ page: pageNumber });
    };
    if (!pagination.showPaginaion || total === 0) return null;

    return (
        <div className="relative mt-2 mr-4 flex items-center gap-2">
            <Tooltip text="First Page" position="top">
                <PaginationButton onClick={() => setPage(1)} disabled={page === 1} icon={<ChevronsLeft className="h-4 w-4" />} />
            </Tooltip>
            <Tooltip text="Prev Page" position="top">
                <PaginationButton onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} icon={<ChevronLeft className="h-4 w-4" />} />
            </Tooltip>
           {/* <span className="cursor-pointer rounded-lg border-1 border-gray-100 px-4 py-2 text-sm hover:bg-gray-50">
                Page {page} of {totalPages}
            </span> */}
            <PageInput page={page} totalPages={totalPages} setPage={setPage} />
            <Tooltip text="Next Page" position="top">
                <PaginationButton
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages}
                    icon={<ChevronRight className="h-4 w-4" />}
                />
            </Tooltip>
            <Tooltip text="Last Page" position="top">
                <PaginationButton onClick={() => setPage(totalPages)} disabled={page >= totalPages} icon={<ChevronsRight className="h-4 w-4" />} />
            </Tooltip>
        </div>
    );
};

type PaginationButtonProps = {
    onClick: () => void;
    disabled: boolean;
    icon: React.ReactNode;
};

const PaginationButton: React.FC<PaginationButtonProps> = ({ onClick, disabled, icon }) => (
    <button
        className="cursor-pointer rounded-lg border p-2 hover:bg-gray-200 disabled:opacity-50 disabled:hover:cursor-default disabled:hover:bg-white"
        onClick={onClick}
        disabled={disabled}
    >
        {icon}
    </button>
);
