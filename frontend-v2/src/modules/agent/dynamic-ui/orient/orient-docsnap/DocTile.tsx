import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FileText, ExternalLink, X, Eye, EyeOff, Trash2, ZoomIn, ZoomOut, ChevronUp, AlertCircle, RefreshCw } from 'lucide-react';
import { FileItem } from './types';
import Spinner from '../../../../../components/Spinner';
import { DialogComponent } from '../../../../../components/DialogComponent';
import { Button } from '../../../../../components/Button';
import { config } from '../../../../../config/default';

// ── Constants ─────────────────────────────────────────────────

const API_KEY = import.meta.env.VITE_WORKFLOW_API_KEY || 'secret1';

const FILE_COLORS = {
    pdf: { label: 'PDF', text: 'text-blue-700', bg: 'bg-blue-100' },
    image: { label: 'IMG', text: 'text-emerald-800', bg: 'bg-emerald-100' },
    doc: { label: 'DOC', text: 'text-blue-700', bg: 'bg-blue-100' },
    other: { label: 'FILE', text: 'text-gray-500', bg: 'bg-gray-100' }
} as const;

// ── Helpers ───────────────────────────────────────────────────

export const getFileType = (url: string = ''): FileItem['type'] => {
    if (!url) return 'other';
    const lower = url.toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/)) return 'image';
    if (lower.match(/\.(doc|docx|xls|xlsx|ppt|pptx)$/)) return 'doc';
    return 'other';
};

export const getPreviewUrl = (url: string) => {
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
    return `${config.workflowService}/workflow/temp-storage/preview/${encodedPath}?apiKey=${API_KEY}`;
};

// ── DocTile Component ─────────────────────────────────────────

const DocTile: React.FC<{
    file: FileItem & { index?: number };
    onRemove?: () => void;
    onRemovePage?: (pageIndex: number) => void;
    onToggleIgnorePage?: (pageIndex: number) => void;
    onToggleIgnoreAll?: (ignoreAll: boolean) => void;
    orderStatus?: string;
}> = ({ file, onRemove, onRemovePage, onToggleIgnorePage, onToggleIgnoreAll, orderStatus }) => {
    const [hover, setHover] = useState(false);
    const [preview, setPreview] = useState(false);
    const [ignoredPages, setIgnoredPages] = useState<number[]>(file.ignoredPages || []);
    const [thumbUrl, setThumbUrl] = useState<string | null>(null);
    const [thumbLoading, setThumbLoading] = useState(file.type === 'image');
    const [thumbError, setThumbError] = useState(false);
    const [pageBlobUrls, setPageBlobUrls] = useState<Record<string, string>>({});
    const pageBlobUrlsRef = useRef<Record<string, string>>({});
    const [pageLoadingState, setPageLoadingState] = useState<Record<string, 'loading' | 'loaded' | 'error'>>({});
    const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
    const [pageToRemove, setPageToRemove] = useState<number | null>(null);
    const [zoom, setZoom] = useState(100);
    const [showScrollTop, setShowScrollTop] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setIgnoredPages(file.ignoredPages || []);
    }, [file.ignoredPages]);

    const handleTogglePageIgnore = (pageIdx: number) => {
        if (orderStatus === 'submitted') return;
        const isCurrentlyIgnored = ignoredPages.includes(pageIdx);
        const nextIgnored = isCurrentlyIgnored ? ignoredPages.filter(p => p !== pageIdx) : [...ignoredPages, pageIdx].sort((a, b) => a - b);
        setIgnoredPages(nextIgnored);
        onToggleIgnorePage?.(pageIdx);
    };

    const cfg = FILE_COLORS[file.type as keyof typeof FILE_COLORS] ?? FILE_COLORS.other;
    const shortName = file.name.replace(/\.[^.]+$/, '');

    const allPages = useMemo(() => {
        return file.pages && file.pages.length > 0 ? file.pages : file.url ? [file.url] : [];
    }, [file.pages, file.url]);

    const pageApiUrls = useMemo(() => allPages.map(getPreviewUrl), [allPages]);
    const totalPages = pageApiUrls.length;
    const firstPageUrl = pageApiUrls[0] || '';

    const isAllIgnored = totalPages > 0 && ignoredPages.length === totalPages;

    const handleToggleIgnoreAll = () => {
        if (orderStatus === 'submitted') return;
        const nextIgnoreAll = !isAllIgnored;
        if (nextIgnoreAll) {
            const allIndices = Array.from({ length: totalPages }, (_, i) => i);
            setIgnoredPages(allIndices);
        } else {
            setIgnoredPages([]);
        }
        onToggleIgnoreAll?.(nextIgnoreAll);
    };

    // Fetch thumbnail blob on mount
    useEffect(() => {
        if (file.type !== 'image' || !firstPageUrl) return;
        let objectUrl: string;

        const fetchThumb = async () => {
            try {
                const res = await fetch(firstPageUrl);
                if (!res.ok) throw new Error('Failed to fetch thumbnail');
                const blob = await res.blob();
                objectUrl = URL.createObjectURL(blob);
                setThumbUrl(objectUrl);
            } catch {
                setThumbError(true);
            } finally {
                setThumbLoading(false);
            }
        };
        fetchThumb();

        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [firstPageUrl, file.type]);

    // Fetch a single page blob
    const fetchPageBlob = useCallback(async (url: string) => {
        if (!url) return;
        if (pageBlobUrlsRef.current[url]) {
            setPageLoadingState(prev => ({ ...prev, [url]: 'loaded' }));
            return;
        }

        setPageLoadingState(prev => ({ ...prev, [url]: 'loading' }));
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch page');
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            pageBlobUrlsRef.current[url] = blobUrl;
            setPageBlobUrls(prev => ({ ...prev, [url]: blobUrl }));
            setPageLoadingState(prev => ({ ...prev, [url]: 'loaded' }));
        } catch (err) {
            console.error('Error fetching page:', err);
            setPageLoadingState(prev => ({ ...prev, [url]: 'error' }));
        }
    }, []);

    // Cleanup all page blob URLs on unmount
    useEffect(() => {
        return () => {
            Object.values(pageBlobUrlsRef.current).forEach(url => URL.revokeObjectURL(url));
        };
    }, []);

    // Fetch all pages when preview opens or pageApiUrls change
    useEffect(() => {
        if (preview) {
            pageApiUrls.forEach(url => {
                if (url && !pageBlobUrlsRef.current[url]) {
                    fetchPageBlob(url);
                }
            });
        }
    }, [preview, pageApiUrls, fetchPageBlob]);

    // Handle Escape key to close preview
    useEffect(() => {
        if (!preview) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setPreview(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [preview]);

    // Lock body scroll when preview is open
    useEffect(() => {
        if (preview) {
            const prevOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = prevOverflow;
            };
        }
    }, [preview]);

    // Track scroll position for "scroll to top" button
    const handleScroll = () => {
        if (scrollContainerRef.current) {
            setShowScrollTop(scrollContainerRef.current.scrollTop > 300);
        }
    };

    const scrollToTop = () => {
        scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const scrollToPage = (pageIdx: number) => {
        const el = document.getElementById(`doc-preview-page-${pageIdx}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleClick = () => {
        if (file.type === 'image' || totalPages > 0) {
            setZoom(100);
            setPreview(true);
        } else {
            const apiUrl = pageApiUrls[0];
            if (apiUrl) {
                fetch(apiUrl)
                    .then(res => res.blob())
                    .then(blob => {
                        const url = URL.createObjectURL(blob);
                        window.open(url, '_blank');
                        setTimeout(() => URL.revokeObjectURL(url), 60000);
                    })
                    .catch(err => console.error('Preview error:', err));
            }
        }
    };

    const handleOpenOriginalPage = (pageIdx: number) => {
        const apiUrl = pageApiUrls[pageIdx];
        if (apiUrl) {
            fetch(apiUrl)
                .then(res => res.blob())
                .then(blob => {
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                })
                .catch(err => console.error('Open original error:', err));
        }
    };

    const handleConfirmRemovePage = () => {
        if (pageToRemove === null) return;
        const removeIdx = pageToRemove;
        setPageToRemove(null);

        if (onRemovePage) {
            onRemovePage(removeIdx);
            if (totalPages <= 1) {
                setPreview(false);
            }
        }
    };

    const zoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
    const zoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
    const resetZoom = () => setZoom(100);

    return (
        <>
            {/* Tile Button */}
            <div
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                onClick={handleClick}
                title={file.name}
                className={`relative w-[84px] h-[112px] rounded-2xl flex flex-col items-center justify-center gap-2 px-2 pb-2 pt-3 cursor-pointer overflow-hidden flex-shrink-0 transition-all duration-200 shadow-lg
                    ${hover ? 'bg-white shadow-xl shadow-gray-800 scale-[1.03] border border-gray-300' : 'bg-gray-50 border border-gray-150 scale-100'}
                    ${ignoredPages.length === totalPages && totalPages > 0 ? 'opacity-60 ring-2 ring-amber-400' : ''}`}
                style={{ boxShadow: hover ? '0 4px 18px 0 rgba(0,0,0,0.10)' : '0 1px 4px 0 rgba(0,0,0,0.06)' }}
            >
                {onRemove && hover && orderStatus !== 'submitted' && (
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            setShowRemoveConfirm(true);
                        }}
                        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white border border-red-200 shadow-sm cursor-pointer flex items-center justify-center z-10 transition-colors hover:bg-red-50"
                        title="Remove Document"
                    >
                        <X size={10} className="text-red-500" />
                    </button>
                )}

                {totalPages > 1 && <span className="absolute top-1.5 left-1.5 text-[8px] font-extrabold text-white bg-black/50 px-[5px] py-[2px] rounded-md z-10">{totalPages} Pages</span>}

                {ignoredPages.length > 0 && (
                    <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-white bg-amber-600/90 px-1.5 py-0.5 rounded-full z-10 uppercase tracking-wider whitespace-nowrap shadow-sm">
                        {ignoredPages.length === totalPages ? 'Ignored' : `${ignoredPages.length} Ignored`}
                    </span>
                )}

                {file.type === 'image' || totalPages > 0 ? (
                    <div className="absolute inset-0 rounded-2xl overflow-hidden">
                        {thumbLoading ? (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                <Spinner size={16} />
                            </div>
                        ) : thumbError || !thumbUrl ? (
                            <div className="w-full h-full flex flex-col items-center justify-center rounded-2xl border border-red-300 bg-red-200 text-red-400">
                                <FileText size={20} className="mb-1 opacity-50 text-red-500" />
                                <span className="text-red-500 text-[10px]">Invalid File</span>
                            </div>
                        ) : (
                            <img src={thumbUrl} alt={file.name} className="w-full h-full object-cover" />
                        )}
                        <div
                            className={`absolute inset-0 flex flex-col items-center justify-center gap-1 transition-opacity duration-150 ${hover ? 'opacity-100' : 'opacity-0'}`}
                            style={{ background: 'rgba(0,0,0,0.38)' }}
                        >
                            <Eye size={18} className="text-white drop-shadow" />
                            <span className="text-white text-[10px] font-semibold tracking-wide">Preview</span>
                        </div>
                    </div>
                ) : (
                    <>
                        <span className={`text-[10px] font-extrabold tracking-widest font-mono ${cfg.text} ${cfg.bg} px-[6px] py-[3px] rounded-md`}>{cfg.label}</span>
                        <span className="text-[11px] text-gray-600 font-bold text-center leading-[1.3] break-all line-clamp-3 w-full px-0.5">{shortName}</span>
                        <div
                            className={`absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-1 transition-opacity duration-150 ${hover ? 'opacity-100' : 'opacity-0'}`}
                            style={{ background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(2px)' }}
                        >
                            <ExternalLink size={17} className="text-gray-500" />
                            <span className="text-gray-500 text-[10px] font-semibold tracking-wide">Open</span>
                        </div>
                    </>
                )}
            </div>

            {/* Scrollable Lightbox Preview Modal - Light Theme */}
            {preview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-0 select-none animate-in fade-in duration-200" onClick={() => setPreview(false)}>
                    <div className="relative w-full max-w-5xl h-full flex flex-col bg-slate-100 border-x border-gray-200 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-white border-b border-gray-200 shadow-sm z-20 flex-shrink-0">
                            {/* Document Title & Inline Page Count */}
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                <div className="p-1.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 flex-shrink-0">
                                    <FileText size={18} />
                                </div>
                                <div className="flex items-center gap-2 min-w-0">
                                    <h3 className="text-sm sm:text-base font-semibold text-gray-800 truncate" title={file.name}>
                                        {file.name}
                                    </h3>
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex-shrink-0">
                                        {totalPages} {totalPages === 1 ? 'Page' : 'Pages'}
                                    </span>
                                    {ignoredPages.length > 0 && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase tracking-wider flex-shrink-0">
                                            {ignoredPages.length === totalPages ? 'All Ignored' : `${ignoredPages.length} Ignored`}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Header Toolbar Controls */}
                            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                                {/* Zoom Controls */}
                                <div className="hidden sm:flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200 shadow-inner">
                                    <button
                                        onClick={zoomOut}
                                        disabled={zoom <= 50}
                                        className="p-1 text-gray-600 hover:text-gray-900 hover:bg-white disabled:opacity-30 disabled:hover:text-gray-600 disabled:hover:bg-transparent rounded transition-colors"
                                        title="Zoom Out (-25%)"
                                    >
                                        <ZoomOut size={16} />
                                    </button>
                                    <button
                                        onClick={resetZoom}
                                        className="px-2 text-xs font-mono font-medium text-gray-700 hover:text-gray-900 hover:bg-white rounded transition-colors"
                                        title="Reset Zoom (100%)"
                                    >
                                        {zoom}%
                                    </button>
                                    <button
                                        onClick={zoomIn}
                                        disabled={zoom >= 200}
                                        className="p-1 text-gray-600 hover:text-gray-900 hover:bg-white disabled:opacity-30 disabled:hover:text-gray-600 disabled:hover:bg-transparent rounded transition-colors"
                                        title="Zoom In (+25%)"
                                    >
                                        <ZoomIn size={16} />
                                    </button>
                                </div>

                                {/* Ignore All / Unignore All in Header Toolbar */}
                                {onToggleIgnoreAll && orderStatus !== 'submitted' && (
                                    <button
                                        onClick={handleToggleIgnoreAll}
                                        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border shadow-sm transition-all cursor-pointer ${
                                            isAllIgnored ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
                                        }`}
                                        title={isAllIgnored ? 'Click to unignore all pages of this document' : 'Click to ignore all pages of this document'}
                                    >
                                        {isAllIgnored ? <Eye size={13} className="text-white" /> : <EyeOff size={13} className="text-gray-500" />}
                                        <span>{isAllIgnored ? 'Unignore All' : 'Ignore All'}</span>
                                    </button>
                                )}

                                {/* Open Original Document */}
                                <button
                                    onClick={() => handleOpenOriginalPage(0)}
                                    className="hidden sm:flex items-center gap-1.5 bg-white hover:bg-gray-50 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm transition-colors"
                                    title="Open original file in new tab"
                                >
                                    <ExternalLink size={13} />
                                    <span>Open original</span>
                                </button>

                                {/* Close Button */}
                                <button
                                    onClick={() => setPreview(false)}
                                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors"
                                    title="Close preview (Esc)"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Page Jump Pills (if multi-page) */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-2 bg-white/90 border-b border-gray-200 backdrop-blur-sm overflow-x-auto custom-scrollbar flex-shrink-0">
                                <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar min-w-0">
                                    <span className="text-[11px] font-semibold text-gray-500 mr-1 flex-shrink-0 uppercase tracking-wider">Jump to:</span>
                                    {pageApiUrls.map((_, idx) => {
                                        const isPageIgnored = ignoredPages.includes(idx);
                                        return (
                                            <button
                                                key={idx}
                                                onClick={() => scrollToPage(idx)}
                                                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors flex-shrink-0 ${
                                                    isPageIgnored
                                                        ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                                        : 'bg-gray-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 text-gray-700 border-gray-200'
                                                }`}
                                            >
                                                Page {idx + 1} {isPageIgnored ? '(Ignored)' : ''}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Scrollable Image List Body */}
                        <div
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className="flex-1 overflow-y-auto w-full p-4 sm:p-6 space-y-6 flex flex-col items-center bg-slate-100/90 custom-scrollbar"
                            style={{ scrollBehavior: 'smooth' }}
                        >
                            {pageApiUrls.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                                    <AlertCircle size={40} className="mb-2 text-yellow-500 opacity-80" />
                                    <span className="text-sm font-medium">No pages available for preview</span>
                                </div>
                            ) : (
                                pageApiUrls.map((apiUrl, idx) => {
                                    const blobUrl = pageBlobUrls[apiUrl];
                                    const state = pageLoadingState[apiUrl] || (blobUrl ? 'loaded' : 'loading');
                                    const isPageIgnored = ignoredPages.includes(idx);

                                    return (
                                        <div
                                            key={idx}
                                            id={`doc-preview-page-${idx}`}
                                            className="w-full flex flex-col items-center transition-all duration-200"
                                            style={{
                                                maxWidth: zoom <= 100 ? `${zoom}%` : '100%',
                                                width: `${Math.min(100, Math.max(40, zoom))}%`
                                            }}
                                        >
                                            {/* Page Card */}
                                            <div
                                                className={`w-full bg-white border rounded-xl overflow-hidden shadow-md transition-all ${
                                                    isPageIgnored ? 'border-amber-300 ring-1 ring-amber-300' : 'border-gray-200'
                                                }`}
                                            >
                                                {/* Page Header */}
                                                <div
                                                    className={`flex items-center justify-between px-4 py-2 border-b transition-colors ${
                                                        isPageIgnored ? 'bg-amber-50/70 border-amber-200' : 'bg-gray-50 border-gray-200'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-semibold text-gray-700 tracking-wide">
                                                            Page {idx + 1} of {totalPages}
                                                        </span>
                                                        {isPageIgnored && (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase tracking-wider">
                                                                Ignored
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        {onToggleIgnorePage && orderStatus !== 'submitted' && (
                                                            <button
                                                                onClick={() => handleTogglePageIgnore(idx)}
                                                                className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-all duration-150 flex items-center gap-1.5 shadow-sm cursor-pointer ${
                                                                    isPageIgnored
                                                                        ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600'
                                                                        : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
                                                                }`}
                                                                title={isPageIgnored ? 'Click to unignore this page' : 'Click to ignore this page'}
                                                            >
                                                                <EyeOff size={13} className={isPageIgnored ? 'text-white' : 'text-gray-500'} />
                                                                <span>{isPageIgnored ? 'Ignored' : 'Ignore'}</span>
                                                            </button>
                                                        )}

                                                        <button
                                                            onClick={() => handleOpenOriginalPage(idx)}
                                                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-gray-100 rounded-md transition-colors"
                                                            title="Open this page in new tab"
                                                        >
                                                            <ExternalLink size={14} />
                                                        </button>

                                                        {onRemovePage && orderStatus !== 'submitted' && (
                                                            <button
                                                                onClick={() => setPageToRemove(idx)}
                                                                className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
                                                                title="Delete this page"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Page Image Display */}
                                                <div
                                                    onClick={() => {
                                                        if (onToggleIgnorePage && orderStatus !== 'submitted') {
                                                            handleTogglePageIgnore(idx);
                                                        }
                                                    }}
                                                    className={`relative w-full flex items-center justify-center bg-white min-h-[220px] p-3 transition-all ${
                                                        onToggleIgnorePage && orderStatus !== 'submitted' ? 'cursor-pointer' : ''
                                                    } ${isPageIgnored ? 'opacity-85' : 'opacity-100'}`}
                                                    title={
                                                        onToggleIgnorePage && orderStatus !== 'submitted'
                                                            ? isPageIgnored
                                                                ? 'Click to unignore this page'
                                                                : 'Click to ignore this page'
                                                            : undefined
                                                    }
                                                >
                                                    {state === 'loading' || (!blobUrl && state !== 'error') ? (
                                                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                                                            <Spinner size={24} className="text-blue-600" />
                                                            <span className="text-xs font-medium">Loading page {idx + 1}...</span>
                                                        </div>
                                                    ) : state === 'error' || !blobUrl ? (
                                                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-red-500 bg-red-50/50 rounded-lg w-full">
                                                            <AlertCircle size={28} className="text-red-500" />
                                                            <span className="text-xs font-medium">Failed to load page {idx + 1}</span>
                                                            <button
                                                                onClick={e => {
                                                                    e.stopPropagation();
                                                                    fetchPageBlob(apiUrl);
                                                                }}
                                                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-1 font-medium underline"
                                                            >
                                                                <RefreshCw size={12} /> Retry
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="relative w-full flex items-center justify-center">
                                                            <img
                                                                src={blobUrl}
                                                                alt={`${file.name} - Page ${idx + 1}`}
                                                                className={`w-full h-auto object-contain rounded-md select-none border border-gray-100 transition-all ${
                                                                    isPageIgnored ? 'opacity-40 grayscale contrast-75' : ''
                                                                }`}
                                                                loading="lazy"
                                                            />
                                                            {isPageIgnored && (
                                                                <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none select-none">
                                                                    <div className="transform -rotate-12 border-2 sm:border-4 border-dashed border-amber-600/70 bg-amber-500/20 backdrop-blur-[1px] px-6 sm:px-10 py-3 sm:py-4 rounded-2xl shadow-lg flex items-center gap-3 sm:gap-4 select-none">
                                                                        <EyeOff className="w-8 h-8 sm:w-12 sm:h-12 text-amber-800 stroke-[2.5]" />
                                                                        <span className="text-2xl sm:text-4xl md:text-5xl font-black tracking-widest text-amber-900 uppercase font-mono drop-shadow-sm">
                                                                            IGNORED
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Floating Scroll to Top Button */}
                        {showScrollTop && (
                            <button
                                onClick={scrollToTop}
                                className="absolute bottom-5 right-6 w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center transition-all z-20"
                                title="Scroll to top"
                            >
                                <ChevronUp size={18} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Document Removal Confirmation Dialog */}
            {onRemove && (
                <DialogComponent isOpen={showRemoveConfirm} closeDialog={() => setShowRemoveConfirm(false)} name="Remove Document" className="max-w-[400px]">
                    <div className="p-6">
                        <div className="text-gray-600 mb-6 text-sm">
                            Are you sure you want to remove <strong className="break-all">{file.name}</strong>?
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button
                                outlined
                                onClick={e => {
                                    e.stopPropagation();
                                    setShowRemoveConfirm(false);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={e => {
                                    e.stopPropagation();
                                    onRemove();
                                    setShowRemoveConfirm(false);
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white border-red-600"
                            >
                                Remove
                            </Button>
                        </div>
                    </div>
                </DialogComponent>
            )}

            {/* Individual Page Removal Confirmation Dialog */}
            {pageToRemove !== null && (
                <DialogComponent isOpen={pageToRemove !== null} closeDialog={() => setPageToRemove(null)} name="Remove Page" className="max-w-[400px]">
                    <div className="p-6">
                        <div className="text-gray-600 mb-6 text-sm">
                            Are you sure you want to remove <strong>Page {pageToRemove + 1}</strong> from <span className="break-all">{file.name}</span>?
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button
                                outlined
                                onClick={e => {
                                    e.stopPropagation();
                                    setPageToRemove(null);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={e => {
                                    e.stopPropagation();
                                    handleConfirmRemovePage();
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white border-red-600"
                            >
                                Remove Page
                            </Button>
                        </div>
                    </div>
                </DialogComponent>
            )}
        </>
    );
};

export default DocTile;
