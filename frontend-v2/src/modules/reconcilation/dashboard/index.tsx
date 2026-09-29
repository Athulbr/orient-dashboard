import React, { useMemo, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import ResultsTabs from '../components/ResultsTabs';
import { useDashboardData } from './useDashboardData';
import { channelTotals, deriveDays, grandTotals, CHANNEL_META } from './derive';
import type { ChannelKey } from './types';
import OverviewPanel from './components/OverviewPanel';
import TrendPanel from './components/TrendPanel';
import VerificationPanel from './components/VerificationPanel';
import BranchesPanel from './components/BranchesPanel';
import BranchDailyPanel from './components/BranchDailyPanel';
import KpiStrip from './components/KpiStrip';

const CHANNELS: ChannelKey[] = ['bank', 'qr', 'gateway'];

const ReconciliationDashboardPage: React.FC = () => {
    const { data, isLoading, error, refresh } = useDashboardData();
    const [activeTab, setActiveTab] = useState('overview');

    const days = useMemo(() => (data ? deriveDays(data) : []), [data]);
    const totals = useMemo(
        () => ({
            bank: channelTotals(days, 'bank'),
            qr: channelTotals(days, 'qr'),
            gateway: channelTotals(days, 'gateway')
        }),
        [days]
    );
    const grand = useMemo(() => grandTotals([totals.bank, totals.qr, totals.gateway]), [totals]);
    const activeChannels = CHANNELS.filter(ch => totals[ch].folders > 0);

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'trend', label: 'Daily Trend' },
        { id: 'verification', label: 'Human Verification', count: grand.hv, alert: grand.hv > 0 },
        { id: 'branches', label: 'Branches', count: grand.branches },
        { id: 'branch-daily', label: 'Branch Daily' }
    ];

    if (isLoading) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-gray-400">
                <Loader2 size={32} className="animate-spin text-blue-500" />
                <p className="text-sm font-medium">Loading dashboard…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mx-5 mt-5 flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 py-16 text-red-600">
                <AlertCircle size={28} />
                <p className="font-semibold">Failed to load the dashboard</p>
                <p className="text-sm text-red-500">{error}</p>
                <button
                    onClick={refresh}
                    className="mt-2 cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (!data || data.days.length === 0) {
        return (
            <div className="mx-5 mt-5 flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white py-24 text-gray-400">
                <p className="font-semibold text-gray-500">No reconciliations yet</p>
                <p className="text-sm">Once a bank, QR, or gateway reconciliation runs, it'll show up here automatically.</p>
            </div>
        );
    }

    const period = `${days[0].date}  \u2192  ${days[days.length - 1].date}`;

    return (
        <div className="font-[DM_Sans,Segoe_UI,sans-serif] h-full w-full flex-1 bg-gray-50 p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-gray-900">Reconciliation Dashboard</h1>
                    <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <span>{period}</span>
                        <span className="text-gray-300">·</span>
                        <span>{activeChannels.map(ch => CHANNEL_META[ch].label).join(' + ')}</span>
                    </div>
                </div>
                <button
                    onClick={refresh}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-blue-300 hover:text-blue-600"
                >
                    <RefreshCw size={13} />
                    Refresh
                </button>
            </div>

            <div className="mb-5">
                <KpiStrip grand={grand} dayCount={days.length} channelLabels={activeChannels.map(ch => CHANNEL_META[ch].label).join(' + ')} />
            </div>

            <ResultsTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
                {activeTab === 'overview' && <OverviewPanel activeChannels={activeChannels} totals={totals} />}
                {activeTab === 'trend' && <TrendPanel days={days} activeChannels={activeChannels} />}
                {activeTab === 'verification' && <VerificationPanel totals={totals} activeChannels={activeChannels} />}
                {activeTab === 'branches' && <BranchesPanel days={days} activeChannels={activeChannels} />}
                {activeTab === 'branch-daily' && <BranchDailyPanel days={days} activeChannels={activeChannels} />}
            </ResultsTabs>
        </div>
    );
};

export default ReconciliationDashboardPage;
