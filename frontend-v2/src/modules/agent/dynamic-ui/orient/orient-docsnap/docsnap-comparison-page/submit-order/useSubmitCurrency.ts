import { config } from '../../../../../../../config/default';
import { Order } from '../../types';
import { getMaraekatPayload } from './getMaraekatPayload';
import { useToastStore } from '../../../../../../../components/toast/ToastStore';

export interface UseSubmitCurrencyOptions {
    extractedData: any;
    onOrderUpdate?: (updatedOrder: Order) => void;
}

export const useSubmitCurrency = ({ extractedData, onOrderUpdate }: UseSubmitCurrencyOptions) => {
    const toast = useToastStore();

    /**
     * Submit all currency exchange requests to Maraekat.
     * Returns true if all exchanges succeeded.
     */
    const submitCurrency = async (order: Order): Promise<boolean> => {
        const items = order.currencyDetails;
        if (!items || items.length === 0) return true;

        const eonBookingNumber = order.maraekatDetails?.eonBookingNumber;
        const bookingNo = order.maraekatDetails?.bookingNumber;
        if (!eonBookingNumber || !bookingNo) {
            toast.error('Failed to submit currency details: Booking numbers missing');
            return false;
        }

        // Step 1: Login
        let authToken: string | null = null;
        try {
            const loginRes = await fetch(`${config.workflowService}/workflow/orient/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!loginRes.ok) {
                toast.error(`Failed to submit currency details: Login failed (${loginRes.status})`);
                return false;
            }
            const loginData = await loginRes.json();
            authToken = loginData?.Result;
            if (!authToken) {
                toast.error('Failed to submit currency details: No auth token received');
                return false;
            }
        } catch (err: any) {
            toast.error(`Failed to submit currency details: ${err.message || 'Login request failed'}`);
            return false;
        }

        // Step 2: Fire all exchange requests in parallel
        const { payload } = getMaraekatPayload(order, extractedData);

        const results = await Promise.allSettled(
            items.map(async (item: any) => {
                const exchangeType = item.product === 'cash' ? 'CN' : payload.BOOKINGTYPE === 'PURCHASE' ? 'EM' : payload.BOOKINGTYPE === 'SALE' ? 'CM' : item.product;

                const exchangeRes = await fetch(`${config.workflowService}/workflow/orient/exchange`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${authToken}`
                    },
                    body: JSON.stringify({
                        BRANCHCODE: payload.BRANCHCODE || '',
                        BOOKINGTYPE: payload.BOOKINGTYPE || '',
                        BOOKINGNO: bookingNo || '',
                        EONBOOKINGNO: eonBookingNumber,
                        CURRENCY: item.currency || '',
                        EXCHTYPE: exchangeType || '',
                        FCNAMOUNT: item.quantity || '',
                        BOOKINGRATE: item.rate || ''
                    })
                });

                if (!exchangeRes.ok) {
                    throw new Error(`${item.currency}: API failed (${exchangeRes.status})`);
                }

                const exchangeData = await exchangeRes.json();
                const resultItem = exchangeData?.Result?.[0];

                if (resultItem?.APISTATUS === 'FAILED') {
                    throw new Error(`${item.currency}: ${resultItem.ERRORDESC || 'Unknown error'} (Code: ${resultItem.ERRORCODE || 'N/A'})`);
                } else if (resultItem?.BOOKINGNO) {
                    return `${item.currency}: Booking No ${resultItem.BOOKINGNO}`;
                } else {
                    throw new Error(`${item.currency}: ${exchangeData?.Error || 'No booking number returned'}`);
                }
            })
        );

        // Step 3: Aggregate results
        const successes: string[] = [];
        const failures: string[] = [];
        results.forEach(r => {
            if (r.status === 'fulfilled') {
                successes.push(r.value);
            } else {
                failures.push((r as PromiseRejectedResult).reason?.message || 'Unknown error');
            }
        });

        if (failures.length === 0) {
            toast.success(`All ${successes.length} exchange(s) completed successfully!`);

            try {
                const updatePayload = {
                    maraekatDetails: { ...order.maraekatDetails, currencySubmitted: true }
                };
                const res = await fetch(`${config.workflowService}/workflow/orders/${order.orderDetails.orderNumber}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatePayload)
                });

                if (res.ok && onOrderUpdate) {
                    onOrderUpdate({
                        ...order,
                        maraekatDetails: { ...order.maraekatDetails, currencySubmitted: true }
                    });
                }
            } catch (err) {
                console.error('Failed to update order with currency submitted status:', err);
            }
            return true;
        } else {
            toast.error(`Failed to submit currency details: ${failures.join(' | ')}`);
            return false;
        }
    };

    return { submitCurrency };
};
