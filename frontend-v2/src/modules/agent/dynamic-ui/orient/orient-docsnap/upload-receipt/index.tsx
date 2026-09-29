import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, X, FileText, Image, File, Loader2 } from 'lucide-react';
import { Button } from '../../../../../../components/Button';
import { DialogComponent } from '../../../../../../components/DialogComponent';
import { config } from '../../../../../../config/default';
import { useToastStore } from '../../../../../../components/toast/ToastStore';

const API_KEY = import.meta.env.VITE_WORKFLOW_API_KEY || 'secret1';

interface UploadReceiptProps {
    orderNumber: number;
    onUploadComplete?: (docs: { documentName: string; documentPages: string[] }[]) => void;
}

const UploadReceipt: React.FC<UploadReceiptProps> = ({ orderNumber, onUploadComplete }) => {
    const [showDropZone, setShowDropZone] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragCounter = useRef(0);
    const toast = useToastStore();

    // ── Add files & upload immediately ────────────────────────
    const handleUpload = useCallback(
        async (files: File[]) => {
            if (files.length === 0) return;

            setShowDropZone(false); // Close dialog immediately
            setIsUploading(true);
            setUploadProgress('Uploading...');

            const formData = new FormData();
            formData.append('orderNumber', orderNumber.toString());
            files.forEach(file => formData.append('file', file));

            try {
                const response = await fetch(`${config.workflowService}/workflow/webhooks/trigger/orient-file-upload`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    console.error('Upload API response error:', response.status);
                    toast.error(`Upload failed. Status: ${response.status}`);
                    setIsUploading(false);
                    setUploadProgress('');
                    return;
                }

                const responseData = await response.json();
                const executionId = responseData?.data?.executionId;

                if (!executionId) {
                    console.error('No executionId found in response');
                    toast.error('Upload failed — no execution ID returned');
                    setIsUploading(false);
                    setUploadProgress('');
                    return;
                }

                setUploadProgress('Processing...');

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
                                    const newDocs: { documentName: string; documentPages: string[] }[] = [];

                                    if (finalData.manualDocuments) {
                                        finalData.manualDocuments.forEach((doc: string[]) => {
                                            if (doc && doc.length > 0) {
                                                newDocs.push({
                                                    documentName: doc[0].split('/').pop() || new Date().toISOString(),
                                                    documentPages: doc
                                                });
                                            }
                                        });
                                    }

                                    if (newDocs.length > 0) {
                                        onUploadComplete?.(newDocs);
                                        toast.success(`${newDocs.length} receipt(s) uploaded`);
                                    } else {
                                        toast.success('Receipt uploaded successfully');
                                        onUploadComplete?.([]);
                                    }
                                } else {
                                    toast.error(`Upload ${parsed.status}`);
                                }

                                setIsUploading(false);
                                setUploadProgress('');
                            }
                        }
                    } catch (e) {
                        console.error('Error processing upload SSE message:', e);
                    }
                };

                eventSource.onerror = err => {
                    console.error('SSE EventSource error:', err);
                    eventSource.close();
                    setIsUploading(false);
                    setUploadProgress('');
                    toast.error('Upload stream disconnected');
                };
            } catch (err) {
                console.error('Upload API error:', err);
                setIsUploading(false);
                setUploadProgress('');
                toast.error('Upload failed');
            }
        },
        [orderNumber, toast, onUploadComplete]
    );

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            dragCounter.current = 0;
            if (e.dataTransfer.files.length > 0) {
                handleUpload(Array.from(e.dataTransfer.files));
            }
        },
        [handleUpload]
    );

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleUpload(Array.from(e.target.files));
        }
        e.target.value = '';
    };

    // ── Reset / close ─────────────────────────────────────────
    const handleClose = useCallback(() => {
        setShowDropZone(false);
        setIsDragging(false);
    }, []);

    // ── Render ────────────────────────────────────────────────
    return (
        <>
            <Button
                outlined
                onClick={e => {
                    e.stopPropagation();
                    if (!isUploading) setShowDropZone(true);
                }}
                disabled={isUploading}
                startIcon={isUploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
            >
                {isUploading ? uploadProgress : 'Upload Receipt'}
            </Button>

            <DialogComponent isOpen={showDropZone} closeDialog={handleClose} name="Upload Receipts" className="w-[90vw] max-w-xl">
                <div className="p-6" onClick={e => e.stopPropagation()}>
                    <div
                        className={`
                            relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
                            transition-all duration-200 cursor-pointer p-8 min-h-[300px]
                            ${isDragging ? 'border-blue-400 bg-blue-50 scale-[1.01]' : 'border-gray-300 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50/30'}
                        `}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleFileInputChange} />

                        <UploadCloud size={40} className={`transition-colors duration-200 ${isDragging ? 'text-blue-500' : 'text-emerald-500'}`} />
                        <div className="text-center">
                            <p className="text-base font-semibold text-gray-700">{isDragging ? 'Drop files here' : 'Drag & drop receipts here'}</p>
                            <span className="text-sm text-gray-500">
                                or <span className="text-emerald-600 font-medium underline cursor-pointer hover:text-emerald-700">browse files</span>
                            </span>
                        </div>
                    </div>
                </div>
            </DialogComponent>
        </>
    );
};

export default UploadReceipt;
