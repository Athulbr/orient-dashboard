export type StatusFilter = 'all' | 'pending' | 'completed' | 'failed';
export type TransactionTypeFilter = 'all' | 'bank' | 'qr' | 'gateway';

export interface DateRange {
    startDate: string;
    endDate: string;
}

export interface Reconciliation {
    _id: string;
    fileName: string;
    rowCount: number;
    transactionCount: number;
    transactionType: 'bank' | 'qr' | 'gateway';
    createdAt: string;
    updatedAt: string;
}
