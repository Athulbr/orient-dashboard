import React from 'react';
import { fmt } from '../derive';
import type { GrandTotals } from '../types';

interface KpiStripProps {
    grand: GrandTotals;
    dayCount: number;
    channelLabels: string;
}

const KpiStrip: React.FC<KpiStripProps> = ({ grand, dayCount, channelLabels }) => {
    const kpis = [
        { hero: true, cap: 'Total transactions', big: fmt(grand.rows), foot: `${fmt(grand.branches)} branches · ${dayCount} days` },
        { cap: 'Auto-cleared', big: grand.autoPct + '%', foot: `${fmt(grand.auto)} needed no review` },
        { cap: 'Human verification', big: fmt(grand.hv), foot: 'sent for manual check' },
        { cap: 'Branches covered', big: fmt(grand.branches), foot: 'across the network' },
        { cap: 'Account runs', big: fmt(grand.folders), foot: channelLabels }
    ];

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {kpis.map((k, i) => (
                <div
                    key={i}
                    className={cxCard(k.hero)}
                >
                    <div className={k.hero ? 'text-xs font-medium text-blue-100' : 'text-xs font-medium text-gray-500'}>{k.cap}</div>
                    <div className={cxBig(k.hero)}>{k.big}</div>
                    <div className={k.hero ? 'mt-0.5 text-xs text-blue-200' : 'mt-0.5 text-xs text-gray-400'}>{k.foot}</div>
                </div>
            ))}
        </div>
    );
};

const cxCard = (hero?: boolean) =>
    hero
        ? 'rounded-xl border border-blue-700 bg-gradient-to-br from-blue-600 to-blue-800 p-4 shadow-sm'
        : 'rounded-xl border border-gray-200 bg-white p-4 shadow-sm';

const cxBig = (hero?: boolean) =>
    hero ? 'mt-2 font-mono text-2xl font-semibold tracking-tight text-white' : 'mt-2 font-mono text-2xl font-semibold tracking-tight text-gray-900';

export default KpiStrip;
