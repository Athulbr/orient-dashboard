import { DialogComponent } from '../../../../../../components/DialogComponent';
import { useListSoCustomTableState } from '../hooks/listSoCustomTableStateContext';

const formatTallyDate = (raw: string) => {
    if (!raw || raw.length !== 8) return raw || 'N/A';
    return `${raw.slice(6, 8)}-${raw.slice(4, 6)}-${raw.slice(0, 4)}`;
};

const formatCurrency = (value: number) =>
    value != null ? `₹${value.toLocaleString('en-IN')}` : 'N/A';

export const SoDetailDialog: React.FC = () => {
    const { state, setState } = useListSoCustomTableState();
    const { selectedRecord } = state;
    const close = () => setState(prev => ({ ...prev, selectedRecord: null }));

    if (!selectedRecord) return null;

    const details = [
        { label: 'SO Number', value: selectedRecord.number },
        { label: 'Name', value: selectedRecord.name },
        { label: 'Reference', value: selectedRecord.reference },
        { label: 'Party Ledger', value: selectedRecord.partyLedgerName },
        { label: 'Purchase Ledger', value: selectedRecord.purchaseLedgerName },
        { label: 'Date', value: formatTallyDate(selectedRecord.date) },
        { label: 'Closing Date', value: formatTallyDate(selectedRecord.closingDate) },
        { label: 'Status', value: selectedRecord.status || '—' },
        { label: 'Quantity', value: selectedRecord.quantity },
        { label: 'Balance Quantity', value: selectedRecord.balanceQuantity },
        { label: 'Opening Balance', value: formatCurrency(selectedRecord.openingBalance) },
        { label: 'Invoiced Total', value: formatCurrency(selectedRecord.invoicedTotal) },
        { label: 'Remaining Balance', value: formatCurrency(selectedRecord.remainingBalance) },
    ];

    return (
        <DialogComponent
            name={`Sales Order — ${selectedRecord.reference}`}
            isOpen={!!selectedRecord}
            closeDialog={close}
            secondaryButtonText="Close"
            onSecondaryAction={close}
        >
            <div className="flex flex-col gap-5 p-4 min-w-140">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    {details.map(({ label, value }) => (
                        <div key={label} className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-gray-500">{label}</span>
                            <span className="text-sm text-gray-800">{value ?? 'N/A'}</span>
                        </div>
                    ))}
                </div>

                {selectedRecord.items?.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Items</span>
                        <div className="overflow-x-auto rounded-md border border-gray-200">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        {['Stock Item', 'Qty', 'Unit', 'Rate', 'Amount'].map(h => (
                                            <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {selectedRecord.items.map((item: any, i: number) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-3 py-2 text-gray-800">{item.stockItemName}</td>
                                            <td className="px-3 py-2 text-gray-800">{item.quantity}</td>
                                            <td className="px-3 py-2 text-gray-800">{item.unit}</td>
                                            <td className="px-3 py-2 text-gray-800">{formatCurrency(item.rate)}</td>
                                            <td className="px-3 py-2 text-gray-800">{formatCurrency(item.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </DialogComponent>
    );
};
