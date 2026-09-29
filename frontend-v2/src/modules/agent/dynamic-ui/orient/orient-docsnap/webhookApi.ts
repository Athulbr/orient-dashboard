import { config } from '../../../../../config/default';
import clientLoggerNew from '../../../../../global-utils/clientLoggerNew';
import axios from 'axios';

export interface RetryInterval {
    intervalInSeconds: number;
    maxRetryCount: number;
}

interface TriggerWebhookArgs {
    webhookPath: string;
    body: FormData | string;
    headers?: HeadersInit;
    retryIntervals?: RetryInterval[];
    orderNumber?: number;
}

const defaultRetryIntervals: RetryInterval[] = [
    { intervalInSeconds: 2, maxRetryCount: 10 },
    { intervalInSeconds: 5, maxRetryCount: 10 },
    { intervalInSeconds: 20, maxRetryCount: 2 },
    { intervalInSeconds: 30, maxRetryCount: 1 }
];

export const triggerWebhook = async ({ webhookPath, body, headers, retryIntervals = defaultRetryIntervals, orderNumber }: TriggerWebhookArgs): Promise<string> => {
    let totalAttempts = 0;
    const startTime = Date.now();

    const branchCode = sessionStorage.getItem('branch_code') || '';

    for (const retryConfig of retryIntervals) {
        for (let i = 0; i < retryConfig.maxRetryCount; i++) {
            totalAttempts++;
            const controller = new AbortController();

            const timeoutId = setTimeout(() => {
                controller.abort();
            }, retryConfig.intervalInSeconds * 1000);

            try {
                const response = await axios.post(`${config.workflowService}/workflow/webhooks/trigger/${webhookPath}`, body, {
                    headers: headers as any,
                    signal: controller.signal
                });

                const responseData = response.data;
                const executionId = responseData?.data?.executionId;

                if (!executionId) {
                    throw new Error('No executionId found in response');
                }

                if (totalAttempts > 1) {
                    const totalTimeElapsedMs = Date.now() - startTime;
                    const summary = {
                        webhookPath,
                        totalAttempts,
                        totalTimeElapsedMs,
                        totalTimeElapsedSeconds: (totalTimeElapsedMs / 1000).toFixed(2),
                        retryIntervalsConfig: retryIntervals.map(r => `${r.maxRetryCount} attempts @ ${r.intervalInSeconds}s`).join(', ')
                    };
                    clientLoggerNew({
                        error: `[ ${webhookPath} ] [ ${branchCode} ] [ ${orderNumber} ] Webhook trigger succeeded after retries`,
                        data: {
                            summary,
                            body
                        }
                    });
                }

                return executionId;
            } catch (error: any) {
                // If it's a 4xx error, there's no point in retrying. Throw immediately.
                if (!axios.isCancel(error)) {
                    throw error;
                }
                // Otherwise, it's a network error or 5xx error, continue to the next retry attempt
            } finally {
                clearTimeout(timeoutId);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    const totalTimeElapsedMs = Date.now() - startTime;
    const summary = {
        webhookPath,
        totalAttempts,
        totalTimeElapsedMs,
        totalTimeElapsedSeconds: (totalTimeElapsedMs / 1000).toFixed(2),
        retryIntervalsConfig: retryIntervals.map(r => `${r.maxRetryCount} attempts @ ${r.intervalInSeconds}s`).join(', ')
    };

    clientLoggerNew({
        error: `[ ${webhookPath} ] [ ${branchCode} ] [ ${orderNumber} ] Webhook trigger failed, still pending after retrying multiple times`,
        data: {
            summary,
            body
        }
    });
    throw new Error('All retry attempts failed to trigger webhook');
};
