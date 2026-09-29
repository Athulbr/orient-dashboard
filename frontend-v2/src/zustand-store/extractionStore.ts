import { create } from 'zustand';

interface PayloadIF {
    template?: any;
    rowData?: any;
    files?: File[];
}

interface ExtractionItem {
    fileName: string;
    status: 'completed' | 'failed' | 'processing';
    time: number;
    abortController?: AbortController;
    step?: string;
    progress?: number;
    payload?: PayloadIF;
}

interface ExtractionStoreIF {
    refreshRecord: number;
    updateRefreshRecord: () => void;

    showFloatingWindow: boolean;
    setShowFloatingWindow: (show: boolean) => void;

    extractionQueue: ExtractionItem[];
    addToExtractionQueue: (fileName: string, payload?: PayloadIF) => void;
    updateExtractionQueue: (fileName: string, changes: Partial<ExtractionItem>) => void;
    clearExtractionQueue: () => void;
    refreshExtractionQueue: (fileName: string) => void;
    filterExtractionQueue: (predicate: (item: ExtractionItem) => boolean) => void;
    handleCompletion: (timer: any, processingFiles: any[], fileName: string) => void;
    handleError: (timer: any, processingFiles: any[], fileName: string) => void;
    startTimer: (fileName: string) => NodeJS.Timeout;
    processStream: (reader: ReadableStreamDefaultReader<Uint8Array>, fileName: string, timer: NodeJS.Timeout) => Promise<void>;
}

export const useExtractionStore = create<ExtractionStoreIF>((set, get) => {
    return {
        refreshRecord: 0,
        extractionQueue: [],
        showFloatingWindow: false,

        updateRefreshRecord: () => set({ refreshRecord: get().refreshRecord + 1 }),

        setShowFloatingWindow: (show: boolean) => set({ showFloatingWindow: show }),

        startTimer: (fileName: string): NodeJS.Timeout => {
            return setInterval(() => {
                const currentItem = get().extractionQueue.find(i => i.fileName === fileName);
                if (currentItem) {
                    get().updateExtractionQueue(fileName, {
                        time: currentItem.time + 1
                    });
                }
            }, 1000);
        },

        addToExtractionQueue: (fileName: string, payload?: PayloadIF) => {
            set({
                extractionQueue: [
                    ...get().extractionQueue,
                    {
                        fileName,
                        status: 'processing',
                        time: 0,
                        payload
                    }
                ]
            });
        },

        refreshExtractionQueue: (fileName: string) => {
            set({
                extractionQueue: get().extractionQueue.filter(i => i.fileName !== fileName)
            });
        },

        clearExtractionQueue: () => set({ extractionQueue: [] }),

        filterExtractionQueue: (predicate) => {
            set({ extractionQueue: get().extractionQueue.filter(predicate) });
        },

        updateExtractionQueue: (fileName: string, changes: Partial<ExtractionItem>) => {
            set({
                extractionQueue: get().extractionQueue.map(item => (item.fileName === fileName ? { ...item, ...changes } : item))
            });
        },

        handleCompletion: (timer: any, processingFiles: any[], fileName: string) => {
            clearInterval(timer);
            if (processingFiles.length < 2) {
                set({ refreshRecord: get().refreshRecord + 1 });
            }
            get().updateExtractionQueue(fileName, { status: 'completed' });
        },

        handleError: (timer: any, processingFiles: any[], fileName: string) => {
            clearInterval(timer);
            if (processingFiles.length < 2) {
                set({ refreshRecord: get().refreshRecord + 1 });
            }
            get().updateExtractionQueue(fileName, { status: 'failed' });
            console.error(`File ${fileName} processing failed`);
        },
        processStream: async (reader: ReadableStreamDefaultReader<Uint8Array>, fileName: string, timer: NodeJS.Timeout) => {
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            try {
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
                            // Handle SSE format: "data: {json}" or just "{json}"
                            let jsonString = line;
                            if (line.startsWith('data: ')) {
                                jsonString = line.substring(6); // Remove "data: " prefix
                            }

                            if (!jsonString.trim()) continue;

                            const parsed = JSON.parse(jsonString);

                            // Get fresh state
                            const processingFiles = get().extractionQueue.filter(queue => queue.status !== 'completed' && queue.status !== 'failed');

                            // Handle different status types
                            switch (parsed.status) {
                                case 'completed':
                                    get().handleCompletion(timer, processingFiles, fileName);
                                    break;

                                case 'failed':
                                case 'error':
                                    get().handleError(timer, processingFiles, fileName);
                                    break;

                                default:
                                    if (parsed.status) {
                                        get().updateExtractionQueue(fileName, {
                                            status: parsed.status,
                                            step: parsed.step,
                                            progress: parsed.progress
                                        });
                                    }
                                    break;
                            }
                        } catch (parseError) {
                            console.warn('Failed to parse SSE message:', parseError, 'Line:', line);
                            continue;
                        }
                    }
                }
            } catch (streamError) {
                console.error('Stream processing error:', streamError);
                const processingFiles = get().extractionQueue.filter(queue => queue.status !== 'completed' && queue.status !== 'failed');
                get().handleError(timer, processingFiles, fileName);
            } finally {
                clearInterval(timer);
            }
        }
    };
});
