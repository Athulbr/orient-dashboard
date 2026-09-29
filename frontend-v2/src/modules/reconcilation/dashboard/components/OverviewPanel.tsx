import React from 'react';
import { Landmark, QrCode, Zap } from 'lucide-react';
import { CHANNEL_META, fmt, inr } from '../derive';
import type { ChannelKey, ChannelTotals } from '../types';
import { cx } from '../../utils/cx';

const CHANNEL_ICONS: Record<ChannelKey, React.FC<{ size?: number; className?: string }>> = {
    bank: Landmark,
    qr: QrCode,
    gateway: Zap
};

interface OverviewPanelProps {
    activeChannels: ChannelKey[];
    totals: Record<ChannelKey, ChannelTotals>;
}

const Stat: React.FC<{ v: string; k: string; className?: string }> = ({ v, k, className }) => (
    <div>
        <div className={cx('font-mono text-lg font-semibold text-gray-900', className)}>{v}</div>
        <div className="text-[11px] text-gray-500">{k}</div>
    </div>
);

const OverviewPanel: React.FC<OverviewPanelProps> = ({ activeChannels, totals }) => (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {activeChannels.map(ch => {
            const t = totals[ch];
            const m = CHANNEL_META[ch];
            const Icon = CHANNEL_ICONS[ch];
            const autoW = t.autoPct;
            const manW = 100 - t.autoPct;

            return (
                <div key={ch} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={cx('flex h-9 w-9 items-center justify-center rounded-lg', m.bg, m.text)}>
                                <Icon size={18} />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900">{m.label}</h3>
                                <div className="text-[11px] text-gray-500">{m.sub}</div>
                            </div>
                        </div>
                        <span className={cx('rounded-full px-2.5 py-1 text-[11px] font-medium', m.bg, m.text)}>{t.folders} runs</span>
                    </div>

                    <div className="mb-5 grid grid-cols-3 gap-3">
                        <Stat v={fmt(t.total_rows)} k="Total transactions" />
                        <Stat v={String(t.branches.size)} k="Branches" />
                        <Stat v={fmt(t.hv_counted)} k="Human verification" />
                        <Stat v={inr(t.amount)} k="Value reconciled" />
                        <Stat v={t.autoPct + '%'} k="Auto-cleared" className="text-emerald-600" />
                    </div>

                    <div>
                        <div className="mb-1.5 flex justify-between text-[11px] font-semibold">
                            <span className="text-emerald-600">Auto-cleared</span>
                            <span className="text-amber-600">Manual review</span>
                        </div>
                        <div className="flex h-7 overflow-hidden rounded-md border border-gray-200 bg-amber-50">
                            <div
                                className="flex items-center bg-emerald-500 pl-2.5 font-mono text-[11px] font-semibold text-white transition-all"
                                style={{ width: `${autoW}%` }}
                            >
                                {autoW > 12 ? `${autoW}%` : ''}
                            </div>
                            <div
                                className="flex items-center justify-end bg-transparent pr-2.5 font-mono text-[11px] font-semibold text-amber-700 transition-all"
                                style={{ width: `${manW}%` }}
                            >
                                {manW > 12 ? fmt(t.hv_counted) : ''}
                            </div>
                        </div>
                        <div className="mt-2 text-[11px] text-gray-500">
                            <b className="text-gray-700">{fmt(t.hv_counted)}</b> of <b className="text-gray-700">{fmt(t.total_rows)}</b> needed review —{' '}
                            <b className="text-gray-700">{t.autoPct}%</b> auto-cleared.
                        </div>
                    </div>
                </div>
            );
        })}
    </div>
);

export default OverviewPanel;
