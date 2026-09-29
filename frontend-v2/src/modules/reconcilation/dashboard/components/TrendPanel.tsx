import React, { useState } from 'react';
import { CHANNEL_META, fmt, inr } from '../derive';
import type { ChannelKey, DerivedChannel, DerivedDay } from '../types';
import ChannelToggle from './ChannelToggle';

interface TrendPanelProps {
    days: DerivedDay[];
    activeChannels: ChannelKey[];
}

const TrendPanel: React.FC<TrendPanelProps> = ({ days, activeChannels }) => {
    const [dailyCh, setDailyCh] = useState<ChannelKey>(activeChannels[0] ?? 'bank');

    const dailyVals = days.map(d => d[dailyCh]);
    const dailyMax = Math.max(...dailyVals.map(v => (v ? v.total_rows : 0)), 1);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Transactions per day, split into auto-cleared vs manual review</span>
                <ChannelToggle value={dailyCh} onChange={setDailyCh} />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex h-64 items-end gap-5 pt-2">
                    {days.map(d => {
                        const a = d[dailyCh];
                        if (!a) return <div key={d.date} className="flex flex-1 flex-col items-center" />;
                        const manualInDay = Math.min(a.hv_counted, a.total_rows);
                        const autoInDay = a.total_rows - manualInDay;
                        const h = (v: number) => Math.max((v / dailyMax) * 100, 0);
                        return (
                            <div key={d.date} className="flex h-full flex-1 flex-col items-center">
                                <div className="mb-2 font-mono text-sm font-semibold text-gray-900">{fmt(a.total_rows)}</div>
                                <div className="flex w-full max-w-[96px] flex-1 flex-col justify-end gap-0.5">
                                    <div
                                        className="min-h-[2px] rounded transition-all"
                                        style={{
                                            height: `${h(manualInDay)}%`,
                                            backgroundImage: 'repeating-linear-gradient(-45deg, #f59e0b, #f59e0b 5px, #fbbf24 5px, #fbbf24 10px)'
                                        }}
                                        title={`${fmt(a.hv_counted)} manual review`}
                                    />
                                    <div className="min-h-[2px] rounded bg-emerald-500 transition-all" style={{ height: `${h(autoInDay)}%` }} />
                                </div>
                                <div className="mt-2.5 text-center text-xs font-medium text-gray-500">
                                    {d.date.slice(0, 5)}
                                    <div className="text-[10px] text-gray-400">
                                        {a.autoPct}% auto · {a.txn_folders} runs
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="mt-2 flex justify-end border-t border-gray-100 pt-2 text-[10px] text-gray-400">peak {fmt(dailyMax)} txns</div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                <table className="w-full text-[13px]">
                    <thead>
                        <tr className="border-b border-gray-200">
                            {['Day', 'Channel', 'Accounts', 'Total transactions', 'Human verif.', 'Auto-cleared', 'Branches', 'Value (\u20B9)'].map((h, i) => (
                                <th
                                    key={h}
                                    className={
                                        'py-2.5 px-3 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 ' + (i >= 2 ? 'text-right' : 'text-left')
                                    }
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {days.flatMap(d =>
                            activeChannels.map(ch => {
                                const a: DerivedChannel | null = d[ch];
                                if (!a) return null;
                                const m = CHANNEL_META[ch];
                                return (
                                    <tr key={d.date + ch} className="border-b border-gray-100 last:border-0">
                                        <td className="px-3 py-3 font-mono tabular-nums">{d.date}</td>
                                        <td className="px-3 py-3">
                                            <span className="inline-flex items-center gap-2 font-medium">
                                                <span className={`h-2 w-2 rounded-sm ${m.dot}`} />
                                                {m.label}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-right font-mono tabular-nums">{a.txn_folders}</td>
                                        <td className="px-3 py-3 text-right font-mono tabular-nums">{fmt(a.total_rows)}</td>
                                        <td className="px-3 py-3 text-right font-mono tabular-nums text-amber-600">{fmt(a.hv_counted)}</td>
                                        <td className="px-3 py-3 text-right">
                                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-[11.5px] font-semibold text-emerald-600">
                                                {a.autoPct}%
                                            </span>
                                        </td>
                                        <td className="px-3 py-3 text-right font-mono tabular-nums">{a.branches.length}</td>
                                        <td className="px-3 py-3 text-right font-mono tabular-nums">{inr(a.amount)}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default TrendPanel;
