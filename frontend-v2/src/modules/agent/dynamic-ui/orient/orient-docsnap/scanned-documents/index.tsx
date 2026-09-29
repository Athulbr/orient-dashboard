import React from 'react';
import { Loader2, AlertCircle, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useScannedDocuments } from './useScannedDocuments';
import ScannedDocumentsHeader from './ScannedDocumentsHeader';
import ScannedDocumentCard from './ScannedDocumentCard';
import PaginationButton from './PaginationButton';

/**
 * ScannedDocuments page.
 *
 * Responsibilities:
 * - Orchestrates the useScannedDocuments hook
 * - Renders the header, loading/error/empty states, document list, and pagination
 * - Contains no business logic itself — delegates everything to hooks and sub-components
 */
interface ScannedDocumentsProps {
    onBack?: () => void;
}

const ScannedDocuments: React.FC<ScannedDocumentsProps> = ({ onBack }) => {
    const {
        documents,
        isLoading,
        error,
        total,
        totalPages,
        currentPage,
        perPage,
        statusFilter,
        branchFilter,
        dateRange,
        searchQuery,
        setCurrentPage,
        setStatusFilter,
        setBranchFilter,
        setDateRange,
        setSearchQuery,
        fetchDocuments,
        handleReset,
        handleExport,
        isExporting
    } = useScannedDocuments();

    return (
        <div className="font-[DM_Sans,Segoe_UI,sans-serif] h-full flex-1 w-full bg-gray-50 flex flex-col">
            {/* ── Header / Filter bar ─────────────────────────────── */}
            <ScannedDocumentsHeader
                onBack={onBack}
                documentCount={documents.length}
                isLoading={isLoading}
                statusFilter={statusFilter}
                branchFilter={branchFilter}
                dateRange={dateRange}
                searchQuery={searchQuery}
                onStatusChange={setStatusFilter}
                onBranchChange={setBranchFilter}
                onDateRangeChange={setDateRange}
                onSearchChange={setSearchQuery}
                onRefresh={() => fetchDocuments()}
                onReset={handleReset}
                onExport={handleExport}
                isExporting={isExporting}
            />

            {/* ── Content ─────────────────────────────────────────── */}
            <div className="flex-1 p-5">
                {isLoading ? (
                    <LoadingState />
                ) : error ? (
                    <ErrorState message={error} onRetry={() => fetchDocuments()} />
                ) : documents.length === 0 ? (
                    <EmptyState onReset={handleReset} />
                ) : (
                    <div className="flex flex-col gap-2">
                        {documents.map((doc, idx) => (
                            <ScannedDocumentCard key={doc._id || idx} doc={doc} onRefresh={() => fetchDocuments()} />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Pagination ──────────────────────────────────────── */}
            {!isLoading && !error && documents.length > 0 && (
                <div className="px-5 py-3 flex items-center justify-between border-t border-gray-200 bg-white sticky bottom-0 z-10">
                    <p className="text-xs text-gray-500">
                        Showing{' '}
                        <span className="font-bold text-gray-700">
                            {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, total)}
                        </span>{' '}
                        of <span className="font-bold text-gray-700">{total}</span> documents
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
        <p className="text-sm font-medium">Loading scanned documents…</p>
    </div>
);

const ErrorState: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
    <div className="flex flex-col items-center justify-center py-20 gap-3 bg-red-50 border border-red-200 rounded-xl text-red-600">
        <AlertCircle size={28} />
        <p className="font-semibold">Failed to load documents</p>
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
        <p className="font-semibold text-gray-500">No documents found</p>
        <p className="text-sm">Try adjusting your search or filter criteria.</p>
        <button onClick={onReset} className="mt-1 text-sm text-blue-600 hover:underline cursor-pointer">
            Clear filters
        </button>
    </div>
);

export default ScannedDocuments;
