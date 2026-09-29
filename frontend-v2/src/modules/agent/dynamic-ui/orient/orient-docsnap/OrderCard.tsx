import React, { useState, useEffect } from 'react';
import { FileText, Mail, UploadCloud, Link2, ArrowRight, Plus, Zap, Eye, RefreshCw, ArrowLeftRight, Trash2, AlertCircle } from 'lucide-react';
import GenericFileInput from '../../../../../components/DragAndDropFileInput';
import { DialogComponent } from '../../../../../components/DialogComponent';
import { Button } from '../../../../../components/Button';
import EmailLinkDialog from './EmailLinkDialog';
import { Order, FileItem } from './types';
import { config } from '../../../../../config/default';
import Spinner from '../../../../../components/Spinner';
import { DocsnapComparisonUI } from './docsnap-comparison-page';

// Extracted sub-components
import DocTile, { getFileType } from './DocTile';
import { STATUS_CONFIG, GBtn, ColIcon, ColCount, CurrencyMiniCard } from './OrderCardPrimitives';
import OrderCardHeader from './OrderCardHeader';

// ── Props ─────────────────────────────────────────────────────

interface OrderCardProps {
    order: Order;
    onLinkEmail: (orderNumber: number, emailId: string) => void;
    onUploadFiles: (orderNumber: number, files: File[]) => void;
    onRemoveUploadedFile: (orderNumber: number, fileIndex: number) => void;
    onRemoveWebDocument?: (orderNumber: number, fileIndex: number) => void;
    onRemoveEmailDocument?: (orderNumber: number, fileIndex: number) => void;
    onProceed: (orderNumber: number) => void;
    onEdit?: (order: Order) => void;
    onDelete?: (orderNumber: number) => void;
    isProceeding: boolean;
    isInitiating?: boolean;
    isUploading?: boolean;
    isInitiatingUpload?: boolean;
    isRetrying?: boolean;
    onDocsnapOpen?: () => void;
    onDocsnapClose?: () => void;
    onOrderUpdate?: (updatedOrder: Order) => void;
}

// ── Component ─────────────────────────────────────────────────

const OrderCard: React.FC<OrderCardProps> = ({
    order,
    onLinkEmail,
    onUploadFiles,
    onRemoveUploadedFile,
    onRemoveWebDocument,
    onRemoveEmailDocument,
    onProceed,
    onEdit,
    onDelete,
    isProceeding,
    isInitiating,
    isUploading,
    isInitiatingUpload,
    isRetrying,
    onDocsnapOpen,
    onDocsnapClose,
    onOrderUpdate
}) => {
    const [showLinkDialog, setShowLinkDialog] = useState(false);
    const [showUploader, setShowUploader] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showRecordDialog, setShowRecordDialog] = useState(false);
    const [extractionSeconds, setExtractionSeconds] = useState(0);
    const [showRetryDialog, setShowRetryDialog] = useState(false);
    const [showLimitErrorDialog, setShowLimitErrorDialog] = useState(false);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isProceeding) {
            setExtractionSeconds(0);
            interval = setInterval(() => {
                setExtractionSeconds(prev => prev + 1);
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isProceeding]);

    // Show/hide retry info dialog when isRetrying changes
    useEffect(() => {
        if (isRetrying) {
            setShowRetryDialog(true);
        }
    }, [isRetrying]);

    // Auto-dismiss retry dialog when extraction finishes (isProceeding becomes false)
    useEffect(() => {
        if (!isProceeding) {
            setShowRetryDialog(false);
        }
    }, [isProceeding]);

    const openRecordDialog = () => {
        setShowRecordDialog(true);
        onDocsnapOpen?.();
    };
    const closeRecordDialog = () => {
        setShowRecordDialog(false);
        onDocsnapClose?.();
    };

    // ── Derive file lists ─────────────────────────────────────
    const orderFiles: (FileItem & { index: number })[] = (order.webDocuments || []).map((doc, i) => {
        const url = doc.documentPages?.[0] || '';
        return {
            name: doc.documentName,
            url,
            type: getFileType(url),
            source: 'order' as const,
            pages: doc.documentPages || [],
            ignored: doc.ignored,
            ignoredPages: doc.ignoredPages || [],
            index: i
        };
    });

    const emailFiles: (FileItem & { index: number })[] = (order.emailDocuments || []).map((doc, i) => {
        const url = doc.documentPages?.[0] || '';
        return {
            name: doc.documentName,
            url,
            type: getFileType(url),
            source: 'email' as const,
            pages: doc.documentPages || [],
            ignored: doc.ignored,
            ignoredPages: doc.ignoredPages || [],
            index: i
        };
    });

    const uploadedFileItems: (FileItem & { index: number })[] = (order.manualDocuments || []).map((f, i) => {
        const url = f.documentPages?.[0] || '';
        return {
            name: f.documentName,
            url,
            type: getFileType(url),
            source: 'upload' as const,
            pages: f.documentPages || [],
            ignored: f.ignored,
            ignoredPages: f.ignoredPages || [],
            index: i
        };
    });

    const countActivePages = (f: FileItem) => {
        if (f.ignored) return 0;
        const total = f.pages?.length ?? (f.url ? 1 : 0);
        const ignored = f.ignoredPages?.length ?? 0;
        return Math.max(0, total - ignored);
    };

    const totalDocs = orderFiles.length + emailFiles.length + uploadedFileItems.length;
    const totalPages =
        orderFiles.reduce((acc, f) => acc + countActivePages(f), 0) +
        emailFiles.reduce((acc, f) => acc + countActivePages(f), 0) +
        uploadedFileItems.reduce((acc, f) => acc + countActivePages(f), 0);
    const hasDocuments = totalPages > 0;
    const status = STATUS_CONFIG[order.orderDetails.orderStatus.toUpperCase()] ?? STATUS_CONFIG.DEFAULT;
    const isOnline = (order.orderDetails?.documentSubmitStatus || '').toLowerCase() === 'online';

    // ── Handlers ──────────────────────────────────────────────
    const handleProceed = () => {
        if (totalPages > 25) {
            setShowLimitErrorDialog(true);
            return;
        }
        onProceed(order.orderDetails?.orderNumber);
    };

    const handleToggleIgnorePage = (docType: 'web' | 'email' | 'manual', fileIndex: number, pageIndex: number) => {
        const updatedOrder = { ...order };
        let docsArray: any[];
        let backendField: string;

        if (docType === 'web') {
            docsArray = updatedOrder.webDocuments = [...(order.webDocuments || [])];
            backendField = 'webDocuments';
        } else if (docType === 'email') {
            docsArray = updatedOrder.emailDocuments = [...(order.emailDocuments || [])];
            backendField = 'emailDocuments';
        } else {
            docsArray = updatedOrder.manualDocuments = [...(order.manualDocuments || [])];
            backendField = 'manualDocuments';
        }

        const doc = { ...docsArray[fileIndex] };
        const currentIgnored: number[] = Array.isArray(doc.ignoredPages) ? [...doc.ignoredPages] : [];

        let updatedIgnored: number[];
        if (currentIgnored.includes(pageIndex)) {
            updatedIgnored = currentIgnored.filter(p => p !== pageIndex);
        } else {
            updatedIgnored = [...currentIgnored, pageIndex].sort((a, b) => a - b);
        }

        doc.ignoredPages = updatedIgnored;
        doc.ignored = updatedIgnored.length === (doc.documentPages?.length || 0) && (doc.documentPages?.length || 0) > 0;
        docsArray[fileIndex] = doc;

        onOrderUpdate?.(updatedOrder);
        fetch(`${config.workflowService}/workflow/orders/${order.orderDetails.orderNumber}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [backendField]: docsArray })
        }).catch(err => console.error(`Failed to update ${docType} document ignored pages`, err));
    };

    const handleToggleIgnoreAll = (docType: 'web' | 'email' | 'manual', fileIndex: number, ignoreAll: boolean) => {
        const updatedOrder = { ...order };
        let docsArray: any[];
        let backendField: string;

        if (docType === 'web') {
            docsArray = updatedOrder.webDocuments = [...(order.webDocuments || [])];
            backendField = 'webDocuments';
        } else if (docType === 'email') {
            docsArray = updatedOrder.emailDocuments = [...(order.emailDocuments || [])];
            backendField = 'emailDocuments';
        } else {
            docsArray = updatedOrder.manualDocuments = [...(order.manualDocuments || [])];
            backendField = 'manualDocuments';
        }

        const doc = { ...docsArray[fileIndex] };
        const numPages = doc.documentPages?.length || 1;

        if (ignoreAll) {
            doc.ignoredPages = Array.from({ length: numPages }, (_, i) => i);
            doc.ignored = true;
        } else {
            doc.ignoredPages = [];
            doc.ignored = false;
        }

        docsArray[fileIndex] = doc;

        onOrderUpdate?.(updatedOrder);
        fetch(`${config.workflowService}/workflow/orders/${order.orderDetails.orderNumber}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [backendField]: docsArray })
        }).catch(err => console.error(`Failed to update ${docType} document ignore all status`, err));
    };

    const handleRemovePage = (docType: 'web' | 'email' | 'manual', fileIndex: number, pageIndex: number) => {
        const updatedOrder = { ...order };
        let docsArray: any[];
        let backendField: string;
        let removeWholeHandler: any;

        if (docType === 'web') {
            docsArray = updatedOrder.webDocuments = [...(order.webDocuments || [])];
            backendField = 'webDocuments';
            removeWholeHandler = onRemoveWebDocument;
        } else if (docType === 'email') {
            docsArray = updatedOrder.emailDocuments = [...(order.emailDocuments || [])];
            backendField = 'emailDocuments';
            removeWholeHandler = onRemoveEmailDocument;
        } else {
            docsArray = updatedOrder.manualDocuments = [...(order.manualDocuments || [])];
            backendField = 'manualDocuments';
            removeWholeHandler = onRemoveUploadedFile;
        }

        const doc = { ...docsArray[fileIndex] };
        docsArray[fileIndex] = doc;
        doc.documentPages = [...(doc.documentPages || [])];

        doc.documentPages.splice(pageIndex, 1);

        if (Array.isArray(doc.ignoredPages)) {
            doc.ignoredPages = doc.ignoredPages.filter((p: any) => p !== pageIndex).map((p: any) => (p > pageIndex ? p - 1 : p));
            doc.ignored = doc.ignoredPages.length === doc.documentPages.length && doc.documentPages.length > 0;
        }

        if (doc.documentPages.length === 0) {
            removeWholeHandler?.(order.orderDetails.orderNumber, fileIndex);
        } else {
            onOrderUpdate?.(updatedOrder);
            fetch(`${config.workflowService}/workflow/orders/${order.orderDetails.orderNumber}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [backendField]: docsArray })
            }).catch(err => console.error(`Failed to remove ${docType} document page`, err));
        }
    };

    // ── Render ────────────────────────────────────────────────
    return (
        <div className="font-[DM_Sans,Segoe_UI,sans-serif] bg-white border border-gray-200 rounded-2xl overflow-hidden w-full shadow-lg shadow-gray-200/80">
            <div className={`h-[3px] bg-gradient-to-r ${status.stripe} to-transparent`} />

            {/* Header */}
            <OrderCardHeader
                order={order}
                status={status}
                docCounts={{ online: orderFiles.length, email: emailFiles.length, manual: uploadedFileItems.length, total: totalDocs }}
                showOnline={isOnline}
                isProceeding={isProceeding}
                onEdit={onEdit}
                onDelete={onDelete ? () => setShowDeleteConfirm(true) : undefined}
                onUploadComplete={newDocs => {
                    if (newDocs.length > 0) {
                        const updatedReceipts = [...(order.receipts || []), ...newDocs];
                        const updatedOrder = { ...order, receipts: updatedReceipts };
                        onOrderUpdate?.(updatedOrder);
                        // Persist to backend
                        fetch(`${config.workflowService}/workflow/orders/${order.orderDetails.orderNumber}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ receipts: updatedReceipts })
                        }).catch(err => console.error('Failed to persist receipt upload', err));
                    }
                }}
                onRemoveReceipt={idx => {
                    const updatedReceipts = [...(order.receipts || [])];
                    updatedReceipts.splice(idx, 1);
                    const updatedOrder = { ...order, receipts: updatedReceipts };
                    onOrderUpdate?.(updatedOrder);
                    // Persist to backend
                    fetch(`${config.workflowService}/workflow/orders/${order.orderDetails.orderNumber}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ receipts: updatedReceipts })
                    }).catch(err => console.error('Failed to persist receipt removal', err));
                }}
                onOrderUpdate={onOrderUpdate}
            />

            {/* Document columns */}
            <div className={`grid ${isOnline ? 'grid-cols-3' : 'grid-cols-2'} border-b border-gray-100 min-h-[200px]`}>
                {/* Online Documents */}
                {isOnline && (
                    <DocumentColumn
                        title="Online Documents"
                        icon={<FileText size={15} className="text-blue-500" />}
                        iconBg="bg-blue-50"
                        iconBorder="border-blue-200"
                        countColor={{ text: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-200' }}
                        count={orderFiles.length}
                        emptyText="No documents attached"
                        hasBorderRight
                    >
                        <div className="flex flex-wrap gap-[7px] p-2">
                            {orderFiles.map((f, i) => (
                                <DocTile
                                    key={i}
                                    file={f}
                                    onRemove={onRemoveWebDocument ? () => onRemoveWebDocument(order.orderDetails.orderNumber, f.index) : undefined}
                                    onRemovePage={onRemoveWebDocument ? pageIndex => handleRemovePage('web', f.index, pageIndex) : undefined}
                                    onToggleIgnorePage={pageIndex => handleToggleIgnorePage('web', f.index, pageIndex)}
                                    onToggleIgnoreAll={ignoreAll => handleToggleIgnoreAll('web', f.index, ignoreAll)}
                                    orderStatus={order.orderDetails.orderStatus}
                                />
                            ))}
                        </div>
                    </DocumentColumn>
                )}

                {/* Email Documents */}
                <div className="p-2 border-r border-gray-100 min-w-0">
                    <div className="flex items-center justify-between mb-[11px] bg-gray-100 p-3 rounded-lg">
                        <div className="flex items-center gap-[8px]">
                            <ColIcon bg="bg-violet-50" border="border-violet-200">
                                <Mail size={15} className="text-violet-500" />
                            </ColIcon>
                            <span className="text-[15px] font-bold text-gray-700">Email Documents</span>
                            {/* <ColCount colorClass="text-violet-700" bgClass="bg-violet-100" borderClass="border-violet-200" n={emailFiles.length} /> */}
                        </div>
                        <div className="flex items-center gap-2">
                            {/* {emailFiles.length > 0 && (
                                <GBtn
                                    colorClass="text-red-600"
                                    borderClass="border-red-200"
                                    hoverClass="hover:bg-red-50"
                                    icon={<Trash2 size={11} />}
                                    label="Remove All"
                                    onClick={() => {
                                        if (window.confirm('Are you sure you want to remove all email documents?')) {
                                            const updatedOrder = { ...order, emailDocuments: [] };
                                            onOrderUpdate?.(updatedOrder);
                                            fetch(`${config.workflowService}/workflow/orders/${order.orderDetails.orderNumber}`, {
                                                method: 'PUT',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ emailDocuments: [] })
                                            }).catch(err => console.error('Failed to remove all email documents', err));
                                        }
                                    }}
                                />
                            )} */}
                            <GBtn
                                colorClass="text-violet-700"
                                borderClass="border-violet-300/50"
                                hoverClass="hover:bg-violet-50"
                                icon={<Plus size={11} />}
                                label="Add Files"
                                onClick={() => setShowLinkDialog(true)}
                            />
                        </div>
                    </div>

                    {emailFiles.length > 0 ? (
                        <div className="flex flex-wrap gap-[7px] p-2">
                            {emailFiles.map((f, i) => (
                                <DocTile
                                    key={i}
                                    file={f}
                                    onRemove={onRemoveEmailDocument ? () => onRemoveEmailDocument(order.orderDetails.orderNumber, f.index) : undefined}
                                    onRemovePage={onRemoveEmailDocument ? pageIndex => handleRemovePage('email', f.index, pageIndex) : undefined}
                                    onToggleIgnorePage={pageIndex => handleToggleIgnorePage('email', f.index, pageIndex)}
                                    onToggleIgnoreAll={ignoreAll => handleToggleIgnoreAll('email', f.index, ignoreAll)}
                                    orderStatus={order.orderDetails.orderStatus}
                                />
                            ))}
                        </div>
                    ) : (
                        <span className="text-[13px] text-gray-300 italic">No email linked yet</span>
                    )}

                    <DialogComponent isOpen={showLinkDialog} closeDialog={() => setShowLinkDialog(false)} name="Select an Email to Link" className="w-[80vw] h-[90vh]">
                        <EmailLinkDialog
                            onLink={id => {
                                onLinkEmail(order.orderDetails.orderNumber, id);
                                setShowLinkDialog(false);
                            }}
                        />
                    </DialogComponent>
                </div>

                {/* Manual Documents */}
                <div className="p-2 min-w-0">
                    <div className="flex items-center justify-between mb-[11px] bg-gray-100 p-3 rounded-lg">
                        <div className="flex items-center gap-[8px]">
                            <ColIcon bg="bg-emerald-50" border="border-emerald-200">
                                {isUploading ? <Spinner size={15} /> : <UploadCloud size={15} className="text-emerald-500" />}
                            </ColIcon>
                            <span className="text-[15px] font-bold text-gray-700">{isInitiatingUpload ? 'Initiating...' : isUploading ? 'Uploading...' : 'Manual Documents'}</span>
                            {/* <ColCount colorClass="text-emerald-800" bgClass="bg-emerald-100" borderClass="border-emerald-300" n={uploadedFileItems.length} /> */}
                        </div>
                        <div className="flex items-center gap-2">
                            {uploadedFileItems.length > 0 && order.orderDetails.orderStatus !== 'submitted' && (
                                <GBtn
                                    colorClass="text-red-600"
                                    borderClass="border-red-200"
                                    hoverClass="hover:bg-red-50"
                                    icon={<Trash2 size={11} />}
                                    label="Remove All"
                                    onClick={() => {
                                        if (window.confirm('Are you sure you want to remove all manual documents?')) {
                                            const updatedOrder = { ...order, manualDocuments: [] };
                                            onOrderUpdate?.(updatedOrder);
                                            fetch(`${config.workflowService}/workflow/orders/${order.orderDetails.orderNumber}`, {
                                                method: 'PUT',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ manualDocuments: [] })
                                            }).catch(err => console.error('Failed to remove all manual documents', err));
                                        }
                                    }}
                                />
                            )}
                            <GBtn
                                colorClass="text-emerald-700"
                                borderClass="border-emerald-300/50"
                                hoverClass="hover:bg-emerald-50"
                                icon={isUploading ? <Spinner size={11} /> : <Plus size={11} />}
                                label={isInitiatingUpload ? 'Initiating' : isUploading ? 'Uploading' : 'Add Files'}
                                onClick={() => !isUploading && setShowUploader(true)}
                            />
                        </div>
                    </div>

                    {uploadedFileItems.length > 0 ? (
                        <div className="flex flex-wrap gap-[7px] p-2">
                            {uploadedFileItems.map((f, i) => (
                                <DocTile
                                    key={i}
                                    file={f}
                                    onRemove={() => onRemoveUploadedFile(order.orderDetails.orderNumber, f.index)}
                                    onRemovePage={pageIndex => handleRemovePage('manual', f.index, pageIndex)}
                                    onToggleIgnorePage={pageIndex => handleToggleIgnorePage('manual', f.index, pageIndex)}
                                    onToggleIgnoreAll={ignoreAll => handleToggleIgnoreAll('manual', f.index, ignoreAll)}
                                    orderStatus={order.orderDetails.orderStatus}
                                />
                            ))}
                        </div>
                    ) : (
                        <span className="text-[13px] text-gray-300 italic">No files uploaded yet</span>
                    )}

                    <DialogComponent isOpen={showUploader} closeDialog={() => setShowUploader(false)} name="Upload Files" className="w-[90vw]">
                        <div className="p-6">
                            <GenericFileInput
                                onFilesChange={files => {
                                    onUploadFiles(order.orderDetails.orderNumber, files);
                                    setShowUploader(false);
                                }}
                                multiple
                                dropText="Drag & drop files here"
                                browseText="browse"
                                className="h-[80vh] bg-white border-2 border-dashed border-emerald-300"
                                accept=".png,.jpeg,.jpg,.pdf,.webp,.heic"
                            />
                        </div>
                    </DialogComponent>
                </div>
            </div>

            {/* Footer: currency cards + extract button */}
            <div className="px-[22px] py-[13px] flex items-center justify-between bg-slate-50/30 border-t border-gray-50">
                <div className="flex flex-wrap items-center gap-2.5">
                    {order.currencyDetails?.map((item, idx) => (
                        <CurrencyMiniCard key={idx} item={item} />
                    ))}
                    {order.maraekatDetails?.eonBookingNumber && (
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5">
                            <ArrowLeftRight size={13} className="text-green-500" />
                            <span className="text-[11px] font-bold tracking-wide text-green-400 uppercase">EON</span>
                            <span className="text-[13px] font-extrabold text-green-700">{order.maraekatDetails.eonBookingNumber}</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {/* {localStorage.getItem('is_developer') === 'true' && ( */}
                    <div className="w-8">
                        {extractionSeconds > 0 ? (
                            <span className="text-[13px] font-medium text-green-500 ">{extractionSeconds}s</span>
                        ) : order.extractionDetails?.extractionDuration ? (
                            <span className="text-[13px] font-medium text-green-500 ">{order.extractionDetails?.extractionDuration}s</span>
                        ) : null}
                    </div>

                    {!order.extractionDetails?.recordId ? (
                        <Button
                            startIcon={isProceeding ? <Spinner size={16} /> : <Zap size={15} />}
                            outlined
                            onClick={handleProceed}
                            disabled={!hasDocuments || isProceeding}
                            endIcon={!isProceeding && <ArrowRight size={15} />}
                        >
                            {isInitiating ? 'Initiating…' : isProceeding ? 'Processing…' : 'Extract Documents'}
                        </Button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Button
                                hidden={order.orderDetails.orderStatus === 'submitted'}
                                startIcon={isProceeding ? <Spinner size={12} /> : <RefreshCw size={12} />}
                                outlined
                                onClick={handleProceed}
                                disabled={!hasDocuments || isProceeding}
                            >
                                {isInitiating ? 'Initiating…' : isProceeding ? 'Processing…' : 'Re-Extract'}
                            </Button>
                            <Button startIcon={<Eye size={15} />} outlined onClick={openRecordDialog}>
                                View Extracted Data
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Delete confirmation dialog */}
            {onDelete && (
                <DialogComponent isOpen={showDeleteConfirm} closeDialog={() => setShowDeleteConfirm(false)} name="Delete Order?" className="max-w-[600px]">
                    <div className="p-6">
                        <div className="text-gray-600 mb-6">
                            <div className="text-sm">
                                Order<strong className=" text-sm"> {order.orderDetails.orderNumber}</strong> will be permanently deleted. This action cannot be undone
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button outlined onClick={() => setShowDeleteConfirm(false)}>
                                Keep Order
                            </Button>
                            <Button
                                onClick={() => {
                                    onDelete(order.orderDetails.orderNumber);
                                    setShowDeleteConfirm(false);
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white border-red-600"
                            >
                                Delete
                            </Button>
                        </div>
                    </div>
                </DialogComponent>
            )}

            {/* Fullscreen docsnap comparison dialog */}
            <DialogComponent disableBlurCloseDialog isOpen={showRecordDialog} closeDialog={closeRecordDialog} fullScreen>
                <DocsnapComparisonUI order={order} recordId={`${order.extractionDetails?.recordId}`} onClose={closeRecordDialog} onOrderUpdate={onOrderUpdate} />
            </DialogComponent>

            {/* Extraction retry info dialog */}
            <DialogComponent isOpen={showRetryDialog} closeDialog={() => setShowRetryDialog(false)} name="Re-Extracting Documents" className="max-w-[480px]">
                <div className="p-6 flex flex-col items-center text-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
                        <AlertCircle size={24} className="text-amber-500" />
                    </div>
                    <div>
                        <p className="text-[15px] font-semibold text-gray-800 mb-1">Extraction is taking longer than expected</p>
                        <p className="text-[13px] text-gray-500">
                            The extraction for order <strong>{order.orderDetails.orderNumber}</strong> exceeded 100 seconds. The system is automatically retrying the extraction. Please wait...
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-amber-600">
                        <Spinner size={16} />
                        <span className="text-[13px] font-medium">Re-extracting...</span>
                    </div>
                </div>
            </DialogComponent>

            {/* Limit error dialog */}
            <DialogComponent isOpen={showLimitErrorDialog} closeDialog={() => setShowLimitErrorDialog(false)} name="Page Limit Exceeded" className="min-w-[480px]">
                <div className="p-6 flex flex-col items-center text-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
                        <AlertCircle size={24} className="text-red-500" />
                    </div>
                    <div>
                        {/* <p className="text-[15px] font-semibold text-gray-800 mb-1">Limit Exceeded</p> */}
                        <p className="text-[13px] text-gray-500">
                            Maximum 25 pages limit exceeded.
                            <br /> Please remove unnecessary pages and try again.
                        </p>
                    </div>
                    <div className="flex justify-center mt-2 w-full">
                        <Button onClick={() => setShowLimitErrorDialog(false)} className="bg-red-600 hover:bg-red-700 text-white border-red-600 px-6">
                            Close
                        </Button>
                    </div>
                </div>
            </DialogComponent>
        </div>
    );
};

// ── Reusable document column wrapper ──────────────────────────

const DocumentColumn: React.FC<{
    title: string;
    icon: React.ReactNode;
    iconBg: string;
    iconBorder: string;
    countColor: { text: string; bg: string; border: string };
    count: number;
    emptyText: string;
    hasBorderRight?: boolean;
    action?: React.ReactNode;
    children: React.ReactNode;
}> = ({ title, icon, iconBg, iconBorder, countColor, count, emptyText, hasBorderRight, action, children }) => (
    <div className={`p-2 min-w-0 ${hasBorderRight ? 'border-r border-gray-100' : ''}`}>
        <div className="flex items-center justify-between mb-[11px] bg-gray-100 p-3 rounded-lg">
            <div className="flex items-center gap-[8px]">
                <ColIcon bg={iconBg} border={iconBorder}>
                    {icon}
                </ColIcon>
                <span className="text-[15px] font-bold text-gray-700">{title}</span>
                {/* <ColCount colorClass={countColor.text} bgClass={countColor.bg} borderClass={countColor.border} n={count} /> */}
            </div>
            {action}
        </div>
        {count > 0 ? children : <span className="text-[13px] text-gray-300 italic">{emptyText}</span>}
    </div>
);

export default OrderCard;
