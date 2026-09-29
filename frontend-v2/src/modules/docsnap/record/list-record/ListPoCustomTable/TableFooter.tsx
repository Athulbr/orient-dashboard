import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import Tooltip from '../../../../../components/Tooltip';
import PageInput from '../../../../../builders/tablebuilder/render-tablebuilder/components/PageInput';
import { useListPoCustomTableState } from './hooks/listPoCustomTableStateContext';

const TableFooter: React.FC = () => {
    const { state, setState } = useListPoCustomTableState();

    const totalPages = Math.ceil(state.totalRecords / state.pageSize);
    const handleSetPage = (page: number) => setState(prev => ({ ...prev, page }));

    return (
        <div className="flex justify-between">
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500 pl-2">
                <span className="font-medium">
                    Showing&nbsp;{state.page * state.pageSize - state.pageSize + 1}&nbsp;to&nbsp;{state.page * state.pageSize}&nbsp;of&nbsp;{state.totalRecords}&nbsp;results
                </span>
            </div>
            <div className="relative mt-2 mr-4 flex items-center gap-2">
                <Tooltip text="First Page" position="top">
                    <PaginationButton onClick={() => handleSetPage(1)} disabled={state.page === 1} icon={<ChevronsLeft className="h-4 w-4" />} />
                </Tooltip>
                <Tooltip text="Prev Page" position="top">
                    <PaginationButton onClick={() => handleSetPage(state.page - 1)} disabled={state.page === 1} icon={<ChevronLeft className="h-4 w-4" />} />
                </Tooltip>
                <PageInput
                    page={state.page}
                    totalPages={totalPages}
                    setPage={pageNumber => setState(prev => ({ ...prev, page: pageNumber }))}
                />
                <Tooltip text="Next Page" position="top">
                    <PaginationButton onClick={() => handleSetPage(state.page + 1)} disabled={state.page === totalPages} icon={<ChevronRight className="h-4 w-4" />} />
                </Tooltip>
                <Tooltip text="Last Page" position="top">
                    <PaginationButton onClick={() => handleSetPage(totalPages)} disabled={state.page === totalPages} icon={<ChevronsRight className="h-4 w-4" />} />
                </Tooltip>
            </div>
        </div>
    );
};

export default TableFooter;

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
