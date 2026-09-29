import { useState, useCallback, useEffect } from 'react';
import { config } from '../../../config/default';
import { DEFAULT_PAGE_SIZE } from './constants';
import type { Reconciliation, StatusFilter, TransactionTypeFilter, DateRange } from './types';

interface UseReconciliationsReturn {
    reconciliations: Reconciliation[];
    isLoading: boolean;
    error: string | null;
    total: number;
    totalPages: number;
    currentPage: number;
    perPage: number;
    statusFilter: StatusFilter;
    transactionTypeFilter: TransactionTypeFilter;
    dateRange: DateRange;
    setCurrentPage: (page: number) => void;
    setStatusFilter: (status: StatusFilter) => void;
    setTransactionTypeFilter: (type: TransactionTypeFilter) => void;
    setDateRange: (range: DateRange) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    fetchReconciliations: (silent?: boolean) => void;
    handleReset: () => void;
}

export const useReconciliations = (): UseReconciliationsReturn => {
    const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [transactionTypeFilter, setTransactionTypeFilter] = useState<TransactionTypeFilter>('all');
    const [dateRange, setDateRange] = useState<DateRange>({ startDate: '', endDate: '' });
    const [searchQuery, setSearchQuery] = useState('');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const perPage = DEFAULT_PAGE_SIZE;
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    // Reset to page 1 whenever any filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [statusFilter, transactionTypeFilter, dateRange, searchQuery]);

    const fetchReconciliations = useCallback(
        async (silent = false) => {
            if (!silent) setIsLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams({
                    page: currentPage.toString(),
                    limit: perPage.toString()
                });

                if (statusFilter !== 'all') params.append('status', statusFilter);
                if (transactionTypeFilter !== 'all') params.append('transactionType', transactionTypeFilter);
                if (dateRange.startDate) params.append('startDate', dateRange.startDate);
                if (dateRange.endDate) params.append('endDate', dateRange.endDate);
                if (searchQuery.trim()) params.append('searchQuery', searchQuery.trim());

                const token = localStorage.getItem('token');
                const response = await fetch(`${config.workflowService}/workflow/reconciliations?${params.toString()}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                const result = await response.json();
                if (result.success) {
                    setReconciliations(result.data);
                    setTotal(result.total);
                    setTotalPages(result.totalPages);
                } else {
                    throw new Error(result.error || 'Failed to fetch');
                }
            } catch (err: any) {
                setError(err?.message || 'Failed to load reconciliations.');
            } finally {
                if (!silent) setIsLoading(false);
            }
        },
        [currentPage, perPage, statusFilter, transactionTypeFilter, dateRange, searchQuery]
    );

    // Refetch whenever dependencies change
    useEffect(() => {
        fetchReconciliations();
    }, [fetchReconciliations]);

    const handleReset = () => {
        setStatusFilter('all');
        setTransactionTypeFilter('all');
        setDateRange({ startDate: '', endDate: '' });
        setSearchQuery('');
        setCurrentPage(1);
    };

    return {
        reconciliations,
        isLoading,
        error,
        total,
        totalPages,
        currentPage,
        perPage,
        statusFilter,
        transactionTypeFilter,
        dateRange,
        searchQuery,
        setCurrentPage,
        setStatusFilter,
        setTransactionTypeFilter,
        setDateRange,
        setSearchQuery,
        fetchReconciliations,
        handleReset
    };
};
