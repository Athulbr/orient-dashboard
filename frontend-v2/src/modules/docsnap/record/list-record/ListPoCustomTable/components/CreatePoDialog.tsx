import { useEffect } from 'react';
import { DialogComponent } from '../../../../../../components/DialogComponent';
import { SingleSelect } from '../../../../../../components/SingleSelect';
import { useCreatePoApi, CreatePoPayload, useListPoCustomTableApi } from '../hooks/useListPoCustomTableApi';
import { useListPoCustomTableState } from '../hooks/listPoCustomTableStateContext';

export const emptyPoForm = (): CreatePoPayload => ({
    partyLedgerName: '',
    poNumber: '',
    poDate: '',
    dueDate: '',
    otherReferences: '',
    purchaseLedgerName: '',
    items: [{ stockItemName: '', quantity: 0, unit: '', rate: 0, amount: 0 }]
});

const formatDateToTally = (dateStr: string) => dateStr.replace(/-/g, '');

const poInputClass =
    'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const PoField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">
            {label}<span className="text-red-500 ml-0.5">*</span>
        </label>
        {children}
    </div>
);

export const CreatePoDialog: React.FC = () => {
    const { state, setState } = useListPoCustomTableState();
    const { createPoApi } = useCreatePoApi();
    const { listSundryCreditorLedgersApi, listPurchaseAccountLedgersApi, listAllStockItemsApi, listAllUnitsApi, getPoListApi } = useListPoCustomTableApi();

    const { showCreatePoDialog, createPoLoading, createPoForm, partyLedgers, loadingPartyLedgers, purchaseLedgers, loadingPurchaseLedgers, stockItems, loadingStockItems, units, loadingUnits } = state;

    useEffect(() => {
        if (!showCreatePoDialog) return;
        const fetchLedgers = async () => {
            setState(prev => ({ ...prev, loadingPartyLedgers: true, loadingPurchaseLedgers: true, loadingStockItems: true, loadingUnits: true }));
            const [partyRes, purchaseRes, stockRes, unitsRes]: any[] = await Promise.all([
                listSundryCreditorLedgersApi(),
                listPurchaseAccountLedgersApi(),
                listAllStockItemsApi(),
                listAllUnitsApi()
            ]);
            setState(prev => ({
                ...prev,
                partyLedgers: partyRes?.data?.ledgers ?? [],
                loadingPartyLedgers: false,
                purchaseLedgers: purchaseRes?.data?.ledgers ?? [],
                loadingPurchaseLedgers: false,
                stockItems: stockRes?.data?.stockItems ?? [],
                loadingStockItems: false,
                units: unitsRes?.data?.units ?? [],
                loadingUnits: false
            }));
        };
        fetchLedgers();
    }, [showCreatePoDialog]); // eslint-disable-line react-hooks/exhaustive-deps

    const setForm = (updater: (prev: CreatePoPayload) => CreatePoPayload) =>
        setState(prev => ({ ...prev, createPoForm: updater(prev.createPoForm) }));

    const closeDialog = () => setState(prev => ({ ...prev, showCreatePoDialog: false, createPoForm: emptyPoForm() }));

    const handleSubmit = async () => {
        setState(prev => ({ ...prev, createPoLoading: true }));
        const payload: CreatePoPayload = {
            ...createPoForm,
            poDate: formatDateToTally(createPoForm.poDate),
            dueDate: formatDateToTally(createPoForm.dueDate)
        };
        const success = await createPoApi(payload);
        setState(prev => ({ ...prev, createPoLoading: false }));
        if (success) {
            closeDialog();
            getPoListApi();
        }
    };

    const updateItem = (idx: number, field: keyof CreatePoPayload['items'][0], value: string | number) =>
        setForm(p => {
            const items = [...p.items];
            const updated = { ...items[idx], [field]: value };
            updated.amount = (Number(updated.quantity) || 0) * (Number(updated.rate) || 0);
            items[idx] = updated;
            return { ...p, items };
        });

    return (
        <DialogComponent
            name="Create Purchase Order"
            isOpen={showCreatePoDialog}
            closeDialog={closeDialog}
            primaryButtonText="Create PO"
            secondaryButtonText="Cancel"
            loading={createPoLoading}
            onSecondaryAction={closeDialog}
            onPrimaryAction={handleSubmit}
        >
            <div className="flex flex-col gap-4 p-1 min-w-140 m-4">
                <div className="grid grid-cols-2 gap-4">
                    <PoField label="Party Ledger Name">
                        <SingleSelect
                            value={createPoForm.partyLedgerName}
                            options={partyLedgers.map(l => ({ value: l, label: l }))}
                            onValueChange={v => setForm(p => ({ ...p, partyLedgerName: v }))}
                            placeholder={loadingPartyLedgers ? 'Loading...' : 'Select a ledger'}
                            disabled={loadingPartyLedgers}
                            className="w-full"
                        />
                    </PoField>
                    <PoField label="PO Number">
                        <input required value={createPoForm.poNumber} onChange={e => setForm(p => ({ ...p, poNumber: e.target.value }))} placeholder="e.g. PO-001" className={poInputClass} />
                    </PoField>
                    <PoField label="PO Date">
                        <input required type="date" value={createPoForm.poDate} onChange={e => setForm(p => ({ ...p, poDate: e.target.value }))} className={poInputClass} />
                    </PoField>
                    <PoField label="Due Date">
                        <input required type="date" value={createPoForm.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className={poInputClass} />
                    </PoField>
                    <PoField label="Other References">
                        <input value={createPoForm.otherReferences} onChange={e => setForm(p => ({ ...p, otherReferences: e.target.value }))} placeholder="e.g. 7502063829" className={poInputClass} />
                    </PoField>
                    <PoField label="Purchase Ledger Name">
                        <SingleSelect
                            value={createPoForm.purchaseLedgerName}
                            options={purchaseLedgers.map(l => ({ value: l, label: l }))}
                            onValueChange={v => setForm(p => ({ ...p, purchaseLedgerName: v }))}
                            placeholder={loadingPurchaseLedgers ? 'Loading...' : 'Select a ledger'}
                            disabled={loadingPurchaseLedgers}
                            className="w-full"
                        />
                    </PoField>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Items</span>
                        <button type="button" onClick={() => setForm(p => ({ ...p, items: [...p.items, { stockItemName: '', quantity: 0, unit: '', rate: 0, amount: 0 }] }))} className="text-xs text-blue-600 hover:underline">
                            + Add Item
                        </button>
                    </div>
                    {createPoForm.items.map((item, idx) => (
                        <div key={idx} className="rounded-md border border-gray-200 p-3 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-gray-500">Item {idx + 1}</span>
                                {createPoForm.items.length > 1 && (
                                    <button type="button" onClick={() => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))} className="text-xs text-red-500 hover:underline">Remove</button>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <PoField label="Stock Item Name">
                                    <SingleSelect
                                        value={item.stockItemName}
                                        options={stockItems.map(s => ({ value: s, label: s }))}
                                        onValueChange={v => updateItem(idx, 'stockItemName', v)}
                                        placeholder={loadingStockItems ? 'Loading...' : 'Select a stock item'}
                                        disabled={loadingStockItems}
                                        className="w-full"
                                    />
                                </PoField>
                                <PoField label="Quantity">
                                    <input required type="number" min="0" value={item.quantity || ''} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} placeholder="e.g. 12" className={poInputClass} />
                                </PoField>
                                <PoField label="Unit">
                                    <SingleSelect
                                        value={item.unit}
                                        options={units.map(u => ({ value: u, label: u }))}
                                        onValueChange={v => updateItem(idx, 'unit', v)}
                                        placeholder={loadingUnits ? 'Loading...' : 'Select a unit'}
                                        disabled={loadingUnits}
                                        className="w-full"
                                    />
                                </PoField>
                                <PoField label="Rate">
                                    <input required type="number" min="0" value={item.rate || ''} onChange={e => updateItem(idx, 'rate', Number(e.target.value))} placeholder="e.g. 190000" className={poInputClass} />
                                </PoField>
                                <PoField label="Amount">
                                    <input readOnly value={item.amount || ''} className={`${poInputClass} bg-gray-50 cursor-not-allowed text-gray-500`} />
                                </PoField>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </DialogComponent>
    );
};
