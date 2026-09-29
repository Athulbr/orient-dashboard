import React, { useMemo, useState } from 'react';
import { branchTotals, fmt } from '../derive';
import type { ChannelKey, DerivedDay } from '../types';
import ChannelToggle from './ChannelToggle';

const SECTION_COLORS = ['#2563eb', '#7c3aed', '#0d9488', '#d97706', '#dc2626', '#4f46e5', '#059669'];

interface BranchesPanelProps {
    days: DerivedDay[];
    activeChannels: ChannelKey[];
}

const BranchesPanel: React.FC<BranchesPanelProps> = ({ days, activeChannels }) => {
    const [branchCh, setBranchCh] = useState<ChannelKey>(activeChannels[0] ?? 'bank');
    const branchStats = useMemo(() => branchTotals(days, branchCh), [days, branchCh]);
    const branchMax = Math.max(...branchStats.map(b => b.total_rows), 1);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Transactions by branch</span>
                <ChannelToggle value={branchCh} onChange={setBranchCh} />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3">
                    {branchStats.length === 0 ? (
                        <div className="py-8 text-center text-sm text-gray-400">No branch data for this channel.</div>
                    ) : (
                        branchStats.map((b, i) => (
                            <div key={b.branch} className="grid grid-cols-[minmax(0,280px)_1fr_52px] items-center gap-3.5">
                                <div className="truncate text-[12.5px] font-medium text-gray-700">{b.branch}</div>
                                <div className="h-3 overflow-hidden rounded-full border border-gray-200 bg-gray-50">
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{ width: `${(b.total_rows / branchMax) * 100}%`, background: SECTION_COLORS[i % SECTION_COLORS.length] }}
                                    />
                                </div>
                                <div className="text-right font-mono text-[13px] font-semibold text-gray-900">{fmt(b.total_rows)}</div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default BranchesPanel;
