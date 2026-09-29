import React, { useState } from 'react';
import { RotateCw, X, Hash, HardDrive, Calendar, Building2, Loader2, Eye, Tag, AlertCircle } from 'lucide-react';
import { config } from '../../../../../../config/default';
import { STATUS_CONFIG, API_KEY } from './constants';
import { formatBytes, formatDate, getFileName } from './utils';
import { useDocumentEdit } from './useDocumentEdit';
import { useRetry } from './useRetry';
import MetaPill from './MetaPill';
import InvoicePreviewIcon from './InvoicePreviewIcon';
import type { ScannedDocument } from './types';
import { useToastStore } from '../../../../../../components/toast/ToastStore';

interface ScannedDocumentCardProps {
    doc: ScannedDocument;
    onRefresh?: () => void;
}

/**
 * Renders a single scanned document row with:
 * - Invoice hover-preview icon
 * - Inline-editable branch, invoice number, and order type
 * - Metadata pills (size, date, error)
 * - Status badge, preview button, and retry button
 */
const ScannedDocumentCard: React.FC<ScannedDocumentCardProps> = ({ doc, onRefresh }) => {
    const statusCfg = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG['pending'];
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isReExtracting, setIsReExtracting] = useState(false);
    const toast = useToastStore();

    const edit = useDocumentEdit(doc);
    const { isSubmitting, handleResubmit } = useRetry(doc, onRefresh);

    // ── Re-Extract document ──────────────────────────────────
    const handleReExtract = async (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const docId = doc._id || (doc as any).id;
        if (!docId) return;

        setIsReExtracting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${config.workflowService}/workflow/scanned-documents/${docId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ status: 'pending', errorMessage: null })
            });

            if (!res.ok) {
                throw new Error('Failed to update status');
            }

            toast.success('Successfully added to extraction queue', { duration: 8000 });
            onRefresh?.();
        } catch (err) {
            console.error('Re-Extract error:', err);
            toast.error('Failed to update status');
        } finally {
            setIsReExtracting(false);
        }
    };

    // ── Document preview (opens in new tab) ───────────────────
    const handlePreviewClick = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!doc.path) return;

        setIsPreviewing(true);
        setTimeout(() => setIsPreviewing(false), 3000);

        const token = localStorage.getItem('token');
        const previewUrl = `${config.workflowService}/workflow/executions/files?path=${encodeURIComponent(doc.path)}`;

        fetch(previewUrl, {
            headers: { Authorization: `Bearer ${token}`, 'x-api-key': API_KEY }
        })
            .then(res => {
                if (!res.ok) throw new Error('Failed to load preview');
                return res.blob();
            })
            .then(blob => {
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
            })
            .catch(err => console.error('Preview error:', err));
    };

    return (
        <div className="scanned-document-card font-[DM_Sans,Segoe_UI,sans-serif] bg-white border border-gray-200 rounded-xl w-full shadow-sm shadow-gray-100 transition-all duration-150 hover:shadow-md hover:border-gray-300 cursor-pointer">
            <div className="flex items-stretch h-full">
                {/* Left status accent bar */}
                <div className={`w-[3px] flex-shrink-0 bg-gradient-to-b ${statusCfg.stripe} to-transparent rounded-l-4xl relative top-1`} />

                <div className="flex-1 flex items-center gap-4 px-5 py-5 min-w-0">
                    {/* Invoice hover-preview icon */}
                    <InvoicePreviewIcon invoicePagePath={doc.invoicePagePath} />

                    {/* File name + path */}
                    <div className="min-w-0 flex-shrink" style={{ width: '24%' }}>
                        <p className="text-[14px] font-bold text-gray-800 truncate leading-tight" title={doc.name}>
                            {getFileName(doc.name)}
                        </p>
                        <p className="text-[11px] text-gray-400 truncate font-mono mt-0.5" title={doc.path}>
                            {doc.path}
                        </p>
                    </div>

                    <div className="h-9 w-px bg-gray-100 flex-shrink-0" />

                    {/* Editable metadata pills */}
                    <div className="flex items-center gap-2 flex-1 flex-wrap min-w-0" onClick={e => e.stopPropagation()}>
                        {/* Branch */}
                        {edit.branch.isEditing ? (
                            <InlineEditRow
                                value={edit.branch.value}
                                onChange={edit.setBranchValue}
                                onSave={() => edit.save('branchCode')}
                                onCancel={() => edit.cancelEditing('branchCode')}
                                isSaving={edit.branch.isSaving}
                                inputClass="border-blue-300 focus:ring-blue-500 w-24"
                                saveClass="bg-blue-600 hover:bg-blue-700"
                            />
                        ) : (
                            <div
                                onClick={e => {
                                    e.stopPropagation();
                                    if (doc.status !== 'success') edit.startEditing('branchCode');
                                }}
                                className={doc.status === 'success' ? '' : 'cursor-pointer'}
                            >
                                {edit.branch.value ? (
                                    <MetaPill icon={<Building2 size={12} className="text-blue-500" />} colorClass="bg-blue-50 text-blue-700 border-blue-100 hover:border-blue-300 transition-colors">
                                        Branch: {edit.branch.value}
                                    </MetaPill>
                                ) : (
                                    <EmptyFieldInput placeholder="Add Branch" colorClass="border-blue-500 text-blue-700 placeholder-blue-600" disabled={doc.status === 'success'} />
                                )}
                            </div>
                        )}

                        {/* Invoice number */}
                        {edit.invoice.isEditing ? (
                            <InlineEditRow
                                value={edit.invoice.value}
                                onChange={edit.setInvoiceValue}
                                onSave={() => edit.save('invoiceNumber')}
                                onCancel={() => edit.cancelEditing('invoiceNumber')}
                                isSaving={edit.invoice.isSaving}
                                inputClass="border-violet-300 focus:ring-violet-500 w-28"
                                saveClass="bg-violet-600 hover:bg-violet-700"
                            />
                        ) : (
                            <div
                                onClick={e => {
                                    e.stopPropagation();
                                    if (doc.status !== 'success') edit.startEditing('invoiceNumber');
                                }}
                                className={doc.status === 'success' ? '' : 'cursor-pointer'}
                            >
                                {edit.invoice.value ? (
                                    <MetaPill
                                        icon={<Hash size={12} className="text-violet-500" />}
                                        colorClass="bg-violet-50 text-violet-700 border-violet-100 hover:border-violet-300 transition-colors"
                                    >
                                        Invoice No: {edit.invoice.value}
                                    </MetaPill>
                                ) : (
                                    <EmptyFieldInput placeholder="Add Invoice No" colorClass="border-violet-500 text-violet-700 placeholder-violet-600" disabled={doc.status === 'success'} />
                                )}
                            </div>
                        )}

                        {/* Order type */}
                        {edit.orderType.isEditing ? (
                            <InlineEditRow
                                value={edit.orderType.value}
                                onChange={edit.setOrderTypeValue}
                                onSave={() => edit.save('orderType')}
                                onCancel={() => edit.cancelEditing('orderType')}
                                isSaving={edit.orderType.isSaving}
                                inputClass="border-gray-300 focus:ring-gray-500 w-28"
                                saveClass="bg-gray-600 hover:bg-gray-700"
                            />
                        ) : (
                            <div
                                onClick={e => {
                                    e.stopPropagation();
                                    if (doc.status !== 'success') edit.startEditing('orderType');
                                }}
                                className={doc.status === 'success' ? '' : 'cursor-pointer'}
                            >
                                {edit.orderType.value ? (
                                    <MetaPill icon={<Tag size={12} className="text-gray-500" />} colorClass="bg-gray-50 text-gray-700 border-gray-100 hover:border-gray-300 transition-colors">
                                        {edit.orderType.value}
                                    </MetaPill>
                                ) : (
                                    <EmptyFieldInput placeholder="Add Order Type" colorClass="border-gray-500 text-gray-700 placeholder-emerald-600" disabled={doc.status === 'success'} />
                                )}
                            </div>
                        )}

                        {/* Read-only metadata */}
                        <MetaPill icon={<HardDrive size={12} className="text-slate-400" />} colorClass="bg-slate-50 text-slate-600 border-slate-100">
                            {formatBytes(doc.size)}
                        </MetaPill>
                        <MetaPill icon={<Calendar size={12} className="text-slate-500" />} colorClass="bg-slate-50 text-slate-700 border-slate-100">
                            {formatDate(doc.fileAddedAt)}
                        </MetaPill>
                        {doc.errorMessage && (
                            <MetaPill icon={<AlertCircle size={12} className="text-red-500" />} colorClass="bg-red-50 text-red-700 border-red-100">
                                {doc.errorMessage}
                            </MetaPill>
                        )}
                    </div>

                    {/* Status badge + actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold border ${statusCfg.badgeBg}`}>
                            {statusCfg.icon}
                            {statusCfg.label}
                        </span>

                        <button
                            onClick={handlePreviewClick}
                            className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-blue-600 transition-colors text-xs font-semibold"
                            title="Preview Document"
                        >
                            {isPreviewing ? <Loader2 size={14} className="animate-spin text-blue-500" /> : <Eye size={14} />}
                            Preview
                        </button>

                        {doc.status === 'failed' && (
                            <button
                                onClick={handleReExtract}
                                disabled={isReExtracting}
                                className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 transition-colors text-xs font-semibold"
                                title="Re-Extract Document"
                            >
                                {isReExtracting ? <Loader2 size={14} className="animate-spin text-gray-500" /> : <RotateCw size={14} />}
                                Re-Extract
                            </button>
                        )}

                        {(doc.status === 'extracted' || doc.status === 'failed') && (
                            <button
                                onClick={handleResubmit}
                                disabled={isSubmitting}
                                className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 transition-colors text-xs font-semibold"
                                title="Submit Document"
                            >
                                {isSubmitting ? <Loader2 size={14} className="animate-spin text-gray-500" /> : <RotateCw size={14} />}
                                Submit
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Private helpers ────────────────────────────────────────────

/** Inline text input + Update/Cancel controls shown while editing a field. */
const InlineEditRow: React.FC<{
    value: string;
    onChange: (v: string) => void;
    onSave: () => void;
    onCancel: () => void;
    isSaving: boolean;
    inputClass: string;
    saveClass: string;
}> = ({ value, onChange, onSave, onCancel, isSaving, inputClass, saveClass }) => (
    <div className="flex items-center gap-1">
        <input
            type="text"
            value={value}
            autoFocus
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSave()}
            className={`h-6 px-2 text-[12px] border rounded focus:outline-none focus:ring-1 ${inputClass}`}
        />
        <button onClick={onSave} disabled={isSaving} className={`h-6 px-2 text-[11px] font-bold text-white rounded disabled:opacity-50 cursor-pointer ${saveClass}`}>
            {isSaving ? '...' : 'Update'}
        </button>
        <button onClick={onCancel} className="h-6 w-6 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded cursor-pointer">
            <X size={12} />
        </button>
    </div>
);

/** Dashed placeholder shown when a field has no value yet. */
const EmptyFieldInput: React.FC<{ placeholder: string; colorClass: string; disabled?: boolean }> = ({ placeholder, colorClass, disabled }) => (
    <input
        type="text"
        placeholder={placeholder}
        readOnly
        className={`h-6 px-2 text-[11px] border border-dashed rounded focus:outline-none w-28 bg-transparent ${disabled ? 'cursor-default' : 'cursor-pointer'} ${colorClass}`}
    />
);

export default ScannedDocumentCard;
