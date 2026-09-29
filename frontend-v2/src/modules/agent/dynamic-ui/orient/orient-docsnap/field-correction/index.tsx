import React, { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Search, X } from 'lucide-react';
import DateTimePicker from '../../../../../../components/DateTimePicker';
import BackButton from '../../../../../../components/BackButton';
import FieldsTab from './FieldsTab';
import { fetchExportData } from './api';

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

const getTodayRange = (): { startDate: string; endDate: string } => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return {
        startDate: toLocalISOStringWithOffset(start),
        endDate: toLocalISOStringWithOffset(end)
    };
};

const getYesterdayRange = (): { startDate: string; endDate: string } => {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    return {
        startDate: toLocalISOStringWithOffset(start),
        endDate: toLocalISOStringWithOffset(end)
    };
};

const getDayBeforeYesterdayRange = (): { startDate: string; endDate: string } => {
    const start = new Date();
    start.setDate(start.getDate() - 2);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() - 2);
    end.setHours(23, 59, 59, 999);
    return {
        startDate: toLocalISOStringWithOffset(start),
        endDate: toLocalISOStringWithOffset(end)
    };
};

const formatLabel = (path: string) => {
    return path
        .split('.')
        .map(part => {
            const spaced = part.replace(/_/g, ' ');
            return spaced.charAt(0).toUpperCase() + spaced.slice(1);
        })
        .join(' > ');
};

interface FieldCorrectionsPageProps {
    onBack?: () => void;
}

const FieldCorrectionsPage: React.FC<FieldCorrectionsPageProps> = ({ onBack }) => {
    const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string }>(getTodayRange);
    const [searchTerm, setSearchTerm] = useState('');
    const [exporting, setExporting] = useState(false);

    const isSelectedPreset = useCallback(
        (presetRange: { startDate: string; endDate: string }) => {
            if (!dateRange.startDate || !dateRange.endDate) return false;
            const currentStart = dateRange.startDate.split('T')[0];
            const currentEnd = dateRange.endDate.split('T')[0];
            const targetStart = presetRange.startDate.split('T')[0];
            const targetEnd = presetRange.endDate.split('T')[0];
            return currentStart === targetStart && currentEnd === targetEnd;
        },
        [dateRange]
    );

    const handleExport = async () => {
        try {
            setExporting(true);
            const res = await fetchExportData('fields', dateRange.startDate, dateRange.endDate, searchTerm);
            if (res.success) {
                const wb = XLSX.utils.book_new();
                const fields = res.data;
                const rows: any[] = [];
                fields.forEach((field: any) => {
                    rows.push({ A: 'Field Path:', B: formatLabel(field.path) });
                    rows.push({
                        A: 'Order Number',
                        B: 'Order Type',
                        C: 'EON Number',
                        D: 'Initial Value',
                        E: 'Corrected Value',
                        F: 'Submitted At'
                    });
                    if (field.corrections && field.corrections.length > 0) {
                        field.corrections.forEach((c: any) => {
                            rows.push({
                                A: `${c.correctedOrderId?.orderNumber}` || 'N/A',
                                B: c.correctedOrderId?.orderType || 'N/A',
                                C: c.correctedOrderId?.eonNumber || 'N/A',
                                D: c.initialValue || '',
                                E: c.value || '',
                                F: c.submittedAt ? new Date(c.submittedAt).toLocaleString() : ''
                            });
                        });
                    }
                    rows.push({}); // Empty row to separate
                });
                const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: true });
                if (!ws['!merges']) ws['!merges'] = [];
                let r = 0;
                fields.forEach((field: any) => {
                    ws['!merges']?.push({ s: { r: r, c: 1 }, e: { r: r, c: 5 } });
                    r += (field.corrections?.length || 0) + 3;
                });
                XLSX.utils.book_append_sheet(wb, ws, 'Fields');
                XLSX.writeFile(wb, `Corrected_Fields_${new Date().getTime()}.xlsx`);
            }
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export data');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-gray-50 overflow-hidden">
            {/* Header Section */}
            <header className="bg-white border-b border-slate-200 px-6 py-3 sticky top-0 z-40 shadow-xs w-full">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
                    {/* Title & Navigation */}
                    <div className="flex items-center gap-3">
                        <BackButton onClick={onBack} />
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Field Corrections</h1>
                            </div>
                        </div>
                    </div>

                    {/* Actions & Controls */}
                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Search Input */}
                        <div className="relative flex items-center min-w-[220px]">
                            <Search size={15} className="absolute left-3 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Search by path..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-8 py-2.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 placeholder-slate-400 transition-all"
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} className="absolute right-2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full" title="Clear search">
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* Quick selection */}
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                            {/* <button
                                type="button"
                                onClick={() => setDateRange({ startDate: '', endDate: '' })}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                    !dateRange.startDate && !dateRange.endDate
                                        ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                }`}
                            >
                                All
                            </button> */}
                            <button
                                type="button"
                                onClick={() => setDateRange(getTodayRange())}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                                    isSelectedPreset(getTodayRange())
                                        ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                }`}
                            >
                                Today
                            </button>
                            <button
                                type="button"
                                onClick={() => setDateRange(getYesterdayRange())}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                                    isSelectedPreset(getYesterdayRange())
                                        ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                }`}
                            >
                                Yesterday
                            </button>
                            <button
                                type="button"
                                onClick={() => setDateRange(getDayBeforeYesterdayRange())}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                                    isSelectedPreset(getDayBeforeYesterdayRange())
                                        ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80 font-bold'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                }`}
                            >
                                Day before Yesterday
                            </button>
                        </div>
                        {/* Date range picker */}
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                            <DateTimePicker onChange={setDateRange} initialStartDate={dateRange.startDate} initialEndDate={dateRange.endDate} showTime={false} />
                        </div>

                        {/* Excel Export Button */}
                        <button
                            onClick={handleExport}
                            disabled={exporting}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-xs transition-colors disabled:opacity-50"
                            title="Export data to Microsoft Excel (.xlsx)"
                        >
                            <FileSpreadsheet size={16} />
                            {exporting ? 'Exporting...' : 'Export Excel'}
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col">
                <div className="flex-1 bg-white rounded-sm border border-gray-200 flex flex-col overflow-hidden">
                    <FieldsTab dateRange={dateRange} searchTerm={searchTerm} />
                </div>
            </div>
        </div>
    );
};

export default FieldCorrectionsPage;
