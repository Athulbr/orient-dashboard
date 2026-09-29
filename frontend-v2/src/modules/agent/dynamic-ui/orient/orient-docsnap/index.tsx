import React, { useState, useCallback, useEffect } from 'react';
import OrderCard from './OrderCard';
import { Order } from './types';
import { DialogComponent } from '../../../../../components/DialogComponent';
import { Button } from '../../../../../components/Button';
import CreateOrderDialog from './CreateOrderDialog';
import { SingleSelect } from '../../../../../components/SingleSelect';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Loader2 } from 'lucide-react';
import Tooltip from '../../../../../components/Tooltip';
import PageInput from '../../../../../builders/tablebuilder/render-tablebuilder/components/PageInput';
import OrderFiltersBar from './OrderFilters';
import { useOrders, AgentSettings } from './useOrders';
import FullScreenLoader from '../../../../../components/FullScreenLoader';
import clientLoggerNew from '../../../../../global-utils/clientLoggerNew';

// ── Props (#19 — properly typed instead of `any`) ─────────────
interface OrientDocsnapUserInterfaceIF {
    agentSettings: AgentSettings;
}
const user = JSON.parse(window?.sessionStorage?.getItem('user') || '{}');

// ── Helper: parse initial search from URL once (#9) ───────────
const getInitialSearch = (): string => (typeof window !== 'undefined' ? sessionStorage.getItem('order_no') || '' : '');
const getInitialBranchId = (): string => (typeof window !== 'undefined' ? sessionStorage.getItem('branch_id') || '' : '');

const OrientDocsnapUserInterface: React.FC<OrientDocsnapUserInterfaceIF> = ({ agentSettings }) => {
    // ── Filter & Pagination state ─────────────────────────────
    const initialSearch = React.useMemo(getInitialSearch, []);
    const initialBranchId = React.useMemo(getInitialBranchId, []);

    const [searchQuery, setSearchQuery] = useState(initialSearch);
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(initialSearch);
    const [statusFilter, setStatusFilter] = useState('all');
    const [branchFilter, setBranchFilter] = useState(initialBranchId || 'all');
    const [orderTypeFilter, setOrderTypeFilter] = useState('all');
    const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string }>({ startDate: '', endDate: '' });
    const [perPage, setPerPage] = useState('10');
    const [currentPage, setCurrentPage] = useState(1);

    // ── Dialog state ──────────────────────────────────────────
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);

    useEffect(() => {
        const checkQueue = () => {
            try {
                const queueData = localStorage.getItem('clientLoggerQueue');
                if (queueData) {
                    const queue = JSON.parse(queueData);
                    if (Array.isArray(queue) && queue.length > 0) {
                        clientLoggerNew();
                    }
                }
            } catch (error) {
                console.error('Failed to parse clientLoggerQueue', error);
            }
        };

        const intervalId = setInterval(checkQueue, 5 * 60 * 1000); // 5 minutes
        return () => clearInterval(intervalId);
    }, []);

    // Track fullscreen docsnap dialog for back-button handling
    const [docsnapOpen, setDocsnapOpen] = useState(false);
    const docsnapOpenRef = React.useRef(docsnapOpen);
    useEffect(() => {
        docsnapOpenRef.current = docsnapOpen;
    }, [docsnapOpen]);

    // ── Back-button guard (#21 — removed dead window.close hack) ──
    useEffect(() => {
        window.history.pushState({ page: 'orient-docsnap' }, '');

        const handlePopState = () => {
            if (!docsnapOpenRef.current) {
                setTimeout(() => {
                    const confirmLeave = window.confirm('Are you sure you want to leave this page?');
                    if (!confirmLeave) {
                        window.history.pushState({ page: 'orient-docsnap' }, '');
                    }
                    // #21 — removed the unreliable window.open/close/about:blank hack.
                    // If the user confirms, the browser will naturally handle navigation.
                }, 10);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // ── Show page scrollbar (overrides global display:none) ───
    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = `
            ::-webkit-scrollbar {
                display: block !important;
                width: 8px !important;
                height: 6px !important;
            }
            ::-webkit-scrollbar-track {
                background: #e5e5eb;
            }
            ::-webkit-scrollbar-thumb {
                background: #b3b3b7;
                border-radius: 4px;
            }
            ::-webkit-scrollbar-thumb:hover {
                background: #484646;
            }
        `;
        document.head.appendChild(style);
        return () => {
            document.head.removeChild(style);
        };
    }, []);

    // ── Search debounce ───────────────────────────────────────
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // ── #11 & #20 — Reset page to 1 when filters or perPage change ──
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchQuery, statusFilter, branchFilter, orderTypeFilter, dateRange, perPage]);

    // ── Custom hook for all order data & API logic (#14) ──────
    const {
        orders,
        totalPages,
        isLoadingOrders,
        ordersError,
        uploadingOrders,
        initiatingUploadOrders,
        proceedingOrders,
        initiatingOrders,
        retryingOrders,
        fetchData,
        handleDeleteOrder,
        handleLinkEmail,
        handleUploadFiles,
        handleRemoveUploadedFile,
        handleRemoveWebDocument,
        handleRemoveEmailDocument,
        handleProceed,
        handleCreateOrder,
        handleUpdateOrder,
        setOrders
    } = useOrders({ searchQuery, debouncedSearchQuery, statusFilter, branchFilter, orderTypeFilter, dateRange, perPage, currentPage }, agentSettings);

    // ── Handle inline order updates (e.g. eonBookingNumber from docsnap) ──
    const handleInlineOrderUpdate = useCallback(
        (updatedOrder: Order) => {
            setOrders(prev => prev.map(o => (o.orderDetails.orderNumber === updatedOrder.orderDetails.orderNumber ? updatedOrder : o)));
        },
        [setOrders]
    );

    // Trigger fetch whenever the memoised fetchData changes
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // ── Filter reset ──────────────────────────────────────────

    const handleResetFilters = useCallback(() => {
        // TODO: remove
        setSearchQuery('');
        setDebouncedSearchQuery('');
        setStatusFilter('all');
        // setBranchFilter('');
        setOrderTypeFilter('all');
        setDateRange({ startDate: '', endDate: '' });
        setPerPage('10');
        setCurrentPage(1);
    }, []);

    // ── Render ────────────────────────────────────────────────
    return (
        <div className="min-h-full w-full bg-gray-50 flex flex-col">
            {/* Filter bar (#15) */}
            <OrderFiltersBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                orderTypeFilter={orderTypeFilter}
                onOrderTypeChange={setOrderTypeFilter}
                branchFilter={branchFilter}
                onBranchChange={setBranchFilter}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                onReset={handleResetFilters}
                onCreateOrder={() => setShowCreateDialog(true)}
            />

            {/* Order list */}
            <div className="p-4 flex flex-col gap-5 flex-grow">
                {isLoadingOrders ? (
                    <FullScreenLoader className="relative bottom-1" />
                ) : ordersError ? (
                    <div className="flex flex-col items-center justify-center py-20 text-red-500 bg-red-50 border border-red-200 rounded-lg">
                        <p className="font-semibold text-lg mb-2">Error loading orders</p>
                        <p>{ordersError}</p>
                        <Button onClick={fetchData} className="mt-4">
                            Retry
                        </Button>
                    </div>
                ) : (
                    <>
                        {orders.map(order => (
                            <OrderCard
                                key={`${order.orderDetails.orderNumber}-${order.orderDetails.orderId}`} // #12 — more stable key
                                order={order}
                                onLinkEmail={handleLinkEmail}
                                onUploadFiles={handleUploadFiles}
                                onRemoveUploadedFile={handleRemoveUploadedFile}
                                onRemoveWebDocument={handleRemoveWebDocument}
                                onRemoveEmailDocument={handleRemoveEmailDocument}
                                onProceed={handleProceed}
                                onEdit={order => setEditingOrder(order)}
                                onDelete={handleDeleteOrder}
                                isProceeding={proceedingOrders[order.orderDetails.orderNumber] || false}
                                isInitiating={initiatingOrders[order.orderDetails.orderNumber] || false}
                                isUploading={uploadingOrders[order.orderDetails.orderNumber] || false}
                                isInitiatingUpload={initiatingUploadOrders[order.orderDetails.orderNumber] || false}
                                isRetrying={retryingOrders[order.orderDetails.orderNumber] || false}
                                onDocsnapOpen={() => setDocsnapOpen(true)}
                                onDocsnapClose={() => setDocsnapOpen(false)}
                                onOrderUpdate={handleInlineOrderUpdate}
                            />
                        ))}
                        {orders.length === 0 && (
                            <div className="flex items-center justify-center p-12 text-gray-500 bg-white border border-gray-200 rounded-lg">No orders match the current filter criteria.</div>
                        )}
                    </>
                )}
            </div>

            {/* Pagination */}
            <div className="p-4 py-3 flex items-center justify-end gap-4 border-t border-gray-200 bg-white sticky bottom-0 z-10 w-full">
                <div className="flex items-center gap-4 text-sm text-gray-500 pl-2">
                    <SingleSelect
                        position="top"
                        value={perPage}
                        onValueChange={setPerPage}
                        options={[
                            { label: '10', value: '10' },
                            { label: '20', value: '20' },
                            { label: '50', value: '50' },
                            { label: '100', value: '100' }
                        ]}
                        size="sm"
                    />
                </div>
                <div className="relative flex items-center gap-2 pr-4">
                    <Tooltip text="First Page" position="top">
                        <PaginationButton onClick={() => setCurrentPage(1)} disabled={currentPage === 1 || totalPages === 0} icon={<ChevronsLeft className="h-4 w-4" />} />
                    </Tooltip>
                    <Tooltip text="Prev Page" position="top">
                        <PaginationButton onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || totalPages === 0} icon={<ChevronLeft className="h-4 w-4" />} />
                    </Tooltip>

                    <PageInput page={currentPage} totalPages={totalPages === 0 ? 1 : totalPages} setPage={pageNumber => setCurrentPage(pageNumber)} />
                    <Tooltip text="Next Page" position="top">
                        <PaginationButton
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages || totalPages === 0}
                            icon={<ChevronRight className="h-4 w-4" />}
                        />
                    </Tooltip>
                    <Tooltip text="Last Page" position="top">
                        <PaginationButton onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || totalPages === 0} icon={<ChevronsRight className="h-4 w-4" />} />
                    </Tooltip>
                </div>
            </div>

            {/* Create / Edit dialog */}
            <DialogComponent
                className="w-[800px]"
                isOpen={showCreateDialog || !!editingOrder}
                closeDialog={() => {
                    setShowCreateDialog(false);
                    setEditingOrder(null);
                }}
                name={editingOrder ? 'Edit Order' : 'Create New Order'}
            >
                {(showCreateDialog || editingOrder) && (
                    <CreateOrderDialog
                        initialOrder={editingOrder || undefined}
                        onClose={() => {
                            setShowCreateDialog(false);
                            setEditingOrder(null);
                        }}
                        onCreate={async newOrder => {
                            await handleCreateOrder(newOrder);
                            setShowCreateDialog(false);
                        }}
                        onUpdate={async updatedOrder => {
                            await handleUpdateOrder(updatedOrder);
                            setEditingOrder(null);
                        }}
                    />
                )}
            </DialogComponent>
        </div>
    );
};

// ── Small helper component ────────────────────────────────────
type PaginationButtonProps = {
    onClick: () => void;
    disabled: boolean;
    icon: React.ReactNode;
};

const PaginationButton: React.FC<PaginationButtonProps> = ({ onClick, disabled, icon }) => (
    <button className="cursor-pointer rounded-lg border p-2 hover:bg-gray-200 disabled:opacity-50 disabled:hover:cursor-default disabled:hover:bg-white" onClick={onClick} disabled={disabled}>
        {icon}
    </button>
);

export default OrientDocsnapUserInterface;
