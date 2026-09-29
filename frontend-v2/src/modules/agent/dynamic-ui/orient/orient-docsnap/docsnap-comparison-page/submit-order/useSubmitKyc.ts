import { useState } from 'react';
import { config } from '../../../../../../../config/default';
import { triggerWebhook } from '../../webhookApi';
import { Order } from '../../types';
import { getMaraekatPayload } from './getMaraekatPayload';
import { ResultMessage } from './DraggableResultCard';
import clientLoggerNew from '../../../../../../../global-utils/clientLoggerNew';
import { useToastStore } from '../../../../../../../components/toast/ToastStore';

export interface UseSubmitKycOptions {
    order: Order;
    extractedData: any;
    onOrderUpdate?: (updatedOrder: Order) => void;
    onBeforeSubmit?: () => Promise<void>;
}

export interface KycSubmitResult {
    success: boolean;
    eonBookingNumber?: string;
    bookingNumber?: string;
}

const checkIsExtractedDataUpdated = (extractedData: any): boolean => {
    try {
        const isFieldObject = (obj: any): boolean => {
            try {
                return obj !== null && typeof obj === 'object' && !Array.isArray(obj) && 'value' in obj && 'initialValue' in obj;
            } catch {
                return false;
            }
        };

        const isFieldUpdated = (fieldValue: any): boolean => {
            try {
                const initial = fieldValue?.initialValue;
                const current = fieldValue?.value;

                if (!initial || typeof initial !== 'string') return false;

                return (
                    String(current ?? '')
                        .trim()
                        .toUpperCase() !== initial.trim().toUpperCase()
                );
            } catch {
                return false;
            }
        };

        const traverse = (node: any): boolean => {
            try {
                if (node === null || node === undefined || typeof node !== 'object') return false;
                if (Array.isArray(node)) return node.some(item => traverse(item));
                if (isFieldObject(node)) return isFieldUpdated(node);
                return Object.values(node).some(val => traverse(val));
            } catch {
                return false;
            }
        };

        return traverse(extractedData);
    } catch {
        return false;
    }
};

export const useSubmitKyc = ({ order, extractedData, onOrderUpdate, onBeforeSubmit }: UseSubmitKycOptions) => {
    const [resultMessage, setResultMessage] = useState<ResultMessage | null>(null);
    const [isInitiatingKyc, setIsInitiatingKyc] = useState(false);
    const toast = useToastStore();

    const submitKyc = async (): Promise<KycSubmitResult> => {
        setResultMessage(null);
        setIsInitiatingKyc(true);

        // Step 1: Silently save the latest extracted data before submitting
        if (onBeforeSubmit) {
            try {
                await Promise.race([onBeforeSubmit(), new Promise<void>(resolve => setTimeout(resolve, 3000))]);
            } catch (err) {
                console.error('Silent save before submit failed:', err);
                // Do not block submission on save failure
            }
        }

        // Step 2: Validate passenger name against passport
        if (
            order.orderDetails?.orderType === 'sell' &&
            !(extractedData?.travel_itinerary?.passenger_name?.value || '').toUpperCase().includes(extractedData?.passport?.first_name?.value.toUpperCase())
        ) {
            const accepted = confirm(
                `Passenger name does not match passport name.\nPassport name: ${extractedData?.passport?.first_name?.value} ${extractedData?.passport?.last_name?.value}\nTicket name: ${extractedData?.travel_itinerary?.passenger_name?.value}\n\nProceed anyway?`
            );
            if (!accepted) {
                setIsInitiatingKyc(false);
                return { success: false };
            }
        }

        // Step 3: Build and validate payload
        const { payload, dateErrors } = getMaraekatPayload(order, extractedData);

        if (dateErrors.length > 0) {
            setIsInitiatingKyc(false);
            setResultMessage({ type: 'error', messages: dateErrors });
            return { success: false };
        }

        payload.isExtractedDataUpdated = checkIsExtractedDataUpdated(extractedData) ? 'YES' : 'NO';
        payload.recordId = order.extractionDetails?.recordId || '';
        payload.orderId = order._id || '';

        const objectToString = (obj: Record<string, any>): string => {
            return Object.entries(obj)
                .map(([key, value]) => {
                    const sanitizedValue = String(value).replace(/,/g, ' ').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
                    return `${key}:${sanitizedValue}`;
                })
                .join('|');
        };

        const stringPayload = objectToString(payload);

        setIsInitiatingKyc(true);
        let executionId: string;
        try {
            executionId = await triggerWebhook({
                webhookPath: 'maraekat-submit',
                headers: { 'Content-Type': 'application/json' },
                orderNumber: Number(payload.BOOKINGNO) || 0,
                body: JSON.stringify({ payload: stringPayload })
            });
        } catch (error: any) {
            setIsInitiatingKyc(false);
            if (error.message === 'All retry attempts failed to trigger webhook') {
                toast.error('Not able to reach the server, Please refresh the page and try again.', {
                    duration: 1200000,
                    title: 'Connection Error'
                });
            }
            setResultMessage({ type: 'error', messages: [`Failed to submit KYC details: ${error.message}`] });
            return { success: false };
        }

        setIsInitiatingKyc(false);

        // Step 5: Listen to SSE Stream for completion
        try {
            return await new Promise<KycSubmitResult>(resolve => {
                const streamUrl = `${config.workflowService}/workflow/executions/${executionId}/status-stream?apiKey=secret1`;
                const eventSource = new EventSource(streamUrl);

                eventSource.onmessage = event => {
                    try {
                        const jsonString = event.data;
                        if (!jsonString || jsonString.trim() === '' || jsonString === '{}') return;

                        const parsed = JSON.parse(jsonString);
                        if (parsed.status && ['completed', 'failed', 'error', 'cancelled', 'timeout'].includes(parsed.status)) {
                            eventSource.close();

                            if (parsed.status === 'completed') {
                                const result = parsed.finalData?.[0] || {};
                                if (result && result.success === false) {
                                    const errorMessages = Array.isArray(result.messages)
                                        ? result.messages.map((m: any) => (typeof m === 'string' ? m : m.message || JSON.stringify(m)))
                                        : ['Failed to submit KYC details'];
                                    setResultMessage({ type: 'error', messages: errorMessages });
                                    resolve({ success: false });
                                } else {
                                    const eonBookingNo = result.EONBOOKINGNO;
                                    const bookingNo = result.BOOKINGNO;
                                    console.log('EONBOOKINGNO: ', eonBookingNo);

                                    const isExtractedDataUpdated = checkIsExtractedDataUpdated(extractedData);
                                    // Update local state with enriched order
                                    if (eonBookingNo && onOrderUpdate) {
                                        const updatedOrder: Order = {
                                            ...order,
                                            orderDetails: {
                                                ...order.orderDetails,
                                                orderStatus: 'submitted'
                                            },
                                            maraekatDetails: {
                                                ...order.maraekatDetails,
                                                eonBookingNumber: eonBookingNo,
                                                bookingNumber: bookingNo,
                                                isExtractedDataUpdated: isExtractedDataUpdated
                                            }
                                        };
                                        onOrderUpdate(updatedOrder);
                                    }

                                    // Persist to DB (fire-and-forget)
                                    if (eonBookingNo) {
                                        const updatePayload = {
                                            'orderDetails.orderStatus': 'submitted',
                                            maraekatDetails: {
                                                eonBookingNumber: eonBookingNo,
                                                bookingNumber: bookingNo,
                                                isExtractedDataUpdated: isExtractedDataUpdated
                                            }
                                        };
                                        fetch(`${config.workflowService}/workflow/orders/${order.orderDetails.orderNumber}`, {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(updatePayload)
                                        }).catch(err => console.error('Failed to update order with EONBOOKINGNO:', err));
                                    }

                                    const successMessages = Array.isArray(result?.messages)
                                        ? result.messages.map((m: any) => (typeof m === 'string' ? m : m.message || 'Validated Successfully'))
                                        : ['Successfully submitted KYC to Maraekat'];
                                    setResultMessage({ type: 'success', messages: successMessages });
                                    resolve({ success: true, eonBookingNumber: eonBookingNo, bookingNumber: bookingNo });
                                }
                            } else {
                                const errorMsg = parsed.error || `Failed to submit KYC details: ${parsed.status}`;
                                setResultMessage({ type: 'error', messages: [errorMsg] });
                                resolve({ success: false });
                            }
                        }
                    } catch (e) {
                        // Ignore parse errors for partial streams
                    }
                };

                eventSource.onerror = err => {
                    console.error('SSE EventSource error:', err);
                    eventSource.close();
                    setResultMessage({ type: 'error', messages: ['Failed to submit KYC details: Stream connection error'] });
                    resolve({ success: false });
                };
            });
        } catch (error) {
            console.error('SSE stream error:', error);
            setResultMessage({ type: 'error', messages: ['Failed to submit KYC details: An unexpected error occurred'] });
            return { success: false };
        }
    };

    return { resultMessage, setResultMessage, submitKyc, isInitiatingKyc };
};
