import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, RotateCw, X, GripHorizontal, ArrowLeft, AlertTriangle, ArrowLeftRight, Trash2, Plus, Expand, Printer, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import { config } from '../../../../../../config/default';

import styles from './scrollbar.module.css';
import { SearchableSelect } from './SearchableSelect';
import SubmitOrder from './submit-order';

import { Order } from '../types';
import { useToastStore } from '../../../../../../components/toast/ToastStore';
import Spinner from '../../../../../../components/Spinner';
import FullScreenLoader from '../../../../../../components/FullScreenLoader';
import { sampleFinalData } from './sampleFinalData';

const getPreviewUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
        return url;
    }
    let normalizedPath = url.replace(/\\/g, '/');
    const tempIdx = normalizedPath.indexOf('/temp/');
    if (tempIdx !== -1) {
        normalizedPath = normalizedPath.substring(tempIdx + '/temp/'.length);
    }
    const encodedPath = normalizedPath
        .split('/')
        .map(seg => encodeURIComponent(seg))
        .join('/');
    return `${config.workflowService}/workflow/temp-storage/preview/${encodedPath}?apiKey=secret1`;
};

interface BBox {
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
}

type FieldValue = {
    value: string | number;
    bbox: BBox | null;
    page: number | null;
    confidence: number | null;
    index: number | null;
    wordIndexes: number[];
    initialValue?: string;
    options?: (string | number)[];
};

type FieldGroup = Record<string, FieldValue>;
type ExtractedData = Record<string, FieldGroup | any[]>;

interface DocsnapComparisonUIProps {
    recordId: string;
    onClose?: () => void;
    order: Order;
    onOrderUpdate?: (updatedOrder: Order) => void;
    viewReceipt?: boolean;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const DocsnapComparisonUI: React.FC<DocsnapComparisonUIProps> = ({ recordId, onClose, order, onOrderUpdate }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const leftPaneRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [leftWidth, setLeftWidth] = useState(60);
    const [isResizing, setIsResizing] = useState(false);
    const [record, setRecord] = useState<any>({});
    const [extractedData, setExtractedData] = useState<ExtractedData>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingRecord, setIsLoadingRecord] = useState(!!recordId);
    const [currentOrder, setCurrentOrder] = useState<Order>(order);
    const [expandedTableGroup, setExpandedTableGroup] = useState<string | null>(null);
    const [agentTemplate, setAgentTemplate] = useState<any>(null);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const [imageRotations, setImageRotations] = useState<number[]>([]);
    const [imageDimensions, setImageDimensions] = useState<Array<{ w: number; h: number }>>([]);
    const [ignorePassportError, setIgnorePassportError] = useState(false);

    // console.log('record====>>', record);

    // Build a lookup map: fieldKey -> enums[] from the agent template
    const enumsLookup = useMemo(() => {
        const lookup: Record<string, string[]> = {};
        if (!agentTemplate?.sections) return lookup;
        for (const section of agentTemplate.sections) {
            if (!section.fields) continue;
            for (const field of section.fields) {
                if (field.key && Array.isArray(field.enums) && field.enums.length > 0) {
                    lookup[field.key] = field.enums;
                }
            }
        }
        return lookup;
    }, [agentTemplate]);

    const toast = useToastStore();

    const handleOrderUpdate = useCallback(
        (updatedOrder: Order) => {
            setCurrentOrder(updatedOrder);
            onOrderUpdate?.(updatedOrder);

            // Scroll the field container to the bottom so newly-rendered
            // success messages (KYC, Rec Pay, Currency) are visible.
            setTimeout(() => {
                if (rightPaneRef.current) {
                    rightPaneRef.current.scrollTo({
                        top: rightPaneRef.current.scrollHeight,
                        behavior: 'smooth'
                    });
                }
            }, 100);
        },
        [onOrderUpdate]
    );

    useEffect(() => {
        const handlePopState = () => {
            if (onClose) onClose();
        };
        window.history.pushState({ modal: 'docsnap' }, '');
        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [onClose]);

    const handleClose = () => {
        if (window.history.state?.modal === 'docsnap') {
            window.history.back();
        } else {
            if (onClose) onClose();
        }
    };

    const handleSave = async () => {
        if (!recordId) return;
        setIsSaving(true);
        try {
            const res = await fetch(`${config.workflowService}/workflow/agent-records/${recordId}?apiKey=secret1`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ finalOutput: extractedData })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setRecord(data.record);
                    toast.success('Record saved successfully');
                }
            }
        } catch (error) {
            toast.error('Failed to save record');
            console.error('Error saving record:', error);
        } finally {
            setIsSaving(false);
        }
    };

    /** Silently persist the latest extractedData before submitting — no toasts, no spinner */
    const silentSave = async () => {
        if (!recordId) return;
        await fetch(`${config.workflowService}/workflow/agent-records/${recordId}?apiKey=secret1`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ finalOutput: extractedData })
        });
    };

    useEffect(() => {
        let isMounted = true;
        const fetchRecord = async () => {
            try {
                if (!recordId) return;
                setIsLoadingRecord(true);
                const res = await fetch(`${config.workflowService}/workflow/agent-records/${recordId}?apiKey=secret1`);
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted && data.success && data.record) {
                        setRecord(data.record);
                        // setExtractedData(sampleFinalData as unknown as ExtractedData);
                        setExtractedData(data.record.finalOutput as unknown as ExtractedData);

                        if (data.record.templateId) {
                            try {
                                const templateRes = await fetch(`${config.workflowService}/workflow/agent-templates/${data.record.templateId}?apiKey=secret1`);
                                if (templateRes.ok) {
                                    const templateData = await templateRes.json();
                                    if (templateData?.success && templateData?.template) {
                                        setAgentTemplate(templateData.template);
                                    }
                                }
                            } catch (err) {
                                console.error('Error fetching agent template:', err);
                            }
                        }

                        return;
                    }
                }
                throw new Error('Failed to fetch from API');
            } catch (err) {
                console.error('Error fetching record:', err);
            } finally {
                if (isMounted) {
                    setIsLoadingRecord(false);
                }
            }
        };

        fetchRecord();
        return () => {
            isMounted = false;
        };
    }, [recordId]);

    const lineRef = useRef<SVGSVGElement>(null);
    const zoomLabelRef = useRef<HTMLDivElement>(null);
    const activeFieldRef = useRef<string | null>(null);
    const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
    const rightPaneRef = useRef<HTMLDivElement>(null);

    // Draggable edit card state
    const [editCardPos, setEditCardPos] = useState({ x: 0, y: 0 });
    const isEditCardDragging = useRef(false);
    const editCardDragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

    const zoomRef = useRef(0.95);
    const isDraggingRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

    const updateConnectionLine = useCallback(() => {
        if (!lineRef.current || !activeFieldRef.current || !containerRef.current) {
            if (lineRef.current) lineRef.current.style.opacity = '0';
            return;
        }

        const inputId = `input-${activeFieldRef.current}`;
        const bboxId = `bbox-${activeFieldRef.current}`;

        const inputEl = document.getElementById(inputId);
        const bboxEl = document.getElementById(bboxId);

        if (inputEl && bboxEl) {
            const containerRect = containerRef.current.getBoundingClientRect();
            const inputRect = inputEl.getBoundingClientRect();
            const bboxRect = bboxEl.getBoundingClientRect();

            const isFloating = inputEl.closest('[data-floating-card]') !== null;

            let pathD = '';
            let startX, startY, endX, endY;

            if (isFloating) {
                // start from field top (middle)
                startX = inputRect.left + inputRect.width / 2 - containerRect.left;
                startY = inputRect.top - containerRect.top;
                // end at bbox bottom (middle)
                endX = bboxRect.left + bboxRect.width / 2 - containerRect.left;
                endY = bboxRect.bottom - containerRect.top;

                pathD = `M ${startX} ${startY} L ${endX} ${endY}`;
            } else {
                // Start: left edge of the input field
                startX = inputRect.left - containerRect.left;
                startY = inputRect.top + inputRect.height / 2 - containerRect.top;
                // End: right edge of the bbox
                endX = bboxRect.right - containerRect.left;
                endY = bboxRect.top + bboxRect.height / 2 - containerRect.top;

                // Fixed length of each horizontal arm (start stub & end stub)
                const armLen = 60;

                // Build the straight-cross-straight path: short H arm → diagonal cross → short H arm
                pathD = `M ${startX} ${startY} H ${startX - armLen} L ${endX + armLen} ${endY} H ${endX}`;
            }

            const confidenceStr = bboxEl.getAttribute('data-confidence');
            let color = '#3b82f6'; // default blue
            let bgRgba = 'rgba(59, 130, 246, 0.05)';
            if (confidenceStr && confidenceStr !== 'null' && confidenceStr !== 'undefined') {
                const conf = parseFloat(confidenceStr);
                if (conf < 0.9) {
                    color = '#ef4444'; // red-500
                    bgRgba = 'rgba(239, 68, 68, 0.05)';
                } else if (conf < 0.95) {
                    color = '#f97316'; // orange-500
                    bgRgba = 'rgba(249, 115, 22, 0.05)';
                }
            }

            const svg = lineRef.current;
            const path = svg.querySelector('path') as SVGPathElement | null;
            const dotStart = svg.querySelector('.dot-start') as SVGCircleElement | null;
            const dotEnd = svg.querySelector('.dot-end') as SVGCircleElement | null;

            if (path) {
                path.setAttribute('d', pathD);
                path.setAttribute('stroke', color);
            }
            if (dotStart) {
                dotStart.setAttribute('cx', String(startX));
                dotStart.setAttribute('cy', String(startY));
                dotStart.setAttribute('fill', color);
            }
            if (dotEnd) {
                dotEnd.setAttribute('cx', String(endX));
                dotEnd.setAttribute('cy', String(endY));
                dotEnd.setAttribute('fill', color);
            }

            svg.style.opacity = '1';

            bboxEl.style.backgroundColor = bgRgba;
            bboxEl.style.borderColor = color;
            bboxEl.style.zIndex = '10';
        } else {
            lineRef.current.style.opacity = '0';
        }
    }, []);

    const handleBlur = useCallback(
        (e?: React.FocusEvent) => {
            // Don't deactivate if focus moved to the floating edit card
            if (e?.relatedTarget && (e.relatedTarget as HTMLElement).closest?.('[data-edit-card]')) {
                return;
            }
            if (activeFieldRef.current) {
                const oldBbox = document.getElementById(`bbox-${activeFieldRef.current}`);
                if (oldBbox) {
                    oldBbox.style.backgroundColor = '';
                    oldBbox.style.borderColor = '';
                    oldBbox.style.zIndex = '';
                }
                activeFieldRef.current = null;
                setActiveFieldId(null);
                updateConnectionLine();
            }
        },
        [updateConnectionLine]
    );

    const updateTransform = useCallback(() => {
        if (contentRef.current) {
            contentRef.current.style.transform = `scale(${zoomRef.current})`;
            contentRef.current.style.transformOrigin = zoomRef.current > 1.2 ? 'top left' : 'top center';
            // Switch alignment so left side is accessible when zoomed in
            if (zoomRef.current > 1.2) {
                contentRef.current.classList.remove('items-center');
                contentRef.current.classList.add('items-start');
            } else {
                contentRef.current.classList.remove('items-start');
                contentRef.current.classList.add('items-center');
            }
            if (zoomLabelRef.current) {
                zoomLabelRef.current.innerText = Math.round(zoomRef.current * 100) + '%';
            }
            requestAnimationFrame(updateConnectionLine);
        }
    }, [updateConnectionLine]);

    const apiUrls = useMemo<string[]>(() => {
        return (record?.files?.localImagePaths || []).map((path: string) => getPreviewUrl(path));
    }, [record]);

    const [imageUrls, setImageUrls] = useState<string[]>([]);

    useEffect(() => {
        let isMounted = true;
        if (!apiUrls.length) return;

        const loadBlobs = async () => {
            const urls: string[] = new Array(apiUrls.length).fill('');
            for (let i = 0; i < apiUrls.length; i++) {
                try {
                    const res = await fetch(apiUrls[i]);
                    if (res.ok) {
                        const blob = await res.blob();
                        if (isMounted) {
                            urls[i] = URL.createObjectURL(blob);
                            setImageUrls([...urls]);
                        }
                    }
                } catch (e) {
                    console.error('Error fetching docsnap image:', e);
                }
            }
        };

        loadBlobs();

        return () => {
            isMounted = false;
            setImageUrls(urls => {
                urls.forEach(url => {
                    if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
                });
                return [];
            });
        };
    }, [apiUrls]);

    const scrollToBbox = useCallback((id: string) => {
        const bboxEl = document.getElementById(`bbox-${id}`);
        const container = canvasRef.current;
        if (!bboxEl || !container) return;

        const containerRect = container.getBoundingClientRect();
        const bboxRect = bboxEl.getBoundingClientRect();

        // Calculate how far to scroll to center the bbox
        const scrollAmountY = bboxRect.top + bboxRect.height / 2 - (containerRect.top + containerRect.height / 3);
        const scrollAmountX = bboxRect.left + bboxRect.width / 2 - (containerRect.left + containerRect.width / 2);

        container.scrollTo({
            top: container.scrollTop + scrollAmountY,
            left: container.scrollLeft + scrollAmountX,
            behavior: 'smooth'
        });
    }, []);

    // Scroll right pane to bring input into view
    const scrollToInput = useCallback((id: string) => {
        const inputEl = document.getElementById(`input-${id}`);
        if (inputEl && rightPaneRef.current) {
            const containerRect = rightPaneRef.current.getBoundingClientRect();
            const inputRect = inputEl.getBoundingClientRect();
            const scrollAmountY = inputRect.top + inputRect.height / 2 - (containerRect.top + containerRect.height / 2);

            rightPaneRef.current.scrollTo({
                top: rightPaneRef.current.scrollTop + scrollAmountY,
                behavior: 'smooth'
            });
        }
    }, []);

    const handleFocus = useCallback(
        (id: string) => {
            activeFieldRef.current = id;
            setActiveFieldId(id);
            scrollToBbox(id);
            updateConnectionLine();

            // Keep line connected during smooth scroll (1500ms covers long cross-page scrolls)
            const start = performance.now();
            const tick = () => {
                updateConnectionLine();
                if (performance.now() - start < 1500) {
                    requestAnimationFrame(tick);
                }
            };
            requestAnimationFrame(tick);
        },
        [scrollToBbox, updateConnectionLine]
    );

    // Handle bbox click: activate field, focus input, show connection line
    const handleBboxClick = useCallback(
        (id: string, e: React.MouseEvent) => {
            e.stopPropagation();
            // Focus the corresponding input field
            const inputEl = document.getElementById(`input-${id}`);
            if (inputEl) {
                (inputEl as HTMLInputElement).focus();
            }
            // Scroll right pane to the input
            scrollToInput(id);
        },
        [scrollToInput]
    );

    // Draggable edit card handlers
    const startEditCardDrag = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            isEditCardDragging.current = true;
            editCardDragStart.current = {
                x: e.clientX,
                y: e.clientY,
                posX: editCardPos.x,
                posY: editCardPos.y
            };

            const handleMove = (me: MouseEvent) => {
                if (!isEditCardDragging.current) return;
                const dx = me.clientX - editCardDragStart.current.x;
                const dy = me.clientY - editCardDragStart.current.y;
                setEditCardPos({
                    x: editCardDragStart.current.posX + dx,
                    y: editCardDragStart.current.posY + dy
                });
            };

            const handleUp = () => {
                isEditCardDragging.current = false;
                window.removeEventListener('mousemove', handleMove);
                window.removeEventListener('mouseup', handleUp);
            };

            window.addEventListener('mousemove', handleMove);
            window.addEventListener('mouseup', handleUp);
        },
        [editCardPos]
    );

    const closeEditCard = useCallback(() => {
        handleBlur();
        const activeInput = document.getElementById(`input-${activeFieldRef.current}`);
        if (activeInput) (activeInput as HTMLInputElement).blur();
    }, [handleBlur]);

    // Reset edit card position when active field changes
    useEffect(() => {
        setEditCardPos({ x: 0, y: 0 });
    }, [activeFieldId]);

    // Get the field info (groupKey, fieldKey, value) for the active field
    const activeFieldInfo = useMemo(() => {
        if (!activeFieldId) return null;
        const firstDashIdx = activeFieldId.indexOf('-');
        if (firstDashIdx === -1) return null;
        const groupKey = activeFieldId.substring(0, firstDashIdx);
        const rest = activeFieldId.substring(firstDashIdx + 1);

        const group = extractedData[groupKey];
        if (!group) return null;

        if (Array.isArray(group)) {
            const secondDashIdx = rest.indexOf('-');
            if (secondDashIdx === -1) return null;
            const rowIndex = parseInt(rest.substring(0, secondDashIdx), 10);
            const fieldKey = rest.substring(secondDashIdx + 1);

            const row = group[rowIndex];
            if (!row) return null;
            const field = row[fieldKey];
            if (!field) return null;
            return { groupKey, rowIndex, fieldKey, field };
        } else {
            const fieldKey = rest;
            const field = group[fieldKey];
            if (!field) return null;
            return { groupKey, fieldKey, field };
        }
    }, [activeFieldId, extractedData]);

    const handleZoomIn = () => {
        zoomRef.current = Math.min(zoomRef.current + 0.25, 3);
        updateTransform();
    };
    const handleZoomOut = () => {
        zoomRef.current = Math.max(zoomRef.current - 0.25, 0.25);
        updateTransform();
    };
    const handleResetZoom = () => {
        zoomRef.current = 0.95;
        updateTransform();
        if (canvasRef.current) {
            canvasRef.current.scrollTo({ top: 0, left: 0 });
        }
    };

    const generatePDF = async () => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = doc.internal.pageSize.getWidth();
        const pdfHeight = doc.internal.pageSize.getHeight();

        let i = 0;
        for (const url of imageUrls) {
            if (!url) continue;

            const img = new Image();
            img.crossOrigin = 'Anonymous';

            try {
                const response = await fetch(url, { mode: 'cors' });
                const blob = await response.blob();
                img.src = URL.createObjectURL(blob);
            } catch (e) {
                img.src = url;
            }

            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            if (i > 0) {
                doc.addPage();
            }

            const imgRatio = img.width / img.height;

            let finalWidth = pdfWidth;
            let finalHeight = pdfWidth / imgRatio;

            if (finalHeight > pdfHeight) {
                finalHeight = pdfHeight;
                finalWidth = pdfHeight * imgRatio;
            }

            const x = (pdfWidth - finalWidth) / 2;
            const y = (pdfHeight - finalHeight) / 2;

            doc.addImage(img, 'JPEG', x, y, finalWidth, finalHeight);
            i++;
        }

        return doc;
    };

    const handleDownloadPDF = async () => {
        setIsDownloadingPdf(true);
        try {
            const pdf = await generatePDF();
            pdf.save(`${record?.name || 'document'}.pdf`);
            toast.success('PDF downloaded successfully!');
        } catch (error) {
            console.error('Error generating PDF:', error);
            toast.error('Failed to generate PDF.');
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    const handlePrint = async () => {
        // Open the window synchronously (before any await) so Chrome
        // considers it a direct user-gesture and won't block the popup.
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast.error('Popup blocked. Please allow popups for this site and try again.');
            return;
        }
        // Show a loading message while we generate the PDF
        printWindow.document.write(
            '<html><head><title>Preparing print…</title></head><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui"><p>Generating PDF…</p></body></html>'
        );

        toast.info('Preparing print...');
        try {
            const pdf = await generatePDF();
            // autoPrint embeds a JavaScript print action inside the PDF so
            // Chrome's PDF viewer triggers the print dialog automatically
            pdf.autoPrint();
            const blob = pdf.output('blob');
            const blobUrl = URL.createObjectURL(blob);

            // Navigate the already-open window to the PDF blob URL
            printWindow.location.href = blobUrl;

            toast.success('Print dialog will open in the new window!');
        } catch (error) {
            console.error('Error printing PDF:', error);
            printWindow.close();
            toast.error('Failed to prepare print.');
        }
    };

    const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        isDraggingRef.current = true;
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            scrollLeft: canvasRef.current?.scrollLeft || 0,
            scrollTop: canvasRef.current?.scrollTop || 0
        };
    };

    const handleDrag = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDraggingRef.current || !canvasRef.current) return;
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        canvasRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
        canvasRef.current.scrollTop = dragStartRef.current.scrollTop - dy;
    };

    const stopDrag = () => {
        isDraggingRef.current = false;
    };

    const startResizing = useCallback(() => setIsResizing(true), []);
    const stopResizing = useCallback(() => setIsResizing(false), []);

    const resize = useCallback(
        (mouseMoveEvent: MouseEvent) => {
            if (isResizing && containerRef.current) {
                const containerRect = containerRef.current.getBoundingClientRect();
                const newWidth = ((mouseMoveEvent.clientX - containerRect.left) / containerRect.width) * 100;
                if (newWidth > 10 && newWidth < 90) setLeftWidth(newWidth);
            }
        },
        [isResizing]
    );

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        } else {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing, resize, stopResizing]);

    useEffect(() => {
        updateTransform();
    }, [leftWidth, updateTransform]);

    // Pinch-to-zoom via ctrl/meta + wheel
    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY * -0.01;
                zoomRef.current = Math.min(Math.max(zoomRef.current + delta, 0.25), 3);
                updateTransform();
            }
            // Regular scroll is handled natively by overflow-auto
        };

        const canvas = canvasRef.current;
        if (canvas) {
            canvas.addEventListener('wheel', handleWheel, { passive: false });
        }
        return () => {
            if (canvas) {
                canvas.removeEventListener('wheel', handleWheel);
            }
        };
    }, [updateTransform, isLoadingRecord]);

    // Update connection line on scroll
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const handleScroll = () => requestAnimationFrame(updateConnectionLine);
        canvas.addEventListener('scroll', handleScroll);
        return () => canvas.removeEventListener('scroll', handleScroll);
    }, [updateConnectionLine, isLoadingRecord]);

    // Re-draw connection line when images are rotated.
    // The bbox elements animate for 300ms, so we update at the start,
    // midway through, and after the transition finishes.
    useEffect(() => {
        requestAnimationFrame(updateConnectionLine);
        const mid = setTimeout(() => requestAnimationFrame(updateConnectionLine), 150);
        const end = setTimeout(() => requestAnimationFrame(updateConnectionLine), 350);
        return () => {
            clearTimeout(mid);
            clearTimeout(end);
        };
    }, [imageRotations, updateConnectionLine]);

    const allBboxes = useMemo(() => {
        const bboxes: { id: string; bbox: Pick<BBox, 'x_min' | 'y_min' | 'x_max' | 'y_max'>; page: number; confidence?: number }[] = [];
        Object.entries(extractedData).forEach(([groupKey, groupValue]) => {
            if (Array.isArray(groupValue)) {
                groupValue.forEach((row, rowIndex) => {
                    Object.entries(row).forEach(([fieldKey, fieldValue]: [string, any]) => {
                        if (fieldValue?.bbox && fieldValue?.page !== null && fieldValue?.page !== undefined) {
                            bboxes.push({
                                id: `${groupKey}-${rowIndex}-${fieldKey}`,
                                bbox: fieldValue.bbox,
                                page: fieldValue.page,
                                confidence: fieldValue?.confidence
                            });
                        }
                    });
                });
            } else {
                Object.entries(groupValue).forEach(([fieldKey, fieldValue]: [string, any]) => {
                    if (fieldValue?.bbox && fieldValue?.page !== null && fieldValue?.page !== undefined) {
                        bboxes.push({
                            id: `${groupKey}-${fieldKey}`,
                            bbox: fieldValue.bbox,
                            page: fieldValue.page,
                            confidence: fieldValue?.confidence
                        });
                    }
                });
            }
        });
        return bboxes;
    }, [extractedData]);

    // Transform bbox coordinates based on image rotation (clockwise).
    // Original coords are normalised [0,1]. After rotating the image the
    // overlay container also changes aspect-ratio, so we remap the coords
    // to keep bounding boxes aligned with the visual content.
    const transformBbox = useCallback((bbox: Pick<BBox, 'x_min' | 'y_min' | 'x_max' | 'y_max'>, rotation: number) => {
        const r = ((rotation % 360) + 360) % 360;
        switch (r) {
            case 90:
                // (x, y) → (1 - y, x)
                return {
                    x_min: 1 - bbox.y_max,
                    y_min: bbox.x_min,
                    x_max: 1 - bbox.y_min,
                    y_max: bbox.x_max
                };
            case 180:
                // (x, y) → (1 - x, 1 - y)
                return {
                    x_min: 1 - bbox.x_max,
                    y_min: 1 - bbox.y_max,
                    x_max: 1 - bbox.x_min,
                    y_max: 1 - bbox.y_min
                };
            case 270:
                // (x, y) → (y, 1 - x)
                return {
                    x_min: bbox.y_min,
                    y_min: 1 - bbox.x_max,
                    x_max: bbox.y_max,
                    y_max: 1 - bbox.x_min
                };
            default:
                return bbox;
        }
    }, []);

    const handleAddRow = useCallback(
        (groupKey: string) => {
            const newData = { ...extractedData };
            const newGroup = [...(newData[groupKey] as any[])];
            if (newGroup.length === 0) return;
            const allKeys = Array.from(new Set(newGroup.flatMap(row => Object.keys(row))));
            const emptyRow: any = {};
            allKeys.forEach(k => {
                const lastRowValue = newGroup[newGroup.length - 1]?.[k];
                emptyRow[k] = {
                    value: '',
                    page: lastRowValue?.page || null,
                    confidence: 1,
                    bbox: null
                };
            });
            newGroup.push(emptyRow);
            newData[groupKey] = newGroup;
            setExtractedData(newData);
        },
        [extractedData, setExtractedData]
    );

    const renderArrayTable = (groupKey: string, groupValue: any[]) => {
        if (groupValue.length === 0) return null;
        const allKeys = Array.from(new Set(groupValue.flatMap(row => Object.keys(row))));

        return (
            <div className="p-0 overflow-x-auto">
                <table className="w-full min-w-min text-left text-sm text-zinc-600">
                    <thead className="border-b border-zinc-200 bg-zinc-50/50 text-xs uppercase text-zinc-500">
                        <tr>
                            {allKeys.map(key => (
                                <th key={key} className="whitespace-nowrap px-4 py-3 font-semibold tracking-wider">
                                    {key.replace(/_/g, ' ')}
                                </th>
                            ))}
                            <th className="w-12 px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                        {groupValue.map((row, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-zinc-50/50">
                                {allKeys.map(key => {
                                    const fieldValue = row[key];
                                    const fieldId = `${groupKey}-${rowIndex}-${key}`;
                                    const isValueDiff =
                                        typeof fieldValue?.initialValue === 'string' &&
                                        String(fieldValue?.value ?? '')
                                            .trim()
                                            .toUpperCase() !== fieldValue?.initialValue.trim().toUpperCase();
                                    return (
                                        <td key={key} className="p-4 align-top">
                                            <input
                                                type="text"
                                                id={`input-${fieldId}`}
                                                onFocus={() => handleFocus(fieldId)}
                                                onBlur={handleBlur}
                                                value={fieldValue?.value !== undefined ? String(fieldValue.value) : ''}
                                                onChange={e => {
                                                    const newData = { ...extractedData };
                                                    const newGroup = [...(newData[groupKey] as any[])];
                                                    newGroup[rowIndex] = {
                                                        ...newGroup[rowIndex],
                                                        [key]: { ...(fieldValue || {}), value: e.target.value }
                                                    };
                                                    newData[groupKey] = newGroup;
                                                    setExtractedData(newData);
                                                }}
                                                className={`w-full min-w-[120px] rounded-md px-2 py-1.5 text-sm text-zinc-800 transition-all placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-100 ${
                                                    fieldValue?.confidence != null
                                                        ? fieldValue.confidence < 0.9
                                                            ? 'border-2 border-red-500'
                                                            : fieldValue.confidence < 0.95
                                                              ? 'border-2 border-orange-300'
                                                              : 'border border-zinc-300 focus:border-blue-400'
                                                        : 'border border-zinc-300 focus:border-blue-400'
                                                } ${isValueDiff ? 'bg-yellow-100 focus:bg-yellow-50' : 'bg-white focus:bg-white'}`}
                                            />
                                            {isValueDiff && <div className="ml-2 text-xs text-orange-500">{fieldValue?.initialValue || <span>" "</span>}</div>}
                                        </td>
                                    );
                                })}
                                <td className="p-4 align-top w-12 text-center">
                                    <button
                                        disabled={groupValue.length === 1}
                                        onClick={() => {
                                            const newData = { ...extractedData };
                                            const newGroup = [...(newData[groupKey] as any[])];
                                            newGroup.splice(rowIndex, 1);
                                            newData[groupKey] = newGroup;
                                            setExtractedData(newData);
                                        }}
                                        className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                        title="Delete Row"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    if (isLoadingRecord) {
        return <FullScreenLoader text="Loading Document..." />;
    }

    return (
        <div ref={containerRef} className={`relative flex h-full w-full overflow-hidden bg-white text-zinc-800 ${styles.comparisonContainer}`}>
            {/* Left Pane */}
            <div ref={leftPaneRef} className="flex h-full flex-shrink-0 flex-col border-r border-zinc-200 bg-zinc-100" style={{ width: `${leftWidth}%` }}>
                {/* Toolbar */}
                <div className="z-10 flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 shadow-sm">
                    <div className="flex items-center gap-2">
                        <button onClick={handleClose} className="rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900" title="Back">
                            <ArrowLeft size={18} />
                        </button>
                        <span className="max-w-[200px] truncate text-sm font-medium text-zinc-600">{(record?.name || '').split('_').join(' ').toUpperCase()}</span>
                    </div>
                    <div className="flex items-center space-x-1 rounded-md border border-zinc-200 bg-zinc-100 p-1">
                        <button onClick={handleZoomOut} className="rounded p-1.5 text-zinc-600 transition-all hover:bg-white hover:shadow-sm" title="Zoom Out">
                            <ZoomOut size={16} />
                        </button>
                        <div className="w-16 border-r border-l border-zinc-200 px-2 text-center text-xs font-medium text-zinc-600" ref={zoomLabelRef}>
                            {Math.round(zoomRef.current * 100)}%
                        </div>
                        <button onClick={handleZoomIn} className="rounded p-1.5 text-zinc-600 transition-all hover:bg-white hover:shadow-sm" title="Zoom In">
                            <ZoomIn size={16} />
                        </button>
                        <div className="mx-1 h-4 w-px bg-zinc-300" />
                        <button onClick={handleResetZoom} className="rounded p-1.5 text-zinc-600 transition-all hover:bg-white hover:shadow-sm" title="Reset Zoom">
                            <RotateCcw size={16} />
                        </button>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={handlePrint}
                            className="rounded-md border border-zinc-200 bg-white p-2 text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900"
                            title="Print Document"
                        >
                            <Printer size={14} className="text-gray-500" />
                        </button>
                        <button
                            onClick={handleDownloadPDF}
                            disabled={isDownloadingPdf}
                            className="rounded-md border border-zinc-200 bg-white p-2 text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Download PDF"
                        >
                            {isDownloadingPdf ? <Spinner size={15} className="animate-spin text-gray-500" /> : <Download size={15} className="text-gray-500" />}
                        </button>
                    </div>
                </div>

                {/* Canvas Area */}
                <div
                    ref={canvasRef}
                    className="relative flex-1 cursor-grab overflow-auto bg-zinc-200/50 [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
                    onMouseDown={startDrag}
                    onMouseMove={handleDrag}
                    onMouseUp={stopDrag}
                    onMouseLeave={stopDrag}
                >
                    <div
                        ref={contentRef}
                        className="flex min-h-full flex-col items-center gap-6 pt-6"
                        style={{
                            transform: `scale(${zoomRef.current})`,
                            transformOrigin: 'top center'
                        }}
                    >
                        {imageUrls.map((url, index) => {
                            const rotation = imageRotations[index] || 0;
                            const isRotated = rotation === 90 || rotation === 270;
                            const dims = imageDimensions[index];
                            // When rotated 90/270 the image's natural width becomes the visual height.
                            // Scale it so the visual width still fits the container (scale = W/H).
                            const scale = dims && isRotated ? dims.w / dims.h : 1;
                            return (
                                <div key={index} className="relative w-full bg-white px-8 shadow-lg ring-1 ring-black/5">
                                    {/* Rotate button — top-right corner */}
                                    <button
                                        onClick={() => {
                                            setImageRotations(prev => {
                                                const next = [...prev];
                                                next[index] = ((next[index] || 0) + 90) % 360;
                                                return next;
                                            });
                                        }}
                                        className="absolute top-3 right-3 z-20 flex items-center justify-center rounded-full bg-white/80 p-2 text-zinc-600 shadow-md ring-1 ring-black/10 backdrop-blur-sm transition-all hover:bg-white hover:text-blue-600 hover:shadow-lg hover:ring-blue-300"
                                        title="Rotate Image"
                                    >
                                        <RotateCw size={16} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setImageRotations(prev => {
                                                const next = [...prev];
                                                next[index] = ((next[index] || 0) + 90) % 360;
                                                return next;
                                            });
                                        }}
                                        className="absolute bottom-3 right-3 z-20 flex items-center justify-center rounded-full bg-white/80 p-2 text-zinc-600 shadow-md ring-1 ring-black/10 backdrop-blur-sm transition-all hover:bg-white hover:text-blue-600 hover:shadow-lg hover:ring-blue-300"
                                        title="Rotate Image"
                                    >
                                        <RotateCw size={16} />
                                    </button>
                                    {url ? (
                                        // Wrapper holds the correct aspect-ratio for the rotated orientation
                                        // so the outer card expands/contracts to exactly fit the image.
                                        <div
                                            style={{
                                                position: 'relative',
                                                width: '100%',
                                                aspectRatio: dims ? (isRotated ? `${dims.h} / ${dims.w}` : `${dims.w} / ${dims.h}`) : 'auto',
                                                overflow: 'hidden'
                                            }}
                                        >
                                            <img
                                                src={url}
                                                alt={`Document Page ${index + 1}`}
                                                className="pointer-events-none select-none"
                                                style={{
                                                    position: dims ? 'absolute' : ('block' as any),
                                                    top: '50%',
                                                    left: '50%',
                                                    width: '100%',
                                                    height: 'auto',
                                                    transformOrigin: 'center center',
                                                    transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
                                                    transition: 'transform 0.3s ease'
                                                }}
                                                draggable={false}
                                                onLoad={e => {
                                                    const img = e.currentTarget;
                                                    setImageDimensions(prev => {
                                                        const next = [...prev];
                                                        next[index] = { w: img.naturalWidth, h: img.naturalHeight };
                                                        return next;
                                                    });
                                                }}
                                            />
                                        </div>
                                    ) : null}
                                    <div className="absolute inset-y-0 right-8 left-8">
                                        {allBboxes
                                            .filter(b => b.page === index + 1)
                                            .map(b => {
                                                const tb = transformBbox(b.bbox, rotation);
                                                return (
                                                    <div
                                                        key={b.id}
                                                        id={`bbox-${b.id}`}
                                                        data-confidence={b.confidence}
                                                        className={`absolute cursor-pointer border transition-all duration-300 ${
                                                            activeFieldId === b.id
                                                                ? 'z-10'
                                                                : b.confidence != null && b.confidence < 0.9
                                                                  ? 'border-red-500 bg-red-500/10 hover:border-red-600 hover:bg-red-500/20'
                                                                  : b.confidence != null && b.confidence < 0.95
                                                                    ? 'border-orange-400 bg-orange-400/10 hover:border-orange-500 hover:bg-orange-500/20'
                                                                    : 'border-blue-300 bg-blue-300/8 hover:border-blue-500 hover:bg-blue-400/10'
                                                        }`}
                                                        style={{
                                                            left: `${(tb.x_min - 0.004) * 100}%`,
                                                            top: `${(tb.y_min - 0.003) * 100}%`,
                                                            width: `${(tb.x_max - tb.x_min + 0.01) * 100}%`,
                                                            height: `${(tb.y_max - tb.y_min + 0.005) * 100}%`
                                                        }}
                                                        onClick={e => handleBboxClick(b.id, e)}
                                                    >
                                                        {activeFieldId === b.id && activeFieldInfo && (
                                                            <div
                                                                data-edit-card
                                                                className="absolute z-20 min-w-[300px] rounded-lg border border-zinc-300 bg-white p-3 shadow-xl"
                                                                style={{
                                                                    top: `calc(100% + 8px + ${editCardPos.y}px)`,
                                                                    left: `${-10 + editCardPos.x}px`
                                                                }}
                                                                onClick={e => e.stopPropagation()}
                                                            >
                                                                <div className="mb-2 flex items-center justify-between gap-2">
                                                                    <div className="flex cursor-grab items-center gap-1.5 active:cursor-grabbing" onMouseDown={startEditCardDrag}>
                                                                        <GripHorizontal size={14} className="text-zinc-400" />
                                                                        <span className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
                                                                            {activeFieldInfo.fieldKey.replace(/_/g, ' ')}
                                                                        </span>
                                                                    </div>
                                                                    <button onClick={closeEditCard} className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-red-500">
                                                                        <X size={14} />
                                                                    </button>
                                                                </div>
                                                                <div
                                                                    className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 font-semibold text-lg text-zinc-800 break-words whitespace-pre-wrap"
                                                                    style={{
                                                                        minHeight: '10px',
                                                                        maxWidth: '300px',
                                                                        fontFamily: "Consolas, Menlo, Monaco, 'Courier New', monospace",
                                                                        fontVariantNumeric: 'slashed-zero'
                                                                    }}
                                                                >
                                                                    {activeFieldInfo.field?.value !== undefined ? String(activeFieldInfo.field.value) : ''}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Resizer */}
            <div
                className={`relative z-10 flex w-1 flex-shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-blue-500 ${isResizing ? 'bg-blue-500' : 'bg-gray-200'}`}
                onMouseDown={startResizing}
            >
                <div className="absolute inset-y-0 z-20 -ml-1 w-3" />
            </div>

            <div className="flex h-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
                {/* Scrollable Fields List */}
                <div ref={rightPaneRef} onScroll={updateConnectionLine} className={`flex-1 min-h-0 overflow-y-auto px-6 py-6 ${styles.track}`}>
                    <div className="mx-auto max-w-3xl space-y-6">
                        <div className="flex items-start gap-3 rounded-xl border-l-4 border-amber-500 bg-amber-50/80 p-4 shadow-sm ring-1 ring-amber-500/20">
                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                            <div className="flex flex-col">
                                <h4 className="text-sm font-semibold tracking-wide text-amber-800">Warning</h4>
                                <p className="mt-1 text-xs leading-relaxed text-amber-700">
                                    Please review all fields without fail. You must verify and confirm all extracted information before submitting the order.
                                </p>
                            </div>
                        </div>
                        {Object.entries(extractedData).map(([groupKey, groupValue]) => {
                            if (Array.isArray(groupValue)) {
                                if (groupValue.length === 0) return null;
                                const allKeys = Array.from(new Set(groupValue.flatMap(row => Object.keys(row))));

                                return (
                                    <div key={groupKey} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                                        <div className="flex justify-between border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-zinc-100/50 px-5 py-3.5">
                                            <h3 className=" flex items-center gap-3 text-sm font-semibold tracking-wide text-zinc-800 capitalize">
                                                {groupKey.replace(/_/g, ' ')}
                                                <Expand
                                                    tabIndex={0}
                                                    onFocus={() => setExpandedTableGroup(groupKey)}
                                                    size={15}
                                                    onClick={() => setExpandedTableGroup(groupKey)}
                                                    className="text-zinc-500 cursor-pointer hover:text-blue-600 transition-colors"
                                                />
                                            </h3>
                                            <button
                                                tabIndex={1}
                                                onClick={() => handleAddRow(groupKey)}
                                                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-blue-600"
                                            >
                                                <Plus size={14} />
                                                Add Row
                                            </button>
                                        </div>
                                        {expandedTableGroup !== groupKey && renderArrayTable(groupKey, groupValue)}
                                    </div>
                                );
                            }

                            return (
                                <div key={groupKey} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                                    <div className="border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-zinc-100/50 px-5 py-3.5">
                                        <h3 className="text-sm font-semibold tracking-wide text-zinc-800 capitalize">{groupKey.replace(/_/g, ' ')}</h3>
                                    </div>
                                    <div className="flex flex-col gap-5 p-5">
                                        {Object.entries(groupValue).map(([fieldKey, fieldValue]: [string, any]) => {
                                            if (groupKey === 'passport' && fieldKey === 'is_valid_passport') {
                                                if (fieldValue.value === 'NO' && !ignorePassportError) {
                                                    return (
                                                        <div key="invalid-passport-modal" className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-900/50 backdrop-blur-sm">
                                                            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl flex flex-col items-center text-center border border-red-100">
                                                                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 border-4 border-red-100">
                                                                    <AlertTriangle className="h-8 w-8 text-red-600" />
                                                                </div>
                                                                <h2 className="mb-3 text-xl font-bold text-zinc-900">Passport Mismatch</h2>
                                                                <p className="mb-8 text-sm leading-relaxed text-zinc-500">
                                                                    The ID page and address page are from different passports. Please upload both pages from the same passport.
                                                                </p>
                                                                <div className="flex w-full gap-3">
                                                                    <button
                                                                        onClick={handleClose}
                                                                        className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 active:scale-[0.98] cursor-pointer"
                                                                    >
                                                                        Close
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setIgnorePassportError(true)}
                                                                        className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 shadow-sm transition-all hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 active:scale-[0.98] cursor-pointer"
                                                                    >
                                                                        Proceed Anyway
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }
                                            const fieldEnums = enumsLookup[fieldKey];
                                            const isValueDiff =
                                                typeof fieldValue?.initialValue === 'string' &&
                                                String(fieldValue?.value ?? '')
                                                    .trim()
                                                    .toUpperCase() !== fieldValue?.initialValue.trim().toUpperCase();
                                            return (
                                                <div key={fieldKey} className="flex flex-col space-y-2">
                                                    <div className="flex justify-between">
                                                        <label htmlFor={`input-${groupKey}-${fieldKey}`} className="text-xs font-semibold tracking-wider text-zinc-600 uppercase">
                                                            {fieldKey.replace(/_/g, ' ')}
                                                        </label>
                                                    </div>
                                                    {fieldEnums ? (
                                                        <SearchableSelect
                                                            id={`input-${groupKey}-${fieldKey}`}
                                                            value={fieldValue?.value !== undefined ? String(fieldValue.value) : ''}
                                                            options={fieldEnums}
                                                            onFocus={() => handleFocus(`${groupKey}-${fieldKey}`)}
                                                            onBlur={e => handleBlur(e)}
                                                            onChange={val => {
                                                                const newData = { ...extractedData };
                                                                newData[groupKey] = {
                                                                    ...(newData[groupKey] as FieldGroup),
                                                                    [fieldKey]: { ...(fieldValue || {}), value: val }
                                                                };
                                                                setExtractedData(newData);
                                                            }}
                                                            className={`w-full rounded-md px-4 py-2.5 text-sm text-zinc-800 transition-all selection:bg-blue-200 placeholder:font-normal placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-100 ${
                                                                fieldValue?.confidence != null
                                                                    ? fieldValue.confidence < 0.9
                                                                        ? 'border-2 border-red-500'
                                                                        : fieldValue.confidence < 0.95
                                                                          ? 'border-2 border-orange-300'
                                                                          : 'border border-zinc-300 focus:border-blue-400'
                                                                    : 'border border-zinc-300 focus:border-blue-400'
                                                            } ${isValueDiff ? 'bg-yellow-100 focus:bg-yellow-50' : 'bg-white focus:bg-white'}`}
                                                        />
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            id={`input-${groupKey}-${fieldKey}`}
                                                            onFocus={() => handleFocus(`${groupKey}-${fieldKey}`)}
                                                            onBlur={e => handleBlur(e)}
                                                            value={fieldValue?.value !== undefined ? String(fieldValue.value) : ''}
                                                            onChange={e => {
                                                                const newData = { ...extractedData };
                                                                newData[groupKey] = {
                                                                    ...(newData[groupKey] as FieldGroup),
                                                                    [fieldKey]: { ...(fieldValue || {}), value: e.target.value }
                                                                };
                                                                setExtractedData(newData);
                                                            }}
                                                            className={`w-full rounded-md px-4 py-2.5 text-sm text-zinc-800 transition-all selection:bg-blue-200 placeholder:font-normal placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-100 ${
                                                                fieldValue?.confidence != null
                                                                    ? fieldValue.confidence < 0.9
                                                                        ? 'border-2 border-red-500'
                                                                        : fieldValue.confidence < 0.95
                                                                          ? 'border-2 border-orange-300'
                                                                          : 'border border-zinc-300 focus:border-blue-400'
                                                                    : 'border border-zinc-300 focus:border-blue-400'
                                                            } ${isValueDiff ? 'bg-yellow-100 focus:bg-yellow-50' : 'bg-white focus:bg-white'}`}
                                                        />
                                                    )}
                                                    {Array.isArray(fieldValue?.options) && fieldValue.options.length > 0 && (
                                                        <div className="flex flex-wrap gap-1.5 pt-1 pl-1">
                                                            {fieldValue.options.map((opt: any, optIdx: number) => {
                                                                const isSelected = String(fieldValue?.value ?? '').trim() === String(opt).trim();
                                                                return (
                                                                    <button
                                                                        key={optIdx}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const newData = { ...extractedData };
                                                                            newData[groupKey] = {
                                                                                ...(newData[groupKey] as FieldGroup),
                                                                                [fieldKey]: { ...(fieldValue || {}), value: opt }
                                                                            };
                                                                            setExtractedData(newData);
                                                                        }}
                                                                        className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-all cursor-pointer ${
                                                                            isSelected ? 'bg-blue-600 text-white shadow-xs' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 border border-zinc-200'
                                                                        }`}
                                                                    >
                                                                        {String(opt)}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    {isValueDiff && <div className="ml-2 text-xs text-orange-500">Extracted Value: {fieldValue?.initialValue || <span>" "</span>}</div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                        {/* EON Booking Number display */}
                        {currentOrder.maraekatDetails?.eonBookingNumber && (
                            <div className="space-y-3">
                                {/* EON Booking Number */}
                                <div className="overflow-hidden rounded-xl border border-green-200 bg-green-50 shadow-sm">
                                    <div className="flex items-center justify-between px-5 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
                                                <ArrowLeftRight size={18} className="text-green-600" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-medium tracking-wider text-green-600 uppercase">EON Booking Number</p>
                                                <p className="text-lg font-bold text-green-900">{currentOrder.maraekatDetails.eonBookingNumber}</p>
                                                <p className="text-xs font-medium tracking-wider text-green-600 uppercase mt-2">
                                                    {`${currentOrder.maraekatDetails?.bookingNumber}`.trim() !== `${currentOrder.orderDetails?.orderNumber}`.trim()
                                                        ? 'Random Order Number'
                                                        : 'Order Number'}
                                                </p>
                                                <p className=" font-bold text-green-900">{currentOrder.maraekatDetails?.bookingNumber}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {order?.maraekatDetails?.recPaySubmitted && (
                                    <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700">Rec Pay Submitted Successfully.</div>
                                )}

                                {/* Currency Details List */}
                                {currentOrder.currencyDetails && currentOrder.currencyDetails.length > 0 && (
                                    <div
                                        className={`overflow-hidden rounded-xl border shadow-sm ${currentOrder.maraekatDetails?.currencySubmitted ? 'border-green-300 bg-green-50/30' : 'border-indigo-200 bg-white'}`}
                                    >
                                        <div
                                            className={`flex items-center justify-between border-b px-5 py-3 ${currentOrder.maraekatDetails?.currencySubmitted ? 'border-green-200 bg-gradient-to-r from-green-50 to-emerald-50' : 'border-indigo-100 bg-gradient-to-r from-indigo-50 to-purple-50'}`}
                                        >
                                            <p className={`text-xs font-semibold tracking-wider uppercase ${currentOrder.maraekatDetails?.currencySubmitted ? 'text-green-700' : 'text-indigo-700'}`}>
                                                Currency Details
                                                {currentOrder.maraekatDetails?.currencySubmitted && ' — Added Successfully'}
                                            </p>
                                        </div>
                                        <div className={`divide-y ${currentOrder.maraekatDetails?.currencySubmitted ? 'divide-green-100' : 'divide-indigo-50'}`}>
                                            {currentOrder.currencyDetails.map((item, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`flex items-center justify-between px-5 py-3 transition-colors ${currentOrder.maraekatDetails?.currencySubmitted ? 'hover:bg-green-50/50' : 'hover:bg-indigo-50/40'}`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div
                                                            className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${currentOrder.maraekatDetails?.currencySubmitted ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}`}
                                                        >
                                                            {item.currency?.slice(0, 3) || '—'}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-semibold text-zinc-800">
                                                                {item.currency} <span className="text-zinc-400 font-normal">·</span> {item.product}
                                                            </span>
                                                            <span className="text-xs text-zinc-500">
                                                                Qty: <span className="font-medium text-zinc-700">{item.quantity}</span>
                                                                &nbsp;·&nbsp; Rate: <span className="font-medium text-zinc-700">{item.rate}</span>
                                                                &nbsp;·&nbsp; Amt: <span className="font-medium text-zinc-700">{item.amount}</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {currentOrder.maraekatDetails?.currencySubmitted && (
                            <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-medium text-green-700">Currency Added Successfully.</div>
                        )}
                    </div>
                </div>

                {/* Fixed Save Bar */}
                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 flex-wrap">
                    <button
                        tabIndex={1}
                        onClick={handleClose}
                        className="text-md rounded-md border border-gray-400 bg-white px-3 py-1 font-light text-gray-500 transition-all duration-200 ease-in-out hover:border-gray-500 hover:bg-gray-100 hover:text-gray-700 hover:shadow-md"
                    >
                        Close
                    </button>

                    {!currentOrder?.maraekatDetails?.eonBookingNumber && (
                        <button
                            tabIndex={1}
                            onClick={handleSave}
                            disabled={isSaving}
                            className="text-md rounded-md border border-gray-400 bg-white px-3 py-1 font-light text-gray-500 transition-all duration-200 ease-in-out hover:border-blue-500 hover:bg-blue-400 hover:text-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                    )}

                    <SubmitOrder
                        order={currentOrder}
                        extractedData={extractedData}
                        onOrderUpdate={handleOrderUpdate}
                        onBeforeSubmit={silentSave}
                        isKycSubmitted={Boolean(currentOrder?.maraekatDetails?.eonBookingNumber)}
                        isRecPaySubmitted={Boolean(currentOrder?.maraekatDetails?.recPaySubmitted)}
                        isCurrencySubmitted={Boolean(currentOrder?.maraekatDetails?.currencySubmitted)}
                    />
                </div>
            </div>

            {/* Connection line overlay — variable (straight vs zig-zag) */}
            <svg ref={lineRef} className="pointer-events-none absolute inset-0 z-[250] h-full w-full opacity-0 transition-opacity duration-150" xmlns="http://www.w3.org/2000/svg">
                <path fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="" />
                <circle className="dot-start" r="3" fill="#3b82f6" cx="0" cy="0" />
                <circle className="dot-end" r="3" fill="#3b82f6" cx="0" cy="0" />
            </svg>

            {/* Expanded Table Floating Card */}
            {expandedTableGroup &&
                Array.isArray(extractedData[expandedTableGroup]) &&
                (() => {
                    const groupKey = expandedTableGroup;
                    const groupValue = extractedData[groupKey] as any[];
                    return (
                        <div
                            data-floating-card
                            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[200] w-11/12 max-w-[1200px] bg-white rounded-xl shadow-[0_4px_40px_rgba(0,0,0,0.15)] border border-zinc-300 flex flex-col max-h-[60vh] overflow-hidden"
                        >
                            <div className="flex justify-between items-center bg-zinc-50 px-5 py-3 border-b border-zinc-200">
                                <h3 className="font-semibold text-zinc-800 capitalize flex items-center gap-3">{groupKey.replace(/_/g, ' ')}</h3>
                                <div className="flex items-center gap-2">
                                    <button
                                        tabIndex={1}
                                        onClick={() => handleAddRow(groupKey)}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-blue-600"
                                        title="Add new row"
                                    >
                                        <Plus size={14} />
                                        Add Row
                                    </button>
                                    <button tabIndex={1} onClick={() => setExpandedTableGroup(null)} className="text-zinc-500 hover:text-zinc-800 rounded-md p-1.5 hover:bg-zinc-200 transition-colors">
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-auto flex-1 bg-white">{renderArrayTable(groupKey, groupValue)}</div>
                        </div>
                    );
                })()}
        </div>
    );
};
