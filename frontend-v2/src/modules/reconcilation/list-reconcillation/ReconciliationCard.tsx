import React, { useState, useEffect } from 'react';
import { Calendar, Layers, Activity, CreditCard, Trash2 } from 'lucide-react';
import { STATUS_CONFIG, formatDate } from './constants';
import MetaPill from './MetaPill';
import type { Reconciliation } from './types';
import { DialogComponent } from '../../../components/DialogComponent';
import { config } from '../../../config/default';
import Spinner from '../../../components/Spinner';

interface ReconciliationCardProps {
    reconciliation: Reconciliation;
}

const ReconciliationCard: React.FC<ReconciliationCardProps> = ({ reconciliation }) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    useEffect(() => {
        if (isDialogOpen && transactions.length === 0) {
            setIsLoadingTransactions(true);
            setFetchError(null);
            fetch(`${config.workflowService}/workflow/reconciliations/${reconciliation._id}/transactions`)
                .then(res => {
                    if (!res.ok) throw new Error('Failed to fetch transactions');
                    return res.json();
                })
                .then(data => {
                    if (data.success) {
                        setTransactions(data.data);
                    } else {
                        throw new Error(data.error || 'Failed to fetch');
                    }
                })
                .catch(err => setFetchError(err.message))
                .finally(() => setIsLoadingTransactions(false));
        }
    }, [isDialogOpen, reconciliation._id, transactions.length]);

    const getTransactionTypeIcon = (type: string) => {
        switch (type) {
            case 'bank':
                return <Activity size={12} className="text-blue-500" />;
            case 'qr':
                return <Activity size={12} className="text-purple-500" />;
            case 'gateway':
                return <CreditCard size={12} className="text-emerald-500" />;
            default:
                return <Activity size={12} className="text-gray-500" />;
        }
    };

    const getTransactionTypeColor = (type: string) => {
        switch (type) {
            case 'bank':
                return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'qr':
                return 'bg-purple-50 text-purple-700 border-purple-100';
            case 'gateway':
                return 'bg-emerald-50 text-emerald-700 border-emerald-100';
            default:
                return 'bg-gray-50 text-gray-700 border-gray-100';
        }
    };

    const rowColumns = React.useMemo(() => {
        const keys = new Set<string>();
        transactions.forEach(txn => {
            if (Array.isArray(txn.rows)) {
                txn.rows.forEach((r: any) => {
                    if (r && typeof r === 'object') {
                        Object.keys(r).forEach(k => keys.add(k));
                    }
                });
            }
        });
        return Array.from(keys);
    }, [transactions]);

    return (
        <>
            <div
                className="reconciliation-card font-[DM_Sans,Segoe_UI,sans-serif] bg-white border border-gray-200 rounded-xl w-full shadow-sm shadow-gray-100 transition-all duration-150 hover:shadow-md hover:border-gray-300 cursor-pointer"
                onClick={() => {
                    setIsDialogOpen(true);
                    if (transactions.length === 0) {
                        setIsLoadingTransactions(true);
                    }
                }}
            >
                <div className="flex items-stretch h-full">
                    <div className="flex-1 flex items-center gap-4 px-5 py-5 min-w-0">
                        {/* File name */}
                        <div className="min-w-0 flex-shrink" style={{ width: '25%' }}>
                            <p className="text-[14px] font-bold text-gray-800 truncate leading-tight" title={reconciliation.fileName}>
                                {reconciliation.fileName}
                            </p>
                        </div>

                        <div className="h-9 w-px bg-gray-100 flex-shrink-0" />

                        {/* Metadata pills */}
                        <div className="flex items-center gap-2 flex-1 flex-wrap min-w-0">
                            <MetaPill icon={getTransactionTypeIcon(reconciliation.transactionType)} colorClass={getTransactionTypeColor(reconciliation.transactionType)}>
                                <span className="capitalize">{reconciliation.transactionType}</span>
                            </MetaPill>

                            <MetaPill icon={<Layers size={12} className="text-slate-500" />} colorClass="bg-slate-50 text-slate-700 border-slate-100">
                                {reconciliation.rowCount} Rows
                            </MetaPill>

                            <MetaPill icon={<Activity size={12} className="text-indigo-500" />} colorClass="bg-indigo-50 text-indigo-700 border-indigo-100">
                                {reconciliation.transactionCount} Transactions
                            </MetaPill>

                            <MetaPill icon={<Calendar size={12} className="text-slate-500" />} colorClass="bg-slate-50 text-slate-700 border-slate-100">
                                {formatDate(reconciliation.createdAt)}
                            </MetaPill>
                        </div>

                        <div onClick={e => e.stopPropagation()}>
                            <Trash2 color="red" className="cursor-pointer opacity-50 hover:opacity-100 transition-opacity" size={18} />
                        </div>
                    </div>
                </div>
            </div>

            <DialogComponent isOpen={isDialogOpen} closeDialog={() => setIsDialogOpen(false)} name="Transaction Details" fullScreen={true}>
                <div className="p-4 h-full flex flex-col space-y-4">
                    {isLoadingTransactions ? (
                        <div className="flex flex-1 justify-center items-center py-8">
                            <Spinner className="text-blue-500" />
                        </div>
                    ) : fetchError ? (
                        <div className="text-red-500 text-center py-4 bg-red-50 rounded-lg">{fetchError}</div>
                    ) : transactions.length === 0 ? (
                        <div className="text-gray-500 text-center py-4">No transactions found.</div>
                    ) : (
                        <div className="flex-1 overflow-auto min-h-0 relative space-y-4 px-1 pb-4">
                            {transactions.map(txn => {
                                const rows = Array.isArray(txn.rows) && txn.rows.length > 0 ? txn.rows : [{}];
                                return (
                                    <div key={txn._id} className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
                                        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-blue-100 text-blue-700 h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs" title="Transaction ID">
                                                    {txn.transactionId}
                                                </div>
                                                <h4 className="font-semibold text-gray-800 text-sm">{txn.sourceTxnNo}</h4>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5">
                                                    <Layers size={13} />
                                                    {txn.rowCount} Rows
                                                </span>
                                            </div>
                                        </div>

                                        <div className="p-4">
                                            <div className="flex flex-col gap-3">
                                                {rows.map((row: any, rIndex: number) => (
                                                    <div key={rIndex} className="bg-gray-50/70 border border-gray-100 rounded-lg p-3">
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                                            {rowColumns.map(col => (
                                                                <div key={col} className="flex flex-col">
                                                                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-0.5">{col}</span>
                                                                    <span className="text-[13px] font-medium text-gray-800 break-words">
                                                                        {row[col] !== undefined && row[col] !== null ? String(row[col]) : '-'}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </DialogComponent>
        </>
    );
};

export default ReconciliationCard;
