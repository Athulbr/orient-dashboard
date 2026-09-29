import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CHANNEL_META, fmt } from '../derive';
import type { ChannelKey, DerivedDay } from '../types';

interface BranchDailyPanelProps {
    days: DerivedDay[];
    activeChannels: ChannelKey[];
}

interface BranchDailyRow {
    date: string;
    branch: string;
    total: number;
}

const toInputDate = (date: string) => {
    const [day, month, year] = date.split('-');
    return year && month && day ? `${year}-${month}-${day}` : '';
};

const fromInputDate = (date: string) => {
    const [year, month, day] = date.split('-');
    return year && month && day ? `${day}-${month}-${year}` : '';
};

const dateToTime = (date: string) => {
    const [day, month, year] = date.split('-').map(Number);
    return year && month && day ? new Date(year, month - 1, day).getTime() : 0;
};

const BranchDailyPanel: React.FC<BranchDailyPanelProps> = ({ days, activeChannels }) => {
    const [channel, setChannel] = useState<ChannelKey>(activeChannels[0] ?? 'bank');
    const [startDate, setStartDate] = useState(days[0]?.date ?? '');
    const [endDate, setEndDate] = useState(days[days.length - 1]?.date ?? '');
    const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
    const [isBranchMenuOpen, setIsBranchMenuOpen] = useState(false);
    const branchMenuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!activeChannels.includes(channel)) {
            setChannel(activeChannels[0] ?? 'bank');
        }
    }, [activeChannels, channel]);

    useEffect(() => {
        if (!isBranchMenuOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!branchMenuRef.current?.contains(event.target as Node)) {
                setIsBranchMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isBranchMenuOpen]);

    const dateOptions = useMemo(() => days.map(d => d.date), [days]);
    const firstDate = dateOptions[0] ?? '';
    const lastDate = dateOptions[dateOptions.length - 1] ?? '';
    const startTime = dateToTime(startDate || firstDate);
    const endTime = dateToTime(endDate || lastDate);
    const rangedDays = useMemo(
        () => days.filter(day => dateToTime(day.date) >= startTime && dateToTime(day.date) <= endTime),
        [days, startTime, endTime]
    );

    useEffect(() => {
        if (!dateOptions.length) return;
        if (!startDate || dateToTime(startDate) < dateToTime(firstDate) || dateToTime(startDate) > dateToTime(lastDate)) {
            setStartDate(firstDate);
        }
        if (!endDate || dateToTime(endDate) < dateToTime(firstDate) || dateToTime(endDate) > dateToTime(lastDate)) {
            setEndDate(lastDate);
        }
        if (dateToTime(startDate) > dateToTime(endDate)) {
            setEndDate(startDate);
        }
    }, [dateOptions.length, endDate, firstDate, lastDate, startDate]);

    const branchOptions = useMemo(() => {
        const branches = new Set<string>();
        for (const day of rangedDays) {
            const data = day[channel];
            if (!data) continue;
            Object.keys(data.branch_totals).forEach(name => branches.add(name));
        }
        return Array.from(branches).sort((a, b) => a.localeCompare(b));
    }, [rangedDays, channel]);

    useEffect(() => {
        const validBranches = selectedBranches.filter(name => branchOptions.includes(name));
        if (validBranches.length !== selectedBranches.length) {
            setSelectedBranches(validBranches);
        }
    }, [branchOptions, selectedBranches]);

    const hasBranchFilter = selectedBranches.length > 0;
    const branchSummary = !hasBranchFilter
        ? 'All branches'
        : selectedBranches.length === 1
          ? selectedBranches[0]
          : `${selectedBranches.length} branches`;

    const toggleBranch = (name: string) => {
        setSelectedBranches(current => (current.includes(name) ? current.filter(branchName => branchName !== name) : [...current, name]));
    };

    const clearFilters = () => {
        setChannel(activeChannels[0] ?? 'bank');
        setStartDate(firstDate);
        setEndDate(lastDate);
        setSelectedBranches([]);
    };

    const rows = useMemo<BranchDailyRow[]>(() => {
        const nextRows: BranchDailyRow[] = [];
        const selected = new Set(selectedBranches);
        for (const day of rangedDays) {
            const data = day[channel];
            if (!data) continue;

            Object.entries(data.branch_totals).forEach(([name, total]) => {
                if (!hasBranchFilter || selected.has(name)) {
                    nextRows.push({ date: day.date, branch: name, total });
                }
            });
        }
        return nextRows.sort((a, b) => a.date.localeCompare(b.date) || b.total - a.total);
    }, [rangedDays, channel, selectedBranches, hasBranchFilter]);

    const dailyTotals = useMemo(
        () =>
            rangedDays.map(day => {
                const data = day[channel];
                const selected = new Set(selectedBranches);
                const total =
                    !hasBranchFilter
                        ? Object.values(data?.branch_totals ?? {}).reduce((sum, value) => sum + value, 0)
                        : Object.entries(data?.branch_totals ?? {}).reduce((sum, [name, value]) => sum + (selected.has(name) ? value : 0), 0);
                return { date: day.date, total, autoPct: data?.autoPct ?? 0, runs: data?.txn_folders ?? 0 };
            }),
        [rangedDays, channel, selectedBranches, hasBranchFilter]
    );

    const totalTransactions = rows.reduce((sum, row) => sum + row.total, 0);
    const maxDaily = Math.max(...dailyTotals.map(day => day.total), 1);
    const meta = CHANNEL_META[channel];

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-gray-500">Daily transactions by branch for the selected reconciliation channel</span>
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={channel}
                        onChange={event => setChannel(event.target.value as ChannelKey)}
                        className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none transition-colors hover:border-blue-300 focus:border-blue-400"
                    >
                        {activeChannels.map(ch => (
                            <option key={ch} value={ch}>
                                {CHANNEL_META[ch].label}
                            </option>
                        ))}
                    </select>
                    <input
                        type="date"
                        value={toInputDate(startDate)}
                        min={toInputDate(firstDate)}
                        max={toInputDate(lastDate)}
                        onChange={event => {
                            const value = fromInputDate(event.target.value);
                            setStartDate(value);
                            if (dateToTime(value) > dateToTime(endDate)) setEndDate(value);
                        }}
                        className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none transition-colors hover:border-blue-300 focus:border-blue-400"
                    />
                    <input
                        type="date"
                        value={toInputDate(endDate)}
                        min={toInputDate(firstDate)}
                        max={toInputDate(lastDate)}
                        onChange={event => {
                            const value = fromInputDate(event.target.value);
                            setEndDate(value);
                            if (dateToTime(value) < dateToTime(startDate)) setStartDate(value);
                        }}
                        className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none transition-colors hover:border-blue-300 focus:border-blue-400"
                    />
                    <div ref={branchMenuRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setIsBranchMenuOpen(open => !open)}
                            className="flex h-9 min-w-[190px] max-w-[260px] cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none transition-colors hover:border-blue-300 focus:border-blue-400"
                        >
                            <span className="truncate">{branchSummary}</span>
                            <span className="text-gray-400">v</span>
                            </button>
                        {isBranchMenuOpen && (
                            <div className="absolute right-0 z-10 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
                                <button
                                    type="button"
                                    onClick={() => setSelectedBranches([])}
                                    className="mb-1 w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs font-medium text-blue-600 hover:bg-blue-50"
                                >
                                    All branches
                                </button>
                                {branchOptions.map(name => (
                                    <label key={name} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                                        <input
                                            type="checkbox"
                                            checked={selectedBranches.includes(name)}
                                            onChange={() => toggleBranch(name)}
                                            className="h-3.5 w-3.5 accent-blue-600"
                                        />
                                        <span className="truncate">{name}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={clearFilters}
                        className="h-9 cursor-pointer rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition-colors hover:border-blue-300 hover:text-blue-600"
                    >
                        Clear
                    </button>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                            <span className={`h-2 w-2 rounded-sm ${meta.dot}`} />
                            {meta.label}
                        </div>
                        <p className="mt-1 text-xs text-gray-400">{branchSummary}</p>
                    </div>
                    <div className="text-right">
                        <div className="font-mono text-xl font-semibold text-gray-900">{fmt(totalTransactions)}</div>
                        <div className="text-xs text-gray-400">transactions</div>
                    </div>
                </div>

                <div className="flex h-48 items-end gap-4 border-t border-gray-100 pt-5">
                    {dailyTotals.map(day => (
                        <div key={day.date} className="flex h-full flex-1 flex-col items-center">
                            <div className="mb-2 font-mono text-xs font-semibold text-gray-900">{fmt(day.total)}</div>
                            <div className="flex w-full max-w-[80px] flex-1 items-end">
                                <div
                                    className={`w-full min-h-[3px] rounded-t-md ${meta.bar} transition-all`}
                                    style={{ height: `${Math.max((day.total / maxDaily) * 100, day.total > 0 ? 3 : 0)}%` }}
                                />
                            </div>
                            <div className="mt-2 text-center text-xs font-medium text-gray-500">
                                {day.date.slice(0, 5)}
                                <div className="text-[10px] text-gray-400">
                                    {day.autoPct}% auto - {day.runs} runs
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className="border-b border-gray-200">
                            {['Day', 'Channel', 'Branch', 'Transactions'].map((heading, index) => (
                                <th
                                    key={heading}
                                    className={
                                        'px-3 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 ' +
                                        (index === 3 ? 'text-right' : 'text-left')
                                    }
                                >
                                    {heading}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-400">
                                    No branch transactions for this selection.
                                </td>
                            </tr>
                        ) : (
                            rows.map(row => (
                                <tr key={`${row.date}-${row.branch}`} className="border-b border-gray-100 last:border-0">
                                    <td className="px-3 py-3 font-mono tabular-nums">{row.date}</td>
                                    <td className="px-3 py-3">
                                        <span className="inline-flex items-center gap-2 font-medium">
                                            <span className={`h-2 w-2 rounded-sm ${meta.dot}`} />
                                            {meta.label}
                                        </span>
                                    </td>
                                    <td className="max-w-[420px] truncate px-3 py-3 text-gray-700">{row.branch}</td>
                                    <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-gray-900">{fmt(row.total)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default BranchDailyPanel;
