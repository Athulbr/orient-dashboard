// ── ScannedDocument ────────────────────────────────────────────

export interface ScannedDocument {
    _id?: string;
    folderName?: string;
    name: string;
    path: string;
    size: number;
    fileAddedAt: string;
    fileModifiedAt?: string;
    branchCode: string;
    invoiceNumber: string;
    orderType?: string;
    status: 'pending' | 'extracted' | 'success' | 'failed';
    errorMessage: string | null;
    createdAt?: string;
    updatedAt?: string;
    invoicePagePath: string;
}

// ── Status visual config ───────────────────────────────────────

export interface StatusConfig {
    label: string;
    icon: React.ReactNode;
    text: string;
    bg: string;
    border: string;
    dot: string;
    stripe: string;
    badgeBg: string;
}

export type DocumentStatus = ScannedDocument['status'];

// ── Filter / pagination state ──────────────────────────────────

export type StatusFilter = 'all' | DocumentStatus;

export interface DateRange {
    startDate: string;
    endDate: string;
}
