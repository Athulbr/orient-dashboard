import type { ChannelAgg, ChannelKey, ChannelTotals, DashboardData, DerivedChannel, DerivedDay, GrandTotals, BranchStat } from './types';

/** Auto-cleared = unique transactions that did NOT need human verification. */
export function deriveChannel(a: ChannelAgg): DerivedChannel {
    const auto = Math.max(a.unique_txn - a.hv_counted, 0);
    const autoPct = a.unique_txn ? Math.round((100 * auto) / a.unique_txn) : 0;
    const manualPct = a.unique_txn ? Math.round((100 * a.hv_counted) / a.unique_txn) : 0;
    return { ...a, auto, autoPct, manualPct };
}

export function deriveDays(data: DashboardData): DerivedDay[] {
    return data.days.map(d => ({
        date: d.date,
        bank: d.channels.bank ? deriveChannel(d.channels.bank) : null,
        qr: d.channels.qr ? deriveChannel(d.channels.qr) : null,
        gateway: d.channels.gateway ? deriveChannel(d.channels.gateway) : null
    }));
}

export function channelTotals(days: DerivedDay[], ch: ChannelKey): ChannelTotals {
    const t: ChannelTotals = {
        folders: 0,
        total_rows: 0,
        unique_txn: 0,
        hv_counted: 0,
        amount: 0,
        branches: new Set<string>(),
        sections: {},
        auto: 0,
        autoPct: 0
    };
    for (const d of days) {
        const a = d[ch];
        if (!a) continue;
        t.folders += a.txn_folders;
        t.total_rows += a.total_rows;
        t.unique_txn += a.unique_txn;
        t.hv_counted += a.hv_counted;
        t.amount += a.amount;
        a.branches.forEach(b => t.branches.add(b));
        Object.entries(a.section_totals).forEach(([k, v]) => {
            t.sections[k] = (t.sections[k] || 0) + v;
        });
    }
    t.auto = Math.max(t.unique_txn - t.hv_counted, 0);
    t.autoPct = t.unique_txn ? Math.round((100 * t.auto) / t.unique_txn) : 0;
    return t;
}

export function grandTotals(channels: ChannelTotals[]): GrandTotals {
    const branches = new Set<string>();
    let unique = 0, hv = 0, folders = 0, rows = 0, amount = 0;
    for (const t of channels) {
        t.branches.forEach(b => branches.add(b));
        unique += t.unique_txn;
        hv += t.hv_counted;
        folders += t.folders;
        rows += t.total_rows;
        amount += t.amount;
    }
    const auto = Math.max(unique - hv, 0);
    return {
        folders,
        rows,
        unique,
        hv,
        amount,
        branches: branches.size,
        auto,
        autoPct: unique ? Math.round((100 * auto) / unique) : 0
    };
}

/** Per-branch totals for a channel, using the pipeline's row-level branch_totals
 *  (a single "all_branches" file can span many branch sections, so this must
 *  NOT be approximated from one branch per folder). */
export function branchTotals(days: DerivedDay[], ch: ChannelKey): BranchStat[] {
    const map = new Map<string, BranchStat>();
    for (const d of days) {
        const a = d[ch];
        if (!a) continue;
        for (const [name, n] of Object.entries(a.branch_totals)) {
            const cur = map.get(name) || { branch: name, total_rows: 0 };
            cur.total_rows += n;
            map.set(name, cur);
        }
    }
    return Array.from(map.values()).sort((a, b) => b.total_rows - a.total_rows);
}

// ---- formatting ----
export const fmt = (n: number) => n.toLocaleString('en-IN');

export const inr = (n: number) =>
    n >= 1e7 ? '\u20B9' + (n / 1e7).toFixed(2) + ' Cr' : n >= 1e5 ? '\u20B9' + (n / 1e5).toFixed(2) + ' L' : '\u20B9' + fmt(Math.round(n));

// Platform blue/gray palette (per modules/reconcilation/app.module.css) — one
// accent per channel, all pulled from the standard Tailwind scale so they
// compose with the rest of the module's utility classes.
export const CHANNEL_META: Record<
    ChannelKey,
    { label: string; sub: string; dot: string; text: string; bg: string; border: string; bar: string }
> = {
    bank: {
        label: 'Bank',
        sub: 'Cheque / statement matching',
        dot: 'bg-blue-500',
        text: 'text-blue-600',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        bar: 'bg-blue-500'
    },
    qr: {
        label: 'QR / UPI',
        sub: 'UPI / QR settlement matching',
        dot: 'bg-violet-500',
        text: 'text-violet-600',
        bg: 'bg-violet-50',
        border: 'border-violet-200',
        bar: 'bg-violet-500'
    },
    gateway: {
        label: 'Gateway',
        sub: 'Payment gateway settlement matching',
        dot: 'bg-teal-500',
        text: 'text-teal-600',
        bg: 'bg-teal-50',
        border: 'border-teal-200',
        bar: 'bg-teal-500'
    }
};
