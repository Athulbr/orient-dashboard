import { useEffect } from 'react';
import { DialogComponent } from '../../../../../../components/DialogComponent';
import { SingleSelect } from '../../../../../../components/SingleSelect';
import { useCreateSalesVoucherApi, CreateSalesVoucherPayload, useListSalesInvoiceCustomTableApi } from '../hooks/useListSalesInvoiceCustomTableApi';
import { useListSalesInvoiceCustomTableState } from '../hooks/listSalesInvoiceCustomTableStateContext';

export const emptySalesInvoiceForm = (): CreateSalesVoucherPayload => ({
    partyLedgerName: '',
    invoiceNumber: '',
    invoiceDate: '',
    igstLedgerName: '',
    igstAmount: 0,
    cgstLedgerName: '',
    cgstAmount: 0,
    sgstLedgerName: '',
    sgstAmount: 0,
    items: [{ stockItemName: '', quantity: 0, unit: '', rate: 0, amount: 0, salesLedgerName: '', soNumber: '', soDueDate: '' }]
});

const emptyItem = () => ({ stockItemName: '', quantity: 0, unit: '', rate: 0, amount: 0, salesLedgerName: '', soNumber: '', soDueDate: '' });

const formatDateToTally = (dateStr: string) => dateStr.replace(/-/g, '');

const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required = true, children }) => (
    <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">
            {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {children}
    </div>
);

export const CreateSalesInvoiceDialog: React.FC = () => {
    const { state, setState } = useListSalesInvoiceCustomTableState();
    const { createSalesVoucherApi } = useCreateSalesVoucherApi();
    const { listAllLedgersApi, listSalesAccountLedgersApi, listAllStockItemsApi, listAllUnitsApi, getSalesInvoiceListApi } = useListSalesInvoiceCustomTableApi();

    const { showCreateDialog, createLoading, taxMode, createForm, partyLedgers, loadingPartyLedgers, salesLedgers, loadingSalesLedgers, taxLedgers, loadingTaxLedgers, stockItems, loadingStockItems, units, loadingUnits } = state;

    useEffect(() => {
        if (!showCreateDialog) return;
        const fetchOptions = async () => {
            setState(prev => ({ ...prev, loadingPartyLedgers: true, loadingSalesLedgers: true, loadingTaxLedgers: true, loadingStockItems: true, loadingUnits: true }));
            const [ledgerRes, salesRes, stockRes, unitsRes]: any[] = await Promise.all([
                listAllLedgersApi(),
                listSalesAccountLedgersApi(),
                listAllStockItemsApi(),
                listAllUnitsApi()
            ]);
            const allLedgers = ledgerRes?.data?.ledgers ?? [];
            setState(prev => ({
                ...prev,
                partyLedgers: allLedgers,
                loadingPartyLedgers: false,
                taxLedgers: allLedgers,
                loadingTaxLedgers: false,
                salesLedgers: salesRes?.data?.ledgers ?? [],
                loadingSalesLedgers: false,
                stockItems: stockRes?.data?.stockItems ?? [],
                loadingStockItems: false,
                units: unitsRes?.data?.units ?? [],
                loadingUnits: false
            }));
        };
        fetchOptions();
    }, [showCreateDialog]); // eslint-disable-line react-hooks/exhaustive-deps

    const setForm = (updater: (prev: CreateSalesVoucherPayload) => CreateSalesVoucherPayload) =>
        setState(prev => ({ ...prev, createForm: updater(prev.createForm) }));

    const closeDialog = () => setState(prev => ({ ...prev, showCreateDialog: false, taxMode: 'igst', createForm: emptySalesInvoiceForm() }));

    const setTaxMode = (mode: 'igst' | 'cgst_sgst') => setState(prev => ({ ...prev, taxMode: mode }));

    const handleSubmit = async () => {
        setState(prev => ({ ...prev, createLoading: true }));
        const { igstLedgerName, igstAmount, cgstLedgerName, cgstAmount, sgstLedgerName, sgstAmount, ...rest } = createForm;
        const taxFields =
            taxMode === 'igst'
                ? { igstLedgerName, igstAmount }
                : { cgstLedgerName, cgstAmount, sgstLedgerName, sgstAmount };
        const payload: CreateSalesVoucherPayload = {
            ...rest,
            ...taxFields,
            invoiceDate: formatDateToTally(createForm.invoiceDate),
            items: createForm.items.map(item => ({
                ...item,
                soDueDate: item.soDueDate ? formatDateToTally(item.soDueDate) : ''
            }))
        };
        const success = await createSalesVoucherApi(payload);
        setState(prev => ({ ...prev, createLoading: false }));
        if (success) {
            closeDialog();
            getSalesInvoiceListApi();
        }
    };

    const updateItem = (idx: number, field: keyof CreateSalesVoucherPayload['items'][0], value: string | number) =>
        setForm(p => {
            const items = [...p.items];
            const updated = { ...items[idx], [field]: value };
            updated.amount = (Number(updated.quantity) || 0) * (Number(updated.rate) || 0);
            items[idx] = updated;
            return { ...p, items };
        });

    return (
        <DialogComponent
            name="Create Sales Voucher"
            isOpen={showCreateDialog}
            closeDialog={closeDialog}
            primaryButtonText="Create Sales Voucher"
            secondaryButtonText="Cancel"
            loading={createLoading}
            onSecondaryAction={closeDialog}
            onPrimaryAction={handleSubmit}
        >
            <div className="flex flex-col gap-4 p-1 min-w-140 m-4">
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Party Ledger Name">
                        <SingleSelect
                            value={createForm.partyLedgerName}
                            options={partyLedgers.map(l => ({ value: l, label: l }))}
                            onValueChange={v => setForm(p => ({ ...p, partyLedgerName: v }))}
                            placeholder={loadingPartyLedgers ? 'Loading...' : 'Select a ledger'}
                            disabled={loadingPartyLedgers}
                            className="w-full"
                        />
                    </Field>
                    <Field label="Invoice Number">
                        <input required value={createForm.invoiceNumber} onChange={e => setForm(p => ({ ...p, invoiceNumber: e.target.value }))} placeholder="e.g. INV-SO-002" className={inputClass} />
                    </Field>
                    <Field label="Invoice Date">
                        <input required type="date" value={createForm.invoiceDate} onChange={e => setForm(p => ({ ...p, invoiceDate: e.target.value }))} className={inputClass} />
                    </Field>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">Tax Type</span>
                        <div className="flex rounded-md border border-gray-300 overflow-hidden text-xs">
                            <button
                                type="button"
                                onClick={() => setTaxMode('igst')}
                                className={`px-3 py-1.5 ${taxMode === 'igst' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
                            >
                                IGST
                            </button>
                            <button
                                type="button"
                                onClick={() => setTaxMode('cgst_sgst')}
                                className={`px-3 py-1.5 border-l border-gray-300 ${taxMode === 'cgst_sgst' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`}
                            >
                                CGST + SGST
                            </button>
                        </div>
                    </div>
                    {taxMode === 'igst' ? (
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="IGST Ledger Name">
                                <SingleSelect
                                    value={createForm.igstLedgerName ?? ''}
                                    options={taxLedgers.map(l => ({ value: l, label: l }))}
                                    onValueChange={v => setForm(p => ({ ...p, igstLedgerName: v }))}
                                    placeholder={loadingTaxLedgers ? 'Loading...' : 'Select a ledger'}
                                    disabled={loadingTaxLedgers}
                                    className="w-full"
                                />
                            </Field>
                            <Field label="IGST Amount">
                                <input required type="number" min="0" value={createForm.igstAmount || ''} onChange={e => setForm(p => ({ ...p, igstAmount: Number(e.target.value) }))} placeholder="e.g. 2160" className={inputClass} />
                            </Field>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="CGST Ledger Name">
                                <SingleSelect
                                    value={createForm.cgstLedgerName ?? ''}
                                    options={taxLedgers.map(l => ({ value: l, label: l }))}
                                    onValueChange={v => setForm(p => ({ ...p, cgstLedgerName: v }))}
                                    placeholder={loadingTaxLedgers ? 'Loading...' : 'Select a ledger'}
                                    disabled={loadingTaxLedgers}
                                    className="w-full"
                                />
                            </Field>
                            <Field label="CGST Amount">
                                <input required type="number" min="0" value={createForm.cgstAmount || ''} onChange={e => setForm(p => ({ ...p, cgstAmount: Number(e.target.value) }))} placeholder="e.g. 1080" className={inputClass} />
                            </Field>
                            <Field label="SGST Ledger Name">
                                <SingleSelect
                                    value={createForm.sgstLedgerName ?? ''}
                                    options={taxLedgers.map(l => ({ value: l, label: l }))}
                                    onValueChange={v => setForm(p => ({ ...p, sgstLedgerName: v }))}
                                    placeholder={loadingTaxLedgers ? 'Loading...' : 'Select a ledger'}
                                    disabled={loadingTaxLedgers}
                                    className="w-full"
                                />
                            </Field>
                            <Field label="SGST Amount">
                                <input required type="number" min="0" value={createForm.sgstAmount || ''} onChange={e => setForm(p => ({ ...p, sgstAmount: Number(e.target.value) }))} placeholder="e.g. 1080" className={inputClass} />
                            </Field>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Items</span>
                        <button type="button" onClick={() => setForm(p => ({ ...p, items: [...p.items, emptyItem()] }))} className="text-xs text-blue-600 hover:underline">
                            + Add Item
                        </button>
                    </div>
                    {createForm.items.map((item, idx) => (
                        <div key={idx} className="rounded-md border border-gray-200 p-3 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-gray-500">Item {idx + 1}</span>
                                {createForm.items.length > 1 && (
                                    <button type="button" onClick={() => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))} className="text-xs text-red-500 hover:underline">Remove</button>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Stock Item Name">
                                    <SingleSelect
                                        value={item.stockItemName}
                                        options={stockItems.map(s => ({ value: s, label: s }))}
                                        onValueChange={v => updateItem(idx, 'stockItemName', v)}
                                        placeholder={loadingStockItems ? 'Loading...' : 'Select a stock item'}
                                        disabled={loadingStockItems}
                                        className="w-full"
                                    />
                                </Field>
                                <Field label="Sales Ledger Name">
                                    <SingleSelect
                                        value={item.salesLedgerName}
                                        options={salesLedgers.map(l => ({ value: l, label: l }))}
                                        onValueChange={v => updateItem(idx, 'salesLedgerName', v)}
                                        placeholder={loadingSalesLedgers ? 'Loading...' : 'Select a ledger'}
                                        disabled={loadingSalesLedgers}
                                        className="w-full"
                                    />
                                </Field>
                                <Field label="Quantity">
                                    <input required type="number" min="0" value={item.quantity || ''} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} placeholder="e.g. 12" className={inputClass} />
                                </Field>
                                <Field label="Unit">
                                    <SingleSelect
                                        value={item.unit}
                                        options={units.map(u => ({ value: u, label: u }))}
                                        onValueChange={v => updateItem(idx, 'unit', v)}
                                        placeholder={loadingUnits ? 'Loading...' : 'Select a unit'}
                                        disabled={loadingUnits}
                                        className="w-full"
                                    />
                                </Field>
                                <Field label="Rate">
                                    <input required type="number" min="0" value={item.rate || ''} onChange={e => updateItem(idx, 'rate', Number(e.target.value))} placeholder="e.g. 1000" className={inputClass} />
                                </Field>
                                <Field label="Amount">
                                    <input readOnly value={item.amount || ''} className={`${inputClass} bg-gray-50 cursor-not-allowed text-gray-500`} />
                                </Field>
                                <Field label="SO Number" required={false}>
                                    <input value={item.soNumber} onChange={e => updateItem(idx, 'soNumber', e.target.value)} placeholder="e.g. 7502063829" className={inputClass} />
                                </Field>
                                <Field label="SO Due Date" required={false}>
                                    <input type="date" value={item.soDueDate} onChange={e => updateItem(idx, 'soDueDate', e.target.value)} className={inputClass} />
                                </Field>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </DialogComponent>
    );
};
