import { useState, useEffect } from 'react';
import { config } from '../../../../../../config/default';
import type { ScannedDocument } from './types';

type EditableField = 'branchCode' | 'invoiceNumber' | 'orderType';

interface EditState {
    value: string;
    isEditing: boolean;
    isSaving: boolean;
}

interface UseDocumentEditReturn {
    branch: EditState;
    invoice: EditState;
    orderType: EditState;
    setBranchValue: (v: string) => void;
    setInvoiceValue: (v: string) => void;
    setOrderTypeValue: (v: string) => void;
    startEditing: (field: EditableField) => void;
    cancelEditing: (field: EditableField) => void;
    save: (field: EditableField) => Promise<void>;
}

/**
 * Manages the inline-edit state and PATCH API calls for the three
 * editable fields on a ScannedDocumentCard: branchCode, invoiceNumber, orderType.
 */
export const useDocumentEdit = (doc: ScannedDocument): UseDocumentEditReturn => {
    const [branch, setBranch] = useState<EditState>({
        value: doc.branchCode || '',
        isEditing: false,
        isSaving: false
    });
    const [invoice, setInvoice] = useState<EditState>({
        value: doc.invoiceNumber || '',
        isEditing: false,
        isSaving: false
    });
    const [orderType, setOrderType] = useState<EditState>({
        value: doc.orderType || '',
        isEditing: false,
        isSaving: false
    });

    // Keep local values in sync if the parent doc prop changes
    useEffect(() => {
        setBranch(prev => ({ ...prev, value: doc.branchCode || '' }));
        setInvoice(prev => ({ ...prev, value: doc.invoiceNumber || '' }));
        setOrderType(prev => ({ ...prev, value: doc.orderType || '' }));
    }, [doc.branchCode, doc.invoiceNumber, doc.orderType]);

    const startEditing = (field: EditableField) => {
        if (field === 'branchCode') setBranch(prev => ({ ...prev, isEditing: true }));
        if (field === 'invoiceNumber') setInvoice(prev => ({ ...prev, isEditing: true }));
        if (field === 'orderType') setOrderType(prev => ({ ...prev, isEditing: true }));
    };

    const cancelEditing = (field: EditableField) => {
        if (field === 'branchCode') setBranch({ value: doc.branchCode || '', isEditing: false, isSaving: false });
        if (field === 'invoiceNumber') setInvoice({ value: doc.invoiceNumber || '', isEditing: false, isSaving: false });
        if (field === 'orderType') setOrderType({ value: doc.orderType || '', isEditing: false, isSaving: false });
    };

    const save = async (field: EditableField) => {
        const docId = doc._id || (doc as any).id;
        if (!docId) return;

        // Mark as saving
        const setSaving = (saving: boolean, editing: boolean) => {
            if (field === 'branchCode') setBranch(prev => ({ ...prev, isSaving: saving, isEditing: editing }));
            if (field === 'invoiceNumber') setInvoice(prev => ({ ...prev, isSaving: saving, isEditing: editing }));
            if (field === 'orderType') setOrderType(prev => ({ ...prev, isSaving: saving, isEditing: editing }));
        };

        const currentValue = field === 'branchCode' ? branch.value : field === 'invoiceNumber' ? invoice.value : orderType.value;

        setSaving(true, true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${config.workflowService}/workflow/scanned-documents/${docId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ [field]: currentValue })
            });
            if (!res.ok) throw new Error('Failed to update');
        } catch (err) {
            console.error('Update error:', err);
        } finally {
            setSaving(false, false);
        }
    };

    return {
        branch,
        invoice,
        orderType,
        setBranchValue: (v: string) => setBranch(prev => ({ ...prev, value: v })),
        setInvoiceValue: (v: string) => setInvoice(prev => ({ ...prev, value: v })),
        setOrderTypeValue: (v: string) => setOrderType(prev => ({ ...prev, value: v })),
        startEditing,
        cancelEditing,
        save
    };
};
