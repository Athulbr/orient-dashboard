import React, { useState, useEffect } from 'react';
import { FileText, Loader2, AlertCircle, X } from 'lucide-react';
import { config } from '../../../../../../config/default';
import { API_KEY } from './constants';

interface InvoicePreviewIconProps {
    invoicePagePath?: string;
}

const ZoomableImage: React.FC<{ src: string; alt: string }> = ({ src, alt }) => {
    const [isZoomed, setIsZoomed] = useState(false);
    const [position, setPosition] = useState({ x: 50, y: 50 });

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - left) / width) * 100;
        const y = ((e.clientY - top) / height) * 100;
        setPosition({ x, y });
    };

    return (
        <div
            className="flex-1 h-full w-full bg-gray-100 flex items-center justify-center overflow-hidden relative cursor-zoom-in"
            onMouseEnter={() => setIsZoomed(true)}
            onMouseLeave={() => setIsZoomed(false)}
            onMouseMove={handleMouseMove}
        >
            <img
                src={src}
                alt={alt}
                className="w-full h-full object-contain transition-transform duration-100 ease-out pointer-events-none"
                style={{
                    transform: isZoomed ? 'scale(2.5)' : 'scale(1)',
                    transformOrigin: `${position.x}% ${position.y}%`
                }}
            />
        </div>
    );
};

/**
 * Displays a document icon.
 * On click, fetches and shows a full page preview of the invoice page image.
 * The image is fetched lazily on first open and the object URL is revoked on unmount.
 */
const InvoicePreviewIcon: React.FC<InvoicePreviewIconProps> = ({ invoicePagePath }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [hasOpened, setHasOpened] = useState(false);
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Fetch preview image on first open
    useEffect(() => {
        if (!invoicePagePath || !hasOpened) return;

        let objectUrl: string;

        const fetchImage = async () => {
            setLoading(true);
            try {
                const url = `${config.workflowService}/workflow/executions/files?path=${encodeURIComponent(invoicePagePath)}`;
                const token = localStorage.getItem('token');
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'x-api-key': API_KEY
                    }
                });
                if (!res.ok) throw new Error('Failed to fetch image');
                const blob = await res.blob();
                objectUrl = URL.createObjectURL(blob);
                setThumbUrl(objectUrl);
            } catch (err) {
                console.error('Error fetching preview:', err);
            } finally {
                setLoading(false);
            }
        };

        if (!thumbUrl) {
            fetchImage();
        }

        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [invoicePagePath, hasOpened]);

    const handleOpen = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(true);
        setHasOpened(true);
    };

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(false);
    };

    return (
        <div
            className="relative flex-shrink-0 w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center cursor-pointer hover:bg-blue-100 transition-colors"
            onClick={handleOpen}
        >
            <FileText size={18} className="text-blue-500" />

            {isOpen && invoicePagePath && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
                    <div
                        className="relative bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
                        style={{ height: '95vh', width: 'max-content', maxWidth: '95vw' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Close button inside the modal */}
                        <button
                            className="absolute top-4 right-4 p-2 bg-white/80 hover:bg-white rounded-full shadow-md text-gray-600 hover:text-gray-900 transition-colors z-10 cursor-pointer"
                            onClick={handleClose}
                            title="Close Preview"
                        >
                            <X size={20} />
                        </button>

                        {loading && !thumbUrl ? (
                            <div className="flex-1 flex flex-col gap-3 items-center justify-center min-w-[300px] min-h-[300px] bg-gray-50">
                                <Loader2 size={36} className="animate-spin text-blue-500" />
                                <span className="text-sm text-gray-500 font-medium">Loading full preview...</span>
                            </div>
                        ) : thumbUrl ? (
                            <ZoomableImage src={thumbUrl} alt="Invoice Full Preview" />
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-red-400 bg-red-50 p-10 min-w-[300px] min-h-[300px]">
                                <AlertCircle size={36} className="mb-3" />
                                <span className="text-sm font-medium">Preview failed</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default InvoicePreviewIcon;
