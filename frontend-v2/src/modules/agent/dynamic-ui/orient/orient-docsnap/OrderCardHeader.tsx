import React, { useState, useCallback } from 'react';
import { Clock, User, Mail, Phone, Hash, Building2, Edit, Trash2, FileText, Image as ImageIcon, File, Zap, Eye, Loader2 } from 'lucide-react';
import { Order } from './types';
import { GBtn } from './OrderCardPrimitives';
import { convertToIst } from '../../../../../global-utils/convert-date-format';
import { Button } from '../../../../../components/Button';
import UploadReceipt from './upload-receipt';
import { config } from '../../../../../config/default';
import { useToastStore } from '../../../../../components/toast/ToastStore';
import { DialogComponent } from '../../../../../components/DialogComponent';
import { DocsnapComparisonUI } from './docsnap-comparison-page';

const API_KEY = import.meta.env.VITE_WORKFLOW_API_KEY || 'secret1';

// ── Info chip helper ──────────────────────────────────────────

interface InfoChip {
    icon: React.ReactNode | null;
    val: React.ReactNode;
    hide?: boolean;
}

const LabelValue: React.FC<{ label: string; value: React.ReactNode; bold?: boolean }> = ({ label, value, bold }) => (
    <>
        <span className="text-gray-400 font-medium mr-[3px]">{label}:</span> <span className={`text-gray-600 ${bold ? 'font-extrabold' : 'font-bold'}`}>{value}</span>
    </>
);

function buildInfoChips(order: Order): InfoChip[] {
    const od = order.orderDetails;
    const ud = order.userDetails;

    const chips: InfoChip[] = [
        { icon: <User size={12} className="text-gray-400" />, val: ud.name },
        { icon: <Mail size={12} className="text-gray-400" />, val: ud.email },
        { icon: <Phone size={12} className="text-gray-400" />, val: ud.phone }
    ];

    if (ud.panNumber) {
        chips.push({ icon: <Hash size={12} className="text-gray-400" />, val: `PAN: ${ud.panNumber}` });
    }

    chips.push({ icon: <Building2 size={12} className="text-gray-400" />, val: od.branch });
    chips.push({ icon: null, val: <LabelValue label="Invioce Amount" value={`${od.actualAmount}`} />, hide: !od.actualAmount });
    chips.push({ icon: null, val: <LabelValue label="Total Amount" value={`${od.totalAmount}`} bold />, hide: !od.totalAmount });

    if (od.paymentType) chips.push({ icon: null, val: <LabelValue label="Payment" value={od.paymentType} /> });
    if (od.deliveryMode) chips.push({ icon: null, val: <LabelValue label="Delivery" value={od.deliveryMode} /> });
    if (od.deliveryCharge !== undefined) chips.push({ icon: null, val: <LabelValue label="Delivery Charge" value={`₹${od.deliveryCharge}`} /> });
    if (od.handlingCharges !== undefined) chips.push({ icon: null, val: <LabelValue label="Handling" value={`₹${od.handlingCharges}`} /> });
    if (od.purpose) chips.push({ icon: null, val: <LabelValue label="Purpose" value={od.purpose} /> });
    if (od.sourceOfFund) chips.push({ icon: null, val: <LabelValue label="Source of Fund" value={od.sourceOfFund === 'parent' ? 'Parent' : od.sourceOfFund === 'self' ? 'Self' : od.sourceOfFund} /> });
    if (od.gst) chips.push({ icon: null, val: <LabelValue label="GST" value={od.gst} /> });
    if (od.tcs) chips.push({ icon: null, val: <LabelValue label="TCS" value={od.tcs} /> });
    if (od.branchCode) chips.push({ icon: null, val: <LabelValue label="Branch Code" value={od.branchCode} /> });
    if (od.documentUploadTime) {
        chips.push({ icon: <Clock size={12} className="text-gray-400" />, val: <LabelValue label="Uploaded" value={od.documentUploadTime} /> });
    }

    return chips;
}

// ── Status label ──────────────────────────────────────────────

function getStatusLabel(status: string): string {
    if (status === 'extracted') return 'Review Pending';
    if (status === 'pending') return 'Extraction Pending';
    if (status === 'submitted') return 'Maraekat Submitted';
    return status;
}

// ── Header Props ──────────────────────────────────────────────

interface OrderCardHeaderProps {
    order: Order;
    status: { text: string; bg: string; border: string; dot: string };
    docCounts: { online: number; email: number; manual: number; total: number };
    showOnline: boolean;
    onEdit?: (order: Order) => void;
    onDelete?: () => void;
    onUploadComplete?: (docs: { documentName: string; documentPages: string[] }[]) => void;
    onRemoveReceipt?: (index: number) => void;
    onOrderUpdate?: (updatedOrder: Order) => void;
    isProceeding?: boolean;
}

import DocTile, { getFileType } from './DocTile';
import { formatDate } from '../../../../../builders/tablebuilder/render-tablebuilder/utils/formatDate';

// ── Component ─────────────────────────────────────────────────

const OrderCardHeader: React.FC<OrderCardHeaderProps> = ({ order, status, docCounts, showOnline, onEdit, onDelete, onUploadComplete, onRemoveReceipt, onOrderUpdate, isProceeding }) => {
    const od = order.orderDetails;
    const chips = buildInfoChips(order);
    const toast = useToastStore();

    // ── Receipt extraction state ──────────────────────────────
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractionProgress, setExtractionProgress] = useState('');
    const [showReceiptComparison, setShowReceiptComparison] = useState(false);

    const hasReceipts = (order.receipts?.length || 0) > 0;

    // ── Extract Receipt handler (webhook + SSE) ───────────────
    const handleExtractReceipt = useCallback(async () => {
        if (!hasReceipts || isExtracting) return;

        setIsExtracting(true);
        setExtractionProgress('Sending...');

        // Build documents payload from receipts
        const payloadDocuments = (order.receipts || []).flatMap(doc => {
            const pages = doc.documentPages || [];
            if (pages.length === 0) return [];

            const baseName = doc.documentName ? doc.documentName.replace(/\.[^/.]+$/, '') : 'receipt';

            if (pages.length === 1) {
                return [{ documentName: baseName, documentUrl: pages[0] }];
            } else {
                return pages.map((pageUrl: string, index: number) => ({
                    documentName: `${baseName}_page_${index + 1}`,
                    documentUrl: pageUrl
                }));
            }
        });

        try {
            const response = await fetch(`${config.workflowService}/workflow/webhooks/trigger/extract-receipt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderNumber: order.orderDetails.orderNumber,
                    templateId: '69e06daa6f204a5de0c24e1f',
                    documents: payloadDocuments
                })
            });

            if (!response.ok) {
                console.error('Receipt extraction API response error:', response.status);
                toast.error(`Receipt extraction failed. Status: ${response.status}`);
                setIsExtracting(false);
                setExtractionProgress('');
                return;
            }

            const responseData = await response.json();
            const executionId = responseData?.data?.executionId;

            if (!executionId) {
                console.error('No executionId found in response');
                toast.error('Receipt extraction failed — no execution ID returned');
                setIsExtracting(false);
                setExtractionProgress('');
                return;
            }

            setExtractionProgress('Processing...');

            // Listen for SSE events
            const streamUrl = `${config.workflowService}/workflow/executions/${executionId}/status-stream?apiKey=${API_KEY}`;
            const eventSource = new EventSource(streamUrl);

            eventSource.onmessage = async event => {
                try {
                    const jsonString = event.data;
                    if (!jsonString || jsonString.trim() === '' || jsonString === '{}') return;

                    const parsed = JSON.parse(jsonString);
                    if (parsed.status) {
                        if (['completed', 'failed', 'error', 'cancelled', 'timeout'].includes(parsed.status)) {
                            eventSource.close();

                            if (parsed.status === 'completed') {
                                const finalData = parsed.finalData?.[0] || {};

                                if (finalData.extractedData || finalData.recordId) {
                                    const receiptExtractionDetails = {
                                        recordId: finalData.recordId
                                    };

                                    // Update local order state
                                    const updatedOrder = { ...order, receiptExtractionDetails };
                                    onOrderUpdate?.(updatedOrder);

                                    // Persist to backend
                                    fetch(`${config.workflowService}/workflow/orders/${order.orderDetails.orderNumber}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ receiptExtractionDetails })
                                    }).catch(err => console.error('Failed to save receipt extraction details', err));

                                    toast.success('Receipt extraction completed');
                                } else {
                                    toast.success('Receipt extraction completed');
                                }
                            } else {
                                toast.error(`Receipt extraction ${parsed.status}`);
                            }

                            setIsExtracting(false);
                            setExtractionProgress('');
                        }
                    }
                } catch (e) {
                    console.error('Error processing receipt extraction SSE message:', e);
                }
            };

            eventSource.onerror = err => {
                console.error('SSE EventSource error:', err);
                eventSource.close();
                setIsExtracting(false);
                setExtractionProgress('');
            };
        } catch (err) {
            console.error('Receipt extraction API error:', err);
            setIsExtracting(false);
            setExtractionProgress('');
            toast.error('Receipt extraction failed');
        }
    }, [order, hasReceipts, isExtracting, toast, onOrderUpdate]);

    return (
        <>
            <div className="flex items-start justify-between gap-4 px-[22px] pt-[18px] pb-4 border-b border-gray-100">
                <div>
                    {/* Title row */}
                    <div className="flex items-center gap-2 flex-wrap mb-[6px]">
                        <span className="text-[22px] font-extrabold text-gray-900 tracking-tight">{od.orderNumber}</span>
                        <span className={`inline-flex items-center gap-1 text-xs font-extrabold ${status.text} ${status.bg} border ${status.border} px-2 py-[3px] rounded-full`}>
                            <span className={`w-[5px] h-[5px] rounded-full ${status.dot} inline-block`} />
                            {getStatusLabel(od.orderStatus)}
                        </span>
                        <span className="text-xs font-extrabold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-[3px] rounded-full">{od.orderType.toUpperCase()}</span>
                        {Array.isArray(od.productType) && od.productType.length > 0 && (
                            <span className="text-xs font-extrabold text-gray-500 bg-gray-100 border border-gray-200 px-2 py-[3px] rounded-full">
                                {(Array.isArray(od.productType) ? od.productType.join(', ') : String(od.productType || '')).toUpperCase()}
                            </span>
                        )}
                    </div>

                    {/* Meta row */}
                    <div className="flex items-center gap-1 text-[13px] text-gray-400 mb-[10px]">
                        <Clock size={13} className="text-gray-400" />
                        {order.orderDetails.orderCreatedDate ? formatDate(order.orderDetails.orderCreatedDate) : formatDate(order.createdAt || '')}
                        <span className="mx-1.5">•</span>
                        <Building2 size={13} className="text-gray-400" />
                        {od.location || od.branch}
                        <span className="mx-1.5">•</span>
                        <span className="text-gray-500 font-semibold">{od.documentSubmitStatus} Submission</span>
                    </div>

                    {/* Info chips */}
                    <div className="flex gap-2 flex-wrap">
                        {chips.map(({ icon, val, hide }, idx) => {
                            if (hide) return null;
                            return (
                                <div key={idx} className="inline-flex items-center gap-[5px] bg-gray-50 border border-gray-200 rounded-[7px] px-3 py-2 text-[13px] font-semibold text-gray-600">
                                    {icon}
                                    {val}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right side: actions + doc counts */}
                <div className="flex flex-col items-end gap-3 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        {onEdit && od.orderStatus !== 'submitted' && (
                            <GBtn
                                colorClass="text-blue-600"
                                borderClass="border-blue-200"
                                hoverClass="hover:bg-blue-50"
                                icon={<Edit size={11} />}
                                label="Edit"
                                onClick={() => onEdit(order)}
                                disabled={isProceeding}
                            />
                        )}
                        {onDelete && od.orderStatus !== 'submitted' && localStorage.getItem('is_developer') === 'true' && (
                            <GBtn
                                colorClass="text-red-600"
                                borderClass="border-red-200"
                                hoverClass="hover:bg-red-50"
                                icon={<Trash2 size={11} />}
                                label="Delete"
                                onClick={onDelete}
                                disabled={isProceeding}
                            />
                        )}
                    </div>
                    <div className="flex gap-[7px]">
                        {[
                            { n: docCounts.online, l: 'ONLINE', dark: false, show: showOnline },
                            { n: docCounts.email, l: 'EMAIL', dark: false, show: true },
                            { n: docCounts.manual, l: 'MANUAL', dark: false, show: true },
                            { n: docCounts.total, l: 'TOTAL', dark: true, show: true }
                        ].map(({ n, l, dark, show }) => {
                            if (!show) return null;
                            return (
                                <div key={l} className={`rounded-[10px] py-[9px] px-[13px] text-center min-w-[58px] border ${dark ? 'bg-[#012D56] border-gray-900' : 'bg-gray-50 border-gray-200'}`}>
                                    <div className={`text-2xl font-extrabold leading-none ${dark ? 'text-white' : 'text-gray-900'}`}>{n}</div>
                                    <div className={`text-[11px] font-bold tracking-[0.07em] mt-0.5 ${dark ? 'text-white/45' : 'text-gray-400'}`}>{l}</div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex flex-col items-end w-full gap-2">
                        {/* <div className="flex gap-2 items-center justify-end w-full">
                            <UploadReceipt orderNumber={order.orderDetails.orderNumber} onUploadComplete={onUploadComplete} />
                            {hasReceipts &&
                                (hasReceiptExtraction ? (
                                    <Button outlined onClick={() => setShowReceiptComparison(true)} startIcon={<Eye size={14} className="text-blue-500" />}>
                                        View Receipt Data
                                    </Button>
                                ) : (
                                    <Button
                                        outlined
                                        onClick={handleExtractReceipt}
                                        disabled={isExtracting}
                                        startIcon={isExtracting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} className="text-amber-500" />}
                                    >
                                        {isExtracting ? extractionProgress : 'Extract Receipt'}
                                    </Button>
                                ))}
                        </div> */}

                        {order.receipts && order.receipts.length > 0 && (
                            <div className="flex flex-wrap gap-[7px] justify-end w-full mt-2">
                                {order.receipts.map((receipt, idx) => {
                                    const url = receipt.documentPages?.[0] || '';
                                    return (
                                        <DocTile
                                            key={idx}
                                            file={{
                                                name: receipt.documentName,
                                                url: url,
                                                type: getFileType(url || receipt.documentName),
                                                source: 'upload',
                                                pages: receipt.documentPages,
                                                ignored: receipt.ignored,
                                                ignoredPages: receipt.ignoredPages || []
                                            }}
                                            onRemove={() => onRemoveReceipt?.(idx)}
                                            onRemovePage={pageIndex => {
                                                const updatedReceipts = [...(order.receipts || [])];
                                                const receiptToUpdate = { ...updatedReceipts[idx] };
                                                receiptToUpdate.documentPages = [...(receiptToUpdate.documentPages || [])];
                                                receiptToUpdate.documentPages.splice(pageIndex, 1);

                                                if (Array.isArray(receiptToUpdate.ignoredPages)) {
                                                    receiptToUpdate.ignoredPages = receiptToUpdate.ignoredPages
                                                        .filter(p => p !== pageIndex)
                                                        .map(p => (p > pageIndex ? p - 1 : p));
                                                    receiptToUpdate.ignored =
                                                        receiptToUpdate.ignoredPages.length === receiptToUpdate.documentPages.length &&
                                                        receiptToUpdate.documentPages.length > 0;
                                                }

                                                if (receiptToUpdate.documentPages.length === 0) {
                                                    onRemoveReceipt?.(idx);
                                                } else {
                                                    updatedReceipts[idx] = receiptToUpdate;
                                                    const updatedOrder = { ...order, receipts: updatedReceipts };
                                                    onOrderUpdate?.(updatedOrder);
                                                    fetch(`${config.workflowService}/workflow/orders/${order.orderDetails.orderNumber}`, {
                                                        method: 'PUT',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ receipts: updatedReceipts })
                                                    }).catch(err => console.error('Failed to update receipt page', err));
                                                }
                                            }}
                                            onToggleIgnorePage={pageIndex => {
                                                const updatedReceipts = [...(order.receipts || [])];
                                                const receiptToUpdate = { ...updatedReceipts[idx] };
                                                const currentIgnored: number[] = Array.isArray(receiptToUpdate.ignoredPages)
                                                    ? [...receiptToUpdate.ignoredPages]
                                                    : [];

                                                let updatedIgnored: number[];
                                                if (currentIgnored.includes(pageIndex)) {
                                                    updatedIgnored = currentIgnored.filter(p => p !== pageIndex);
                                                } else {
                                                    updatedIgnored = [...currentIgnored, pageIndex].sort((a, b) => a - b);
                                                }

                                                receiptToUpdate.ignoredPages = updatedIgnored;
                                                receiptToUpdate.ignored =
                                                    updatedIgnored.length === (receiptToUpdate.documentPages?.length || 0) &&
                                                    (receiptToUpdate.documentPages?.length || 0) > 0;
                                                updatedReceipts[idx] = receiptToUpdate;

                                                const updatedOrder = { ...order, receipts: updatedReceipts };
                                                onOrderUpdate?.(updatedOrder);
                                                fetch(`${config.workflowService}/workflow/orders/${order.orderDetails.orderNumber}`, {
                                                    method: 'PUT',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ receipts: updatedReceipts })
                                                }).catch(err => console.error('Failed to update receipt ignored pages', err));
                                            }}
                                            onToggleIgnoreAll={ignoreAll => {
                                                const updatedReceipts = [...(order.receipts || [])];
                                                const receiptToUpdate = { ...updatedReceipts[idx] };
                                                const numPages = receiptToUpdate.documentPages?.length || 1;

                                                if (ignoreAll) {
                                                    receiptToUpdate.ignoredPages = Array.from({ length: numPages }, (_, i) => i);
                                                    receiptToUpdate.ignored = true;
                                                } else {
                                                    receiptToUpdate.ignoredPages = [];
                                                    receiptToUpdate.ignored = false;
                                                }

                                                updatedReceipts[idx] = receiptToUpdate;
                                                const updatedOrder = { ...order, receipts: updatedReceipts };
                                                onOrderUpdate?.(updatedOrder);
                                                fetch(`${config.workflowService}/workflow/orders/${order.orderDetails.orderNumber}`, {
                                                    method: 'PUT',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ receipts: updatedReceipts })
                                                }).catch(err => console.error('Failed to update receipt ignore all status', err));
                                            }}
                                            orderStatus={order.orderDetails.orderStatus}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Fullscreen receipt comparison dialog */}
            <DialogComponent disableBlurCloseDialog isOpen={showReceiptComparison} closeDialog={() => setShowReceiptComparison(false)} fullScreen>
                <DocsnapComparisonUI
                    viewReceipt
                    order={order}
                    recordId={`${order.receiptExtractionDetails?.recordId || ''}`}
                    onClose={() => setShowReceiptComparison(false)}
                    onOrderUpdate={onOrderUpdate}
                />
            </DialogComponent>
        </>
    );
};

export default OrderCardHeader;
