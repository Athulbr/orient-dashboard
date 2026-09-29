import React from 'react';
import { Loader2, AlertCircle, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useReconciliations } from './useReconciliations';
import ReconciliationHeader from './ReconciliationHeader';
import ReconciliationCard from './ReconciliationCard';
import PaginationButton from './PaginationButton';

const ListReconcillation: React.FC = () => {
    const {
        reconciliations,
        isLoading,
        error,
        total,
        totalPages,
        currentPage,
        perPage,
        transactionTypeFilter,
        dateRange,
        searchQuery,
        setCurrentPage,
        setTransactionTypeFilter,
        setDateRange,
        setSearchQuery,
        fetchReconciliations,
        handleReset
    } = useReconciliations();

    // React.useEffect(() => {
    //     const intervalId = setInterval(() => {
    //         fetchReconciliations(true);
    //     }, 30000);

    //     return () => clearInterval(intervalId);
    // }, [fetchReconciliations]);

    return (
        <div className="font-[DM_Sans,Segoe_UI,sans-serif] h-full flex-1 w-full bg-gray-50 flex flex-col">
            {/* ── Header / Filter bar ─────────────────────────────── */}
            <ReconciliationHeader
                reconciliationCount={total}
                isLoading={isLoading}
                transactionTypeFilter={transactionTypeFilter}
                dateRange={dateRange}
                searchQuery={searchQuery}
                onTransactionTypeChange={setTransactionTypeFilter}
                onDateRangeChange={setDateRange}
                onSearchChange={setSearchQuery}
                onRefresh={() => fetchReconciliations()}
                onReset={handleReset}
            />

            {/* ── Content ─────────────────────────────────────────── */}
            <div className="flex-1 p-5">
                {isLoading ? (
                    <LoadingState />
                ) : error ? (
                    <ErrorState message={error} onRetry={() => fetchReconciliations()} />
                ) : reconciliations.length === 0 ? (
                    <EmptyState onReset={handleReset} />
                ) : (
                    <div className="flex flex-col gap-2">
                        {reconciliations.map(rec => (
                            <ReconciliationCard key={rec._id} reconciliation={rec} />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Pagination ──────────────────────────────────────── */}
            {!isLoading && !error && reconciliations.length > 0 && (
                <div className="px-5 py-3 flex items-center justify-between border-t border-gray-200 bg-white sticky bottom-0 z-10">
                    <p className="text-xs text-gray-500">
                        Showing{' '}
                        <span className="font-bold text-gray-700">
                            {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, total)}
                        </span>{' '}
                        of <span className="font-bold text-gray-700">{total}</span> reconciliations
                    </p>

                    <div className="flex items-center gap-1.5">
                        <PaginationButton onClick={() => setCurrentPage(1)} disabled={currentPage === 1} icon={<ChevronsLeft size={15} />} title="First page" />
                        <PaginationButton onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} icon={<ChevronLeft size={15} />} title="Previous page" />
                        <span className="px-3 py-1 text-xs font-semibold text-gray-600">
                            Page {currentPage} of {totalPages}
                        </span>
                        <PaginationButton
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            icon={<ChevronRight size={15} />}
                            title="Next page"
                        />
                        <PaginationButton onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} icon={<ChevronsRight size={15} />} title="Last page" />
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Private state components ───────────────────────────────────

const LoadingState: React.FC = () => (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
        <Loader2 size={32} className="animate-spin text-blue-500" />
        <p className="text-sm font-medium">Loading reconciliations…</p>
    </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
    <div className="flex flex-col items-center justify-center py-20 gap-3 bg-red-50 border border-red-200 rounded-xl text-red-600">
        <AlertCircle size={28} />
        <p className="font-semibold">Failed to load reconciliations</p>
        <p className="text-sm text-red-500">{message}</p>
        <button onClick={onRetry} className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer">
            Retry
        </button>
    </div>
);

const EmptyState: React.FC<{ onReset: () => void }> = ({ onReset }) => (
    <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white border border-gray-200 rounded-xl text-gray-400">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
            <Filter size={24} className="text-gray-300" />
        </div>
        <p className="font-semibold text-gray-500">No reconciliations found</p>
        <p className="text-sm">Try adjusting your search or filter criteria.</p>
        <button onClick={onReset} className="mt-1 text-sm text-blue-600 hover:underline cursor-pointer">
            Clear filters
        </button>
    </div>
);

export default ListReconcillation;
