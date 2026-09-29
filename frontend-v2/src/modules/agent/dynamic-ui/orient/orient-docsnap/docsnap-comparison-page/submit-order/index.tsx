import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Order } from '../../types';
import { DraggableResultCard } from './DraggableResultCard';
import { useSubmitKyc } from './useSubmitKyc';
import { useSubmitReceipts } from './useSubmitReceipts';
import { useSubmitCurrency } from './useSubmitCurrency';
import { config } from '../../../../../../../config/default';

interface SubmitOrderProps {
    order: Order;
    extractedData: any;
    onOrderUpdate?: (updatedOrder: Order) => void;
    onBeforeSubmit?: () => Promise<void>;
    isKycSubmitted?: boolean;
    isRecPaySubmitted?: boolean;
    isCurrencySubmitted?: boolean;
}

type SubmitPhase = 'idle' | 'kyc' | 'receipts' | 'currency';

/**
 * SubmitOrder — Single submit button that orchestrates the entire submission flow:
 *
 *  Step 1: Submit KYC → get eonBookingNumber
 *  Step 2: Submit Receipts (skipped if receipts array is empty)
 *  Step 3: Submit Currency Exchange
 *
 * Each step has specific error handling and the flow stops on first failure.
 */
const SubmitOrder: React.FC<SubmitOrderProps> = ({ order, extractedData, onOrderUpdate, onBeforeSubmit, isKycSubmitted, isRecPaySubmitted, isCurrencySubmitted }) => {
    const [phase, setPhase] = useState<SubmitPhase>('idle');
    const [isCheckingEmail, setIsCheckingEmail] = useState(false);
    const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
    const [duplicateOrder, setDuplicateOrder] = useState<any | null>(null);
    const continueSubmitRef = useRef<(() => void) | null>(null);

    // Track the latest order so subsequent steps use the enriched order
    // (with eonBookingNumber) that KYC returns via onOrderUpdate.
    const latestOrderRef = useRef<Order>(order);

    const wrappedOnOrderUpdate = (updatedOrder: Order) => {
        latestOrderRef.current = updatedOrder;
        onOrderUpdate?.(updatedOrder);
    };

    const { resultMessage, setResultMessage, submitKyc, isInitiatingKyc } = useSubmitKyc({
        order,
        extractedData,
        onOrderUpdate: wrappedOnOrderUpdate,
        onBeforeSubmit
    });

    const { submitReceipts } = useSubmitReceipts({
        extractedData,
        onOrderUpdate: wrappedOnOrderUpdate
    });

    const { submitCurrency } = useSubmitCurrency({
        extractedData,
        onOrderUpdate: wrappedOnOrderUpdate
    });

    const isSubmitting = phase !== 'idle' || isCheckingEmail;
    const allDone = isKycSubmitted && isRecPaySubmitted && isCurrencySubmitted;

    const handleSubmit = async () => {
        if (isSubmitting || allDone) return;

        const nationality = extractedData?.passport?.nationality?.value;
        if (nationality && !['INDIA', 'INDIAN'].includes(nationality.toUpperCase())) {
            alert('Only Indian passports are allowed for submission.');
        }

        // ── Email duplicate check (skip if EON number already exists) ──
        const userEmail = order?.userDetails?.email;
        const hasEonNumber = Boolean(order?.maraekatDetails?.eonBookingNumber);
        if (userEmail && !hasEonNumber) {
            setIsCheckingEmail(true);
            try {
                const emailCheckController = new AbortController();
                const emailCheckTimeoutId = setTimeout(() => emailCheckController.abort(), 3000);
                const res = await fetch(`${config.workflowService}/workflow/orders/check-email?email=${encodeURIComponent(userEmail)}`, {
                    signal: emailCheckController.signal
                });
                clearTimeout(emailCheckTimeoutId);
                if (res.ok) {
                    const data = await res.json();
                    if (data.exists) {
                        setIsCheckingEmail(false);
                        // Show warning dialog and wait for user decision
                        setDuplicateOrder(data.order ?? null);
                        setShowDuplicateWarning(true);
                        // Wrap the rest of the submission in a deferred callback
                        continueSubmitRef.current = () => runSubmission();
                        return;
                    }
                }
            } catch (err) {
                console.error('Failed to check duplicate email:', err);
                // Non-blocking: allow submission to proceed on check failure or timeout
            }
            setIsCheckingEmail(false);
        }

        await runSubmission();
    };

    const runSubmission = async () => {
        // ── Step 1: Submit KYC ─────────────────────────────────────────
        if (!isKycSubmitted) {
            setPhase('kyc');
            const kycResult = await submitKyc();
            if (!kycResult.success) {
                setPhase('idle');
                return;
            }
        }

        // ── Step 2: Submit Receipts (skipped if empty) ─────────────────
        if (!isRecPaySubmitted) {
            setPhase('receipts');
            const receiptsSuccess = await submitReceipts(latestOrderRef.current);
            if (!receiptsSuccess) {
                setPhase('idle');
                return;
            }
        }

        // ── Step 3: Submit Currency Exchange ───────────────────────────
        if (!isCurrencySubmitted) {
            setPhase('currency');
            await submitCurrency(latestOrderRef.current);
        }

        setPhase('idle');
    };

    const handleDuplicateConfirm = () => {
        setShowDuplicateWarning(false);
        setDuplicateOrder(null);
        continueSubmitRef.current?.();
        continueSubmitRef.current = null;
    };

    const handleDuplicateCancel = () => {
        setShowDuplicateWarning(false);
        setDuplicateOrder(null);
        continueSubmitRef.current = null;
    };

    const getLabel = () => {
        if (allDone) return 'Submitted';
        if (isCheckingEmail) return 'Initiating...';
        if (phase === 'kyc') return isInitiatingKyc ? 'Initiating...' : 'Submitting KYC...';
        if (phase === 'receipts') return 'Submitting Receipts...';
        if (phase === 'currency') return 'Adding Currency...';
        return 'Submit';
    };

    return (
        <div className="relative">
            {/* KYC result card (validation errors / success) */}
            {resultMessage && <DraggableResultCard result={resultMessage} onClose={() => setResultMessage(null)} />}

            {/* Duplicate email warning dialog — rendered via portal to escape ancestor overflow/transform */}
            {showDuplicateWarning &&
                createPortal(
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                        <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white shadow-2xl overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-3">
                                <AlertTriangle className="shrink-0 text-amber-500" size={18} />
                                <h3 className="text-sm font-semibold text-amber-800">Duplicate Order Detected</h3>
                            </div>

                            {/* Body */}
                            <div className="px-4 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
                                <p className="text-xs text-gray-600 leading-relaxed">A submitted order already exists for this user. Are you sure you want to proceed?</p>

                                {/* Order Info */}
                                <div className="rounded-lg border border-gray-100 bg-gray-50 divide-y divide-gray-100">
                                    <div className="px-3 py-2 flex items-center justify-between">
                                        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Order #</span>
                                        <span className="text-xs font-semibold text-gray-800">{duplicateOrder?.orderDetails?.orderNumber ?? '—'}</span>
                                    </div>
                                    <div className="px-3 py-2 flex items-center justify-between">
                                        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Status</span>
                                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 capitalize">
                                            {duplicateOrder?.orderDetails?.orderStatus ?? '—'}
                                        </span>
                                    </div>
                                    <div className="px-3 py-2 flex items-center justify-between">
                                        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Created</span>
                                        <span className="text-xs text-gray-700">
                                            {duplicateOrder?.orderDetails?.orderCreatedDate
                                                ? new Date(duplicateOrder.orderDetails.orderCreatedDate).toLocaleString()
                                                : duplicateOrder?.createdAt
                                                  ? new Date(duplicateOrder.createdAt).toLocaleString()
                                                  : '—'}
                                        </span>
                                    </div>
                                </div>

                                {/* User Details */}
                                <div>
                                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">User Details</p>
                                    <div className="rounded-lg border border-gray-100 bg-gray-50 divide-y divide-gray-100">
                                        {[
                                            { label: 'Name', value: duplicateOrder?.userDetails?.name },
                                            { label: 'Email', value: duplicateOrder?.userDetails?.email },
                                            { label: 'Phone', value: duplicateOrder?.userDetails?.phone },
                                            { label: 'PAN', value: duplicateOrder?.userDetails?.panNumber }
                                        ].map(({ label, value }) =>
                                            value ? (
                                                <div key={label} className="px-3 py-2 flex items-center justify-between gap-4">
                                                    <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide shrink-0">{label}</span>
                                                    <span className="text-xs text-gray-800 text-right truncate">{value}</span>
                                                </div>
                                            ) : null
                                        )}
                                    </div>
                                </div>

                                {/* Currency Details */}
                                {Array.isArray(duplicateOrder?.currencyDetails) && duplicateOrder.currencyDetails.length > 0 && (
                                    <div>
                                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Currency Details</p>
                                        <div className="rounded-lg border border-gray-100 overflow-hidden">
                                            <table className="w-full text-[11px]">
                                                <thead className="bg-gray-100">
                                                    <tr>
                                                        <th className="text-left px-3 py-1.5 font-semibold text-gray-500">Currency</th>
                                                        <th className="text-left px-3 py-1.5 font-semibold text-gray-500">Product</th>
                                                        <th className="text-right px-3 py-1.5 font-semibold text-gray-500">Qty</th>
                                                        <th className="text-right px-3 py-1.5 font-semibold text-gray-500">Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 bg-white">
                                                    {duplicateOrder.currencyDetails.map((c: any, i: number) => (
                                                        <tr key={i}>
                                                            <td className="px-3 py-1.5 font-medium text-gray-800">{c.currency}</td>
                                                            <td className="px-3 py-1.5 text-gray-600">{c.product}</td>
                                                            <td className="px-3 py-1.5 text-right text-gray-700">{c.quantity}</td>
                                                            <td className="px-3 py-1.5 text-right font-semibold text-gray-800">{c.amount?.toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
                                <button
                                    id="duplicate-warning-cancel-btn"
                                    onClick={handleDuplicateCancel}
                                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    id="duplicate-warning-confirm-btn"
                                    onClick={handleDuplicateConfirm}
                                    className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 transition-colors"
                                >
                                    Yes, Proceed
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

            <button
                tabIndex={1}
                id="submit-order-btn"
                onClick={handleSubmit}
                disabled={isSubmitting || allDone}
                className={`flex items-center justify-center gap-2 rounded-md border border-gray-400 bg-white px-3 py-1 text-base font-light text-gray-500 transition-all duration-200 ease-in-out hover:border-blue-500 hover:bg-blue-400 hover:text-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 ${allDone ? 'opacity-10 cursor-not-allowed' : ''}`}
            >
                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                {getLabel()}
            </button>
        </div>
    );
};

export default SubmitOrder;
