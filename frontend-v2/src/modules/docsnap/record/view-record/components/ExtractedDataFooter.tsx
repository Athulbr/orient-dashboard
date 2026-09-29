import { Button } from '../../../../../components/Button';
import { useNavigate } from 'react-router-dom';
import { useViewRecordApi } from '../hooks/useViewRecordApi';
import { useViewRecordState } from '../hooks/viewRecordContext';
import { useTallyApi } from '../hooks/useTallyApi';
import { RefreshCw, SkipForward } from 'lucide-react';
import Tooltip from '../../../../../components/Tooltip';
import { convertJSON } from '../../list-record/utils/convertJSON';
import { useToastStore } from '../../../../../components/toast/ToastStore';
import { DialogComponent } from '../../../../../components/DialogComponent';
import Spinner from '../../../../../components/Spinner';
import { useState } from 'react';
import { SingleSelect, SelectOption } from '../../../../../components/SingleSelect';
import { config } from '../../../../../config/default';
interface ExtractedDataFooterIF {
    test?: string;
}

const ExtractedDataFooter: React.FC<ExtractedDataFooterIF> = () => {
    const navigate = useNavigate();
    const toast = useToastStore();
    const { state, setState } = useViewRecordState();
    const { updateRecordApiById, updateExtractedData, getRecordApiById, submitRecordApi, reExtractDocument } = useViewRecordApi();
    const { getAllLedgerApi, listAllPurchaseOrdersApi, listAllStockItemsApi, listPurchaseAccountLedgersApi, listSundryCreditorLedgersApi, tallyHealthCheck, createPurchaseVoucher, createJournalVoucherApi } = useTallyApi();
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showLedgerDialog, setShowLedgerDialog] = useState(false);
    const [ledgerOptions, setLedgerOptions] = useState<SelectOption[]>([]);
    const [selectedLedger, setSelectedLedger] = useState('');
    const [matchedLedger, setMatchedLedger] = useState<string | null>(null);
    const [poDueDate, setPoDueDate] = useState<string | null>(null);
    const [autoMatchedTallyFields, setAutoMatchedTallyFields] = useState<Set<string>>(new Set());
    const [useCgstSgstMode, setUseCgstSgstMode] = useState(false);
    const [showTallyDialog, setShowTallyDialog] = useState(false);
    const [tallyLedgerOptions, setTallyLedgerOptions] = useState<SelectOption[]>([]);
    const [stockItemOptions, setStockItemOptions] = useState<SelectOption[]>([]);
    const [purchaseLedgerOptions, setPurchaseLedgerOptions] = useState<SelectOption[]>([]);
    const [sundryCreditorOptions, setSundryCreditorOptions] = useState<SelectOption[]>([]);
    const [tallySelections, setTallySelections] = useState({
        cgstLedgerName: '',
        igstLedgerName: '',
        sgstLedgerName: '',
        stockItemName: '',
        purchaseLedgerName: ''
    });

    // Validate that all required object sub-fields have a value before save/submit
    const validateRequiredFields = (): boolean => {
        const templateFields = state.record?.templateId?.fields || [];

        for (const field of templateFields) {
            // Only object-type fields (rendered in RenderObjectFields) have subFields here
            if (!field?.subFields?.length) continue;

            const objectFieldValues = state.objectFields?.[field.jsonKey];
            if (!objectFieldValues) continue;

            for (const subField of field.subFields) {
                if (!subField?.required) continue;

                const currentValue = objectFieldValues?.[subField.jsonKey]?.value;
                if (currentValue === undefined || currentValue === null || `${currentValue}`.trim() === '') {
                    toast.error(`${subField.name || subField.jsonKey} is required and cannot be empty`);
                    return false;
                }
            }
        }

        return true;
    };

    const reconcilation = (remainingBalanceRaw: unknown, balanceQuantityRaw: unknown): boolean => {
        const taxableAmountRaw = state.objectFields?.summary_totals?.taxable_amount?.value;
        const taxableAmount = Number(`${taxableAmountRaw ?? ''}`.replace(/,/g, '').trim());
        const remainingBalance = Number(`${remainingBalanceRaw ?? ''}`.replace(/,/g, '').trim());

        if (Number.isNaN(taxableAmount)) {
            toast.error('Taxable amount is missing');
            return false;
        }

        if (Number.isNaN(remainingBalance)) {
            toast.error('Remaining balance is missing');
            return false;
        }

        const invoiceQty = Number(`${state.objectFields?.tax_details?.quantity?.value ?? ''}`.trim());
        const balanceQuantity = Number(`${balanceQuantityRaw ?? ''}`.trim());
        if (!Number.isNaN(invoiceQty) && !Number.isNaN(balanceQuantity)) {
            if (balanceQuantity <= 0) {
                toast.error('PO quantity is fully consumed');
                return false;
            }
            if (invoiceQty > balanceQuantity) {
                toast.error(`Invoice quantity (${invoiceQty}) exceeds PO balance quantity (${balanceQuantity})`);
                return false;
            }
        }

        if (remainingBalance < taxableAmount) {
            toast.error('PO limit exceed');
            return false;
        }

        if (remainingBalance - taxableAmount === 0) {
            toast.success('PO fully consumed');
            return true;
        }

        toast.success('po partialy consumed');
        return true;
    };

    const parseFlexibleDate = (value: unknown): Date => {
        const normalized = `${value ?? ''}`.trim();

        if (!/^[0-9]{8}$/.test(normalized)) {
            throw new Error('Expected date format is YYYYMMDD');
        }

        const year = Number(normalized.slice(0, 4));
        const month = Number(normalized.slice(4, 6));
        const day = Number(normalized.slice(6, 8));

        if (!year || !month || !day) {
            throw new Error('Expected date format is YYYYMMDD');
        }

        return new Date(year, month - 1, day);
    };

    const handleSubmit = async (fromTallyDialog: boolean = false) => {
        if (!validateRequiredFields()) return;
        if (isSubmitting) return;

        setIsSubmitting(true);
        try {
            if (state.record?.templateId?.settings?.tally === true) {
                const tallyHealthResponse = await tallyHealthCheck();
                if (!tallyHealthResponse || tallyHealthResponse?.success === false) {
                    toast.error('Connection to tally failed, please check the connection string');
                    return;
                }

                const purchaseOrdersResponse = await listAllPurchaseOrdersApi();
                const purchaseOrders = purchaseOrdersResponse?.data?.vouchers || [];
                console.log('all po details are:', purchaseOrders);
                const poNumberRaw = state.objectFields?.invoice_basic_details?.po_number?.value;
                const poNumber = poNumberRaw ? `${poNumberRaw}`.trim() : '';
                if (!poNumber) {
                    toast.error('PO is missing');
                    return;
                }
                if (poNumber) {
                    const bestMatchedPO =
                        purchaseOrders.find((po: any) => `${po?.reference || ''}`.trim() === poNumber) ||
                        purchaseOrders.find((po: any) => `${po?.reference || ''}`.trim().toLowerCase() === poNumber.toLowerCase()) ||
                        purchaseOrders.find((po: any) => `${po?.reference || ''}`.trim().toLowerCase().includes(poNumber.toLowerCase()));

                    if (bestMatchedPO) {
                        //to check the date is valid for the matched PO
                        const invoiceDateRaw = state.objectFields?.invoice_basic_details?.invoice_date?.value;
                        let invoiceDate: Date, poStartDate: Date, poClosingDate: Date;
                        try {
                            invoiceDate = parseFlexibleDate(invoiceDateRaw);
                            poStartDate = parseFlexibleDate(bestMatchedPO?.date);
                            poClosingDate = parseFlexibleDate(bestMatchedPO?.closingDate ?? bestMatchedPO?.closing_date);
                        } catch {
                            toast.error('Invalid date format. Expected date format is YYYYMMDD (e.g. 20240315)');
                            return;
                        }
                        if (invoiceDate! && poStartDate! && poClosingDate!) {
                            if (invoiceDate < poStartDate || invoiceDate > poClosingDate) {
                                toast.error('Invoice date is not within PO start and closing date');
                                return;
                            }
                        }

                        const remainingBalance = bestMatchedPO?.remainingBalance ?? bestMatchedPO?.remaining_balance;
                        const isReconciled = reconcilation(remainingBalance, bestMatchedPO?.balanceQuantity);
                        if (!isReconciled) return;
                        setPoDueDate(bestMatchedPO?.closingDate ?? bestMatchedPO?.closing_date ?? null);
                    } else {
                        toast.error(`PO number ${poNumber} is not matched to any of the PO in tally`);
                        return;
                    }
                }

                if (!fromTallyDialog) {

                    const ledgerResponse = await getAllLedgerApi();
                    const ledgers = ledgerResponse?.data?.ledgers || [];
                    const options = ledgers.map((ledger: string) => ({ value: ledger, label: ledger }));
                    setTallyLedgerOptions(options);

                    const stockItemsResponse = await listAllStockItemsApi();
                    const stockItems = stockItemsResponse?.data?.stockItems || [];
                    const stockOptions = stockItems.map((item: any) => {
                        if (typeof item === 'string') {
                            return { value: item, label: item };
                        }

                        const label = item?.name || item?.value || '';
                        return { value: label, label };
                    });
                    setStockItemOptions(stockOptions);

                    const purchaseLedgersResponse = await listPurchaseAccountLedgersApi();
                    const purchaseLedgers = purchaseLedgersResponse?.data?.ledgers || [];
                    setPurchaseLedgerOptions(purchaseLedgers.map((l: string) => ({ value: l, label: l })));

                    const cgstOutput = `${state.objectFields?.tax_details?.cgst_output?.value ?? ''}`.trim();
                    const sgstOutput = `${state.objectFields?.tax_details?.sgst_output?.value ?? ''}`.trim();
                    const useCgstSgst = !!(cgstOutput && sgstOutput);

                    const cgstPct = `${state.objectFields?.tax_details?.cgst_percentage?.value ?? ''}`.trim();
                    const sgstPct = `${state.objectFields?.tax_details?.sgst_percentage?.value ?? ''}`.trim();
                    const igstPct = `${state.objectFields?.tax_details?.igst_percentage?.value ?? ''}`.trim();

                    const autoMatched = new Set<string>();
                    const updates: Partial<typeof tallySelections> = {};

                    if (useCgstSgst) {
                        const matchedCgst = cgstPct ? ledgers.find((l: string) => l.toLowerCase().includes('cgst') && l.includes(cgstPct)) ?? '' : '';
                        const matchedSgst = sgstPct ? ledgers.find((l: string) => l.toLowerCase().includes('sgst') && l.includes(sgstPct)) ?? '' : '';
                        if (matchedCgst) { autoMatched.add('cgst'); updates.cgstLedgerName = matchedCgst; }
                        if (matchedSgst) { autoMatched.add('sgst'); updates.sgstLedgerName = matchedSgst; }
                    } else {
                        const matchedIgst = igstPct ? ledgers.find((l: string) => l.toLowerCase().includes('igst') && l.includes(igstPct)) ?? '' : '';
                        if (matchedIgst) { autoMatched.add('igst'); updates.igstLedgerName = matchedIgst; }
                    }

                    setUseCgstSgstMode(useCgstSgst);
                    setAutoMatchedTallyFields(autoMatched);
                    if (Object.keys(updates).length) {
                        setTallySelections(prev => ({ ...prev, ...updates }));
                    }

                    setShowTallyDialog(true);
                    return;
                }
                // console.log('tally selections:', tallySelections);

                const ledgerResponse = await getAllLedgerApi();
                const ledgers = ledgerResponse?.data?.ledgers || [];
                const senderName = state.objectFields?.sender_details?.name?.value;
                const bestMatchedLedger = ledgers.find((ledger: string) => ledger === senderName) || null;
                if (bestMatchedLedger) {
                    setMatchedLedger(bestMatchedLedger);
                    console.log('matchedLedger:', bestMatchedLedger);
                    const payload = {
                        extractedData: state.record?.extractedData,
                        config: {
                            purchaseLedgerName: bestMatchedLedger,
                            tallyLedgers: tallySelections,
                            poDueDate: poDueDate
                        }
                    };
                    // await createJournalVoucherApi(payload);
                    await createPurchaseVoucher(payload);
                } else {
                    const sundryResponse = await listSundryCreditorLedgersApi();
                    const sundryLedgers = sundryResponse?.data?.ledgers || [];
                    const sundryOptions = sundryLedgers.map((l: string) => ({ value: l, label: l }));
                    setSundryCreditorOptions(sundryOptions);
                    setLedgerOptions(sundryOptions);
                    setSelectedLedger('');
                    setMatchedLedger(null);
                    setShowLedgerDialog(true);
                }
                return;
            }
            await submitRecordApi();
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleNodeReExtraction = async () => {
        const formData = new FormData();
        formData.append('templateId', state.record?.templateId?._id);
        formData.append('recordId', state.record?._id);
        if (state.record?.imageFileNames) {
            console.log('state.record?.imageFileNames:===========', state.record?.imageFileNames);
            formData.append('imageFileNames', JSON.stringify(state.record?.imageFileNames));
        }
        await reExtractDocument(formData);
    };

    const handlePythonReExtraction = async () => {
        try {
            const token = window?.sessionStorage?.getItem('accessToken') || '';
            const selectedTenant = window?.sessionStorage?.getItem('selectedTenant');
            const formData = new FormData();
            formData.append('template_id', state.record?.templateId?._id);
            formData.append('s3_file_name', state.record?.pdfFileName);
            formData.append('reExtractor', 'true');
            const apiEndPoint = `${config.extractionServicePython}/api/v5/document/analyze_document`;

            const headers: Record<string, string> = { authorization: `Bearer ${JSON.parse(token)}` };
            if (selectedTenant) {
                headers.tenantId = selectedTenant;
            }

            const response = await fetch(apiEndPoint, {
                method: 'POST',
                headers,
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            // Fetch the stream URL
            const streamHeaders: Record<string, string> = { authorization: `Bearer ${JSON.parse(token)}` };
            if (selectedTenant) {
                streamHeaders.tenantId = selectedTenant;
            }

            const streamResponse = await fetch(`${config.extractionServicePython}${data.stream_url}?token=Bearer ${JSON.parse(token)}`, {
                method: 'GET',
                headers: streamHeaders
            });

            if (!streamResponse.ok) {
                throw new Error(`Stream HTTP error! status: ${streamResponse.status}`);
            }

            if (!streamResponse.body) {
                throw new Error('ReadableStream not supported');
            }

            const reader = streamResponse.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    if (!line.startsWith('data: ')) continue;

                    try {
                        let jsonString = line.substring(6); // Remove "data: " prefix
                        if (!jsonString.trim()) continue;

                        const parsedData = JSON.parse(jsonString);
                        if (parsedData.current_step === 'Completed') {
                            await updateExtractedData(parsedData?.result?.extracted_data || {});
                            setState(prev => ({ ...prev, reExtracting: false }));
                            await getRecordApiById(state.record?._id);
                            return; // End parsing here
                        }
                    } catch (e) {
                        console.error('Failed to parse SSE message:', e, 'Line:', line);
                        continue;
                    }
                }
            }
        } catch (error) {
            console.error('API request error:', error);
            setState(prev => ({ ...prev, reExtracting: false }));
        }
    };

    const handleReExtract = async () => {
        setState(prev => ({ ...prev, hoveredFieldId: null, hoveredOnArrayField: false, wire: null, bbox: null, pageNumber: 1, reExtracting: true }));

        if (state.record?.templateId?.settings?.extractionEngine !== 'python') {
            await handleNodeReExtraction();
        } else {
            await handlePythonReExtraction();
        }
    };

    const skipToNextDocumentHandler = () => {
        const recordIdList = window?.sessionStorage?.getItem('recordIdList') as string;
        const recordIdListArray = JSON.parse(recordIdList);
        const index = recordIdListArray.indexOf(state.record?._id);
        if (index === -1) return;
        setState(prev => ({ ...prev, hoveredFieldId: null, hoveredOnArrayField: false, wire: null, bbox: null, pageNumber: 1 }));
        navigate(`/docsnap/record/view/${recordIdListArray[index + 1]}`);
    };

    if (state.selectedTableName) return null;

    const reExtracting = state.reExtracting;

    return (
        <div className="flex items-center justify-end gap-2 border-t p-2">
            <Tooltip text="Skip to Next Document">
                <Button data-tour-id="skip-next-document-button" disabled={reExtracting} small outlined onClick={skipToNextDocumentHandler}>
                    <SkipForward size={18} className="text-gray-500" />
                </Button>
            </Tooltip>
            {state.templateSettings?.reExtraction && (
                <Tooltip text="Re Extract">
                    <Button data-tour-id="re-extract-button" disabled={reExtracting} onClick={handleReExtract} small outlined>
                        <RefreshCw size={18} className={`text-gray-500 ${reExtracting ? 'animate-spin' : ''}`} />
                    </Button>
                </Tooltip>
            )}
            <Button disabled={reExtracting} onClick={() => setShowCancelDialog(true)} outlined small>
                Cancel
            </Button>
            <Tooltip text="Save Updated Data">
                <Button
                    data-tour-id="save-updated-data-button"
                    disabled={reExtracting}
                    onClick={async () => {
                        if (!validateRequiredFields()) return;
                        await updateRecordApiById();
                    }}
                    outlined
                    small
                >
                    Save
                </Button>
            </Tooltip>
            <Button
                data-tour-id="submit-button"
                disabled={reExtracting || isSubmitting}
                onClick={() => handleSubmit()}
                outlined
                small
                startIcon={isSubmitting ? <Spinner size={16} /> : undefined}
            >
                {isSubmitting ? 'Submitting...' : 'Submit'}
            </Button>
            <DialogComponent
                name="Discard changes?"
                isOpen={showCancelDialog}
                closeDialog={() => setShowCancelDialog(false)}
                primaryButtonText="Leave"
                secondaryButtonText="Stay"
                onPrimaryAction={() => navigate('/docsnap/record/list')}
                onSecondaryAction={() => setShowCancelDialog(false)}
            >
                <div className="px-8 py-6 text-sm text-gray-700">
                    Your changes won&apos;t be saved.
                </div>
            </DialogComponent>
            <DialogComponent
                name="Select Tally Ledgers"
                isOpen={showTallyDialog}
                closeDialog={() => setShowTallyDialog(false)}
                primaryButtonText="Done"
                onPrimaryAction={async () => {
                    if (!tallySelections.stockItemName) {
                        toast.error('Please select a stock item name to proceed');
                        return;
                    }
                    if (!tallySelections.purchaseLedgerName) {
                        toast.error('Please select a purchase ledger name to proceed');
                        return;
                    }
                    setShowTallyDialog(false);
                    await handleSubmit(true);
                }}
            >
                <div className="flex flex-col gap-4 px-8 py-6">
                    {useCgstSgstMode && !autoMatchedTallyFields.has('cgst') && (
                        <SingleSelect
                            value={tallySelections.cgstLedgerName}
                            options={tallyLedgerOptions}
                            onValueChange={value => setTallySelections(prev => ({ ...prev, cgstLedgerName: value }))}
                            placeholder="Select CGST ledger name"
                            className="w-full"
                        />
                    )}
                    {useCgstSgstMode && !autoMatchedTallyFields.has('sgst') && (
                        <SingleSelect
                            value={tallySelections.sgstLedgerName}
                            options={tallyLedgerOptions}
                            onValueChange={value => setTallySelections(prev => ({ ...prev, sgstLedgerName: value }))}
                            placeholder="Select SGST ledger name"
                            className="w-full"
                        />
                    )}
                    {!useCgstSgstMode && !autoMatchedTallyFields.has('igst') && (
                        <SingleSelect
                            value={tallySelections.igstLedgerName}
                            options={tallyLedgerOptions}
                            onValueChange={value => setTallySelections(prev => ({ ...prev, igstLedgerName: value }))}
                            placeholder="Select IGST ledger name"
                            className="w-full"
                        />
                    )}
                    <SingleSelect
                        value={tallySelections.stockItemName}
                        options={stockItemOptions}
                        onValueChange={value => setTallySelections(prev => ({ ...prev, stockItemName: value }))}
                        placeholder="Select stock item name"
                        className="w-full"
                    />
                    <SingleSelect
                        value={tallySelections.purchaseLedgerName}
                        options={purchaseLedgerOptions}
                        onValueChange={value => setTallySelections(prev => ({ ...prev, purchaseLedgerName: value }))}
                        placeholder="Select purchase ledger name"
                        className="w-full"
                    />
                </div>
            </DialogComponent>
            <DialogComponent
                name="Select Ledger"
                isOpen={showLedgerDialog}
                closeDialog={() => setShowLedgerDialog(false)}
                primaryButtonText="Done"
                onPrimaryAction={async () => {
                    if (!selectedLedger) {
                        toast.error('Please select a ledger to proceed');
                        return;
                    }
                    const payload = {
                        extractedData: state.record?.extractedData,
                        config: {
                            ledger: selectedLedger,
                            tallyLedgers: tallySelections,
                            poDueDate: poDueDate
                        }
                    };
                    await createPurchaseVoucher(payload);
                    setShowLedgerDialog(false);
                }}
            >
                <div className="flex flex-col gap-4 px-8 py-6">
                    <p className="text-sm text-gray-700">Ledger not matched, please select a ledger.</p>
                    <SingleSelect
                        value={selectedLedger}
                        options={ledgerOptions}
                        onValueChange={value => {
                            setSelectedLedger(value);
                            // console.log('selectedLedger:', value);
                        }}
                        placeholder="Select a ledger"
                        className="w-full"
                    />
                </div>
            </DialogComponent>
        </div>
    );
};

export default ExtractedDataFooter;
