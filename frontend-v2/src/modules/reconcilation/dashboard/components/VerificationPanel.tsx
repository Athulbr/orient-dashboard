import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { fmt } from '../derive';
import type { ChannelKey, ChannelTotals } from '../types';
import ChannelToggle from './ChannelToggle';

const SECTION_COLORS = ['#2563eb', '#7c3aed', '#0d9488', '#d97706', '#dc2626', '#4f46e5', '#059669'];

interface VerificationPanelProps {
    totals: Record<ChannelKey, ChannelTotals>;
    activeChannels: ChannelKey[];
}

const VerificationPanel: React.FC<VerificationPanelProps> = ({ totals, activeChannels }) => {
    const [hvCh, setHvCh] = useState<ChannelKey>(activeChannels[0] ?? 'bank');

    const hvSections = Object.entries(totals[hvCh].sections)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);
    const hvMax = Math.max(...hvSections.map(([, v]) => v), 1);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Where manual effort goes</span>
                <ChannelToggle value={hvCh} onChange={setHvCh} />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3">
                    {hvSections.length === 0 ? (
                        <div className="py-8 text-center text-sm text-gray-400">No human-verification items for this channel.</div>
                    ) : (
                        hvSections.map(([name, v], i) => {
                            const code = name.replace(/^SECTION\s+/, '').match(/^([A-Z]\d?)\s*-\s*/);
                            const rest = name.replace(/^SECTION\s+[A-Z]\d?\s*-\s*/, '');
                            return (
                                <div key={name} className="grid grid-cols-[minmax(0,280px)_1fr_52px] items-center gap-3.5">
                                    <div className="truncate text-[12.5px] font-medium text-gray-700">
                                        {code && <span className="text-gray-400">{code[1]} · </span>}
                                        {rest}
                                    </div>
                                    <div className="h-3 overflow-hidden rounded-full border border-gray-200 bg-gray-50">
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{ width: `${(v / hvMax) * 100}%`, background: SECTION_COLORS[i % SECTION_COLORS.length] }}
                                        />
                                    </div>
                                    <div className="text-right font-mono text-[13px] font-semibold text-gray-900">{fmt(v)}</div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="mt-4 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
                    <Info size={14} className="mt-0.5 flex-none text-amber-500" />
                    <span>Pending-clearance timing gaps (book-only / bank-only) are excluded — this is review work only.</span>
                </div>
            </div>
        </div>
    );
};

export default VerificationPanel;
