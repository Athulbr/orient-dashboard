import React, { useState, useEffect } from 'react';
import { RotateCw, X, ScanLine, Search, Download } from 'lucide-react';
import DateTimePicker from '../../../../../../components/DateTimePicker';
import { SingleSelect } from '../../../../../../components/SingleSelect';
import { Button } from '../../../../../../components/Button';
import BackButton from '../../../../../../components/BackButton';
import { STATIC_BRANCHES } from './constants';
import type { StatusFilter, DateRange } from './types';

interface ScannedDocumentsHeaderProps {
    onBack?: () => void;
    documentCount: number;
    isLoading: boolean;
    statusFilter: StatusFilter;
    branchFilter: string;
    dateRange: DateRange;
    searchQuery: string;
    onStatusChange: (status: StatusFilter) => void;
    onBranchChange: (branch: string) => void;
    onDateRangeChange: (range: DateRange) => void;
    onSearchChange: (query: string) => void;
    onRefresh: () => void;
    onReset: () => void;
    onExport: () => void;
    isExporting: boolean;
}

/**
 * Sticky top bar containing:
 * - Page title + document count
 * - Date range picker
 * - Status and branch filter dropdowns
 * - Refresh and reset-filters buttons
 */
const ScannedDocumentsHeader: React.FC<ScannedDocumentsHeaderProps> = ({
    onBack,
    documentCount,
    isLoading,
    statusFilter,
    branchFilter,
    dateRange,
    searchQuery,
    onStatusChange,
    onBranchChange,
    onDateRangeChange,
    onSearchChange,
    onRefresh,
    onReset,
    onExport,
    isExporting
}) => {
    const [localSearch, setLocalSearch] = useState(searchQuery);

    useEffect(() => {
        setLocalSearch(searchQuery);
    }, [searchQuery]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (localSearch !== searchQuery) {
                onSearchChange(localSearch);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [localSearch, onSearchChange, searchQuery]);

    const setQuickDate = (days: number, isYesterday = false) => {
        const end = new Date();
        const start = new Date();

        if (isYesterday) {
            start.setDate(start.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            end.setDate(end.getDate() - 1);
            end.setHours(23, 59, 59, 999);
        } else if (days === 0) {
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
        } else {
            start.setDate(start.getDate() - days);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
        }

        const toLocalISOStringWithOffset = (date: Date): string => {
            const pad = (num: number): string => String(num).padStart(2, '0');
            const year = date.getFullYear();
            const month = pad(date.getMonth() + 1);
            const day = pad(date.getDate());
            const hours = pad(date.getHours());
            const minutes = pad(date.getMinutes());
            const seconds = pad(date.getSeconds());
            const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

            const tzOffset = -date.getTimezoneOffset();
            const sign = tzOffset >= 0 ? '+' : '-';
            const tzHours = pad(Math.floor(Math.abs(tzOffset) / 60));
            const tzMinutes = pad(Math.abs(tzOffset) % 60);
            const offsetString = `${sign}${tzHours}:${tzMinutes}`;

            return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${offsetString}`;
        };

        onDateRangeChange({
            startDate: toLocalISOStringWithOffset(start),
            endDate: toLocalISOStringWithOffset(end)
        });
    };

    return (
        <div className="px-5 py-3 bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
            <div className="flex items-center gap-4">
                {/* Title */}
                <div className="flex items-center gap-3 flex-shrink-0">
                    <BackButton onClick={onBack} />
                    <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-200">
                        <ScanLine size={18} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 leading-tight">Scanned Documents</h1>
                    </div>
                </div>

                {/* Controls — pushed to the right */}
                <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
                    {/* Search field */}
                    <div className="relative w-40">
                        <input
                            type="text"
                            placeholder="Search..."
                            value={localSearch}
                            onChange={e => setLocalSearch(e.target.value)}
                            className="w-full h-10 pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-0.5 focus:ring-blue-400 focus:border-blue-400 bg-white text-gray-700"
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    </div>

                    {/* Date range picker */}
                    <div className="flex items-center justify-end gap-2">
                        <div className="flex items-center gap-0.5 py-1.5 bg-gray-100 p-1 rounded-md border border-gray-200">
                            <button
                                onClick={() => setQuickDate(0)}
                                className="px-2 py-1 text-[12px] font-medium text-gray-600 hover:text-gray-900 hover:bg-white hover:shadow-sm rounded transition-all"
                            >
                                Today
                            </button>
                            <button
                                onClick={() => setQuickDate(0, true)}
                                className="px-2 py-1 text-[12px] font-medium text-gray-600 hover:text-gray-900 hover:bg-white hover:shadow-sm rounded transition-all"
                            >
                                Yesterday
                            </button>
                            <button
                                onClick={() => setQuickDate(7)}
                                className="px-2 py-1 text-[12px] font-medium text-gray-600 hover:text-gray-900 hover:bg-white hover:shadow-sm rounded transition-all"
                            >
                                7D
                            </button>
                            <button
                                onClick={() => setQuickDate(30)}
                                className="px-2 py-1 text-[12px] font-medium text-gray-600 hover:text-gray-900 hover:bg-white hover:shadow-sm rounded transition-all"
                            >
                                30D
                            </button>
                        </div>
                        <DateTimePicker onChange={onDateRangeChange} initialStartDate={dateRange.startDate} initialEndDate={dateRange.endDate} />
                    </div>

                    {/* Status filter */}
                    <SingleSelect
                        className="min-w-32"
                        value={statusFilter}
                        onValueChange={val => onStatusChange(val as StatusFilter)}
                        options={[
                            { label: 'All Status', value: 'all' },
                            { label: 'Pending', value: 'pending' },
                            { label: 'Extracted', value: 'extracted' },
                            { label: 'Success', value: 'success' },
                            { label: 'Failed', value: 'failed' }
                        ]}
                    />

                    {/* Branch filter */}
                    <SingleSelect
                        className="min-w-32"
                        value={branchFilter}
                        onValueChange={onBranchChange}
                        options={[{ label: 'All Branches', value: 'all' }, ...STATIC_BRANCHES.map(b => ({ label: b, value: b }))]}
                    />

                    {/* Reset filters */}
                    <Button title="Reset Filters" startIcon={<X size={16} />} onClick={onReset} outlined></Button>

                    {/* Export */}
                    <Button onClick={onExport} disabled={isLoading || isExporting} outlined startIcon={<Download size={16} className={isExporting ? 'animate-bounce' : ''} />}>
                        Export
                    </Button>

                    {/* Refresh */}
                    <Button onClick={onRefresh} disabled={isLoading} outlined startIcon={<RotateCw size={16} className={isLoading ? 'animate-spin' : ''} />}>
                        Refresh
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ScannedDocumentsHeader;
