// Data model produced by app.py's GET /reconcile/dashboard-data
// (built server-side by pipeline.py's build_dashboard_data()).

export interface FolderDetail {
    name: string;
    unique_txn: number;
    total_rows: number;
    hv_counted: number;
    branches: string[];
}

export interface ChannelAgg {
    txn_folders: number;
    total_rows: number;
    unique_txn: number;
    unique_parties: number;
    amount: number;
    hv_counted: number;
    hv_excluded: number;
    branches: string[];
    branch_totals: Record<string, number>;
    section_totals: Record<string, number>;
    automation_rate: number;
    auto_handled: number;
    folders: FolderDetail[];
}

export type ChannelKey = 'bank' | 'qr' | 'gateway';

export interface Day {
    date: string;
    channels: Partial<Record<ChannelKey, ChannelAgg>>;
}

export interface DashboardData {
    generated_from: string;
    days: Day[];
}

// ---- derived view models ----
export interface DerivedChannel extends ChannelAgg {
    auto: number;
    autoPct: number;
    manualPct: number;
}

export interface DerivedDay {
    date: string;
    bank: DerivedChannel | null;
    qr: DerivedChannel | null;
    gateway: DerivedChannel | null;
}

export interface ChannelTotals {
    folders: number;
    total_rows: number;
    unique_txn: number;
    hv_counted: number;
    amount: number;
    branches: Set<string>;
    sections: Record<string, number>;
    auto: number;
    autoPct: number;
}

export interface GrandTotals {
    folders: number;
    rows: number;
    unique: number;
    hv: number;
    amount: number;
    branches: number;
    auto: number;
    autoPct: number;
}

export interface BranchStat {
    branch: string;
    total_rows: number;
}
