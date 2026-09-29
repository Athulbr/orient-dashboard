import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DialogComponent } from '../../../components/DialogComponent';
import { Button } from '../../../components/Button';
import { Check, ChevronDown, Plus, X, AlertCircle } from 'lucide-react';
import Spinner from '../../../components/Spinner';
import { useAlertStore } from '../../../components/alert/AlertStore';
import { useExtractionStore } from '../../../zustand-store/extractionStore';

export interface KeywordItem {
    keyword: string;
    source: string;
    selected: boolean;
}

export interface KeywordGroup {
    name: string;
    primary_keyword: string;
    keywords: KeywordItem[];
    /** Index into the parent's pendingRows array — set at creation time to avoid fragile name-matching */
    rowIndex?: number;
    /** The original exact name from the form/excel row so progress tracking perfectly matches useDocumentExtractor */
    rowName?: string;
}

interface KeywordSelectionDialogProps {
    isOpen: boolean;
    keywordGroups: KeywordGroup[];
    isFetching: boolean;
    onClose: () => void;
    onProceed: (groups: KeywordGroup[], comment?: string) => void;
    /** Called when user clicks Proceed inside a single group — should NOT close the dialog */
    onProceedGroup?: (group: KeywordGroup, comment?: string) => void | Promise<void>;
    isSubmitting?: boolean;
}

// Friendly labels for extraction steps
const STEP_LABELS: Record<string, string> = {
    uploading: 'Uploading...',
    extracting: 'Extracting data...',
    processing: 'Processing...',
    generating: 'Generating blog...',
    saving: 'Saving...',
};

export const KeywordSelectionDialog: React.FC<KeywordSelectionDialogProps> = ({
    isOpen,
    keywordGroups: initialGroups,
    isFetching,
    onClose,
    onProceed,
    onProceedGroup,
    isSubmitting = false,
}) => {
    const { showAlert } = useAlertStore();
    const navigate = useNavigate();
    const { extractionQueue } = useExtractionStore();

    const [groups, setGroups] = useState<KeywordGroup[]>(initialGroups);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(
        new Set(initialGroups.map((_, i) => i).slice(1))
    );

    // Tracks which groups have had Proceed clicked (so we can look them up in extractionQueue)
    const [proceededGroups, setProceededGroups] = useState<Set<number>>(new Set());
    const [userComment, setUserComment] = useState('');

    // Sync when initialGroups changes (e.g. after fetch)
    const [lastGroups, setLastGroups] = useState(initialGroups);
    if (initialGroups !== lastGroups) {
        setLastGroups(initialGroups);
        setGroups(initialGroups);
        setCollapsedGroups(new Set(initialGroups.map((_, i) => i).slice(1)));
        setProceededGroups(new Set());
        setUserComment('');
    }

    const toggleGroupCollapse = (gi: number) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(gi)) {
                next.delete(gi); // was collapsed → expand
            } else {
                next.add(gi);    // was expanded → collapse
            }
            return next;
        });
    };

    const handleToggleKeyword = (groupIndex: number, kwIndex: number) => {
        setGroups(prev => prev.map((g, gi) =>
            gi !== groupIndex ? g : {
                ...g,
                keywords: g.keywords.map((k, ki) => ki === kwIndex ? { ...k, selected: !k.selected } : k)
            }
        ));
    };

    const handleSelectAllInGroup = (groupIndex: number, selectAll: boolean) => {
        setGroups(prev => prev.map((g, gi) =>
            gi !== groupIndex ? g : { ...g, keywords: g.keywords.map(k => ({ ...k, selected: selectAll })) }
        ));
    };

    const handleSelectAll = (selectAll: boolean) => {
        setGroups(prev => prev.map(g => ({ ...g, keywords: g.keywords.map(k => ({ ...k, selected: selectAll })) })));
    };

    const totalSelected = groups.reduce((acc, g) => acc + g.keywords.filter(k => k.selected).length, 0);
    const totalKeywords = groups.reduce((acc, g) => acc + g.keywords.length, 0);

    // Add keyword per group
    const [activeAddGroup, setActiveAddGroup] = useState<number | null>(null);
    const [addValue, setAddValue] = useState('');
    const addInputRef = useRef<HTMLInputElement>(null);

    const openAddKeyword = (gi: number) => {
        setActiveAddGroup(gi);
        setAddValue('');
        setTimeout(() => addInputRef.current?.focus(), 50);
    };

    const closeAddKeyword = () => {
        setActiveAddGroup(null);
        setAddValue('');
    };

    const commitAddKeyword = (gi: number) => {
        const value = addValue.trim();
        if (!value) { closeAddKeyword(); return; }
        setGroups(prev => prev.map((g, i) => i !== gi ? g : {
            ...g,
            keywords: [...g.keywords, { keyword: value, source: 'manual', selected: true }]
        }));
        closeAddKeyword();
    };

    // ——— Per-group proceed ———
    const handleProceedGroup = async (gi: number) => {
        // Mark as proceeded and collapse so user can review others
        setProceededGroups(prev => new Set(prev).add(gi));
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            next.add(gi);
            return next;
        });

        if (onProceedGroup) {
            await Promise.resolve(onProceedGroup(groups[gi], userComment));
        } else {
            await Promise.resolve(onProceed([groups[gi]], userComment));
        }
    };

    const handleClose = () => {
        showAlert({
            alertText: "Are you sure you want to cancel? This will remove your selected keywords and terminate block generation.",
            primaryButtonText: 'Yes, Cancel',
            secondaryButtonText: 'Go Back',
            onPrimaryAction: onClose,
        });
    };

    // Look up the real extraction item for a group by matching the exact original rowName
    const getExtractionItem = (group: KeywordGroup) => {
        const expectedFileName = group.rowName || group.name;
        return extractionQueue.find(item => item.fileName === expectedFileName);
    };

    const allGroupsDone = proceededGroups.size === groups.length && groups.length > 0 &&
        groups.every(g => {
            const item = getExtractionItem(g);
            return item?.status === 'completed' || item?.status === 'failed';
        });

    return (
        <DialogComponent
            className="flex max-h-[calc(100vh-200px)] min-h-[calc(100vh-200px)] w-[80vw] flex-col"
            name="Select Keywords"
            isOpen={isOpen}
            closeDialog={handleClose}
            disableBlurCloseDialog
        >
            <div className="flex w-full min-h-0 flex-1 flex-col overflow-hidden p-10 pt-5">
                {/* Loading */}
                {isFetching && (
                    <div className="flex flex-col items-center justify-center gap-3 py-16">
                        <Spinner size={32} />
                        <p className="text-sm text-gray-500">Fetching SEO keywords for your content...</p>
                    </div>
                )}

                {/* Keyword selection */}
                {!isFetching && groups.length > 0 && (
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
                        {/* Global header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-base font-semibold text-gray-800">SEO Keywords</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {totalSelected} of {totalKeywords} selected across {groups.length} product{groups.length > 1 ? 's' : ''}
                                </p>
                            </div>
                            {/* <div className="flex items-center gap-2">
                                <button onClick={() => handleSelectAll(true)} className="text-xs text-blue-600 hover:underline cursor-pointer">Select All</button>
                                <span className="text-gray-300">|</span>
                                <button onClick={() => handleSelectAll(false)} className="text-xs text-gray-500 hover:underline cursor-pointer">Deselect All</button>
                            </div> */}
                        </div>

                        {/* Groups list — scrollable */}
                        <div className="show-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
                            {groups.map((group, gi) => {
                                const groupSelected = group.keywords.filter(k => k.selected).length;
                                const allGroupSelected = groupSelected === group.keywords.length;
                                const isCollapsed = collapsedGroups.has(gi);
                                const hasProceed = proceededGroups.has(gi);

                                // Real extraction status from Zustand store
                                const extractionItem = getExtractionItem(group);
                                const isProcessing = hasProceed && extractionItem?.status === 'processing';
                                const isDone = hasProceed && extractionItem?.status === 'completed';
                                const isFailed = hasProceed && extractionItem?.status === 'failed';
                                const progress = extractionItem?.progress ?? 0;
                                const stepLabel = extractionItem?.step
                                    ? (STEP_LABELS[extractionItem.step] || extractionItem.step)
                                    : 'Processing...';
                                const elapsed = extractionItem?.time ?? 0;

                                return (
                                    <div key={gi} className={`shrink-0 rounded-xl border transition-all duration-200 ${
                                        isFailed
                                            ? 'border-red-300 bg-red-50'
                                            : isDone
                                            ? 'border-green-300 bg-green-50'
                                            : isProcessing
                                            ? 'border-orange-300 bg-orange-50/40'
                                            : 'border-gray-200 bg-gray-50'
                                    }`}>
                                        {/* Group header */}
                                        <div
                                            className={`flex items-center justify-between px-4 py-3 select-none transition-colors cursor-pointer ${
                                                isFailed ? 'hover:bg-red-100' :
                                                isDone ? 'hover:bg-green-100' :
                                                isProcessing ? 'hover:bg-orange-100/40' :
                                                'hover:bg-gray-100'
                                            }`}
                                            onClick={() => toggleGroupCollapse(gi)}
                                        >
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                {/* Status icon */}
                                                {isProcessing && <Spinner size={15} />}
                                                {isDone && !isProcessing && (
                                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500">
                                                        <Check size={11} className="text-white" strokeWidth={3} />
                                                    </span>
                                                )}
                                                {isFailed && (
                                                    <AlertCircle size={16} className="shrink-0 text-red-500" />
                                                )}
                                                {/* Always show chevron for expand/collapse */}
                                                {!isProcessing && (
                                                    <ChevronDown
                                                        size={16}
                                                        className={`shrink-0 text-gray-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}
                                                    />
                                                )}

                                                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                    isFailed ? 'bg-red-100 text-red-700' :
                                                    isDone ? 'bg-green-100 text-green-700' :
                                                    isProcessing ? 'bg-orange-100 text-orange-700' :
                                                    'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {groupSelected}/{group.keywords.length}
                                                </span>
                                                <p className="text-sm font-semibold text-gray-800 capitalize truncate">{group.name}</p>

                                                {/* Elapsed time — shown in header whenever processing */}
                                                {isProcessing && elapsed > 0 && (
                                                    <span className="shrink-0 text-[10px] text-orange-400">{elapsed}s</span>
                                                )}

                                                {/* Completed label when collapsed */}
                                                {isDone && isCollapsed && (
                                                    <span className="ml-1 text-xs font-medium text-green-600">Completed</span>
                                                )}

                                                {/* Failed label when collapsed */}
                                                {isFailed && isCollapsed && (
                                                    <span className="ml-1 text-xs font-medium text-red-500">Failed</span>
                                                )}
                                            </div>

                                            {/* Select All / Deselect All — only before proceeding */}
                                            {!hasProceed && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleSelectAllInGroup(gi, !allGroupSelected); }}
                                                    className="ml-2 shrink-0 text-xs text-blue-600 hover:underline cursor-pointer"
                                                >
                                                    {allGroupSelected ? 'Deselect All' : 'Select All'}
                                                </button>
                                            )}
                                        </div>

                                        {/* Expanded processing state — step label + full progress bar */}
                                        {isProcessing && !isCollapsed && (
                                            <div className="px-4 pb-3 pt-1">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-xs text-orange-600 font-medium">{stepLabel}</span>
                                                    <span className="text-xs font-semibold text-orange-700">{progress}%</span>
                                                </div>
                                                <div className="h-2 w-full overflow-hidden rounded-full bg-orange-100">
                                                    <div
                                                        className="h-full rounded-full bg-orange-500 transition-all duration-500"
                                                        style={{ width: `${progress}%` }}
                                                    />
                                                </div>
                                                {elapsed > 0 && (
                                                    <p className="mt-1.5 text-[10px] text-gray-400">{elapsed}s elapsed</p>
                                                )}
                                            </div>
                                        )}

                                        {/* Keywords grid — always visible when expanded */}
                                        {!isCollapsed && (
                                            <div className="px-4 pb-3">
                                                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                                                    {group.keywords.map((kw, ki) => (
                                                        <button
                                                            key={ki}
                                                            onClick={() => !hasProceed && handleToggleKeyword(gi, ki)}
                                                            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-all ${
                                                                hasProceed
                                                                    ? kw.selected
                                                                        ? isDone
                                                                            ? 'border-green-300 bg-green-50 text-green-800 cursor-default'
                                                                            : 'border-orange-300 bg-orange-50 text-orange-800 cursor-default'
                                                                        : 'border-gray-200 bg-white text-gray-400 cursor-default opacity-50'
                                                                    : kw.selected
                                                                        ? 'border-blue-500 bg-blue-50 text-blue-800 cursor-pointer'
                                                                        : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100 cursor-pointer'
                                                            }`}
                                                        >
                                                            <span className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                                                                hasProceed
                                                                    ? kw.selected
                                                                        ? isDone ? 'border-green-500 bg-green-500' : 'border-orange-400 bg-orange-400'
                                                                        : 'border-gray-200 bg-white'
                                                                    : kw.selected
                                                                        ? 'border-blue-500 bg-blue-500'
                                                                        : 'border-gray-300 bg-white'
                                                            }`}>
                                                                {kw.selected && <Check size={9} className="text-white" strokeWidth={3} />}
                                                            </span>
                                                            <span className="leading-snug break-words">{kw.keyword}</span>
                                                        </button>
                                                    ))}
                                                </div>

                                                {/* Add keyword & Proceed — only before proceeding */}
                                                {!hasProceed && (
                                                    <>
                                                        {/* Add keyword input */}
                                                        <div className="mt-2">
                                                            {activeAddGroup === gi ? (
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        ref={addInputRef}
                                                                        type="text"
                                                                        value={addValue}
                                                                        onChange={e => setAddValue(e.target.value)}
                                                                        onKeyDown={e => {
                                                                            if (e.key === 'Enter') commitAddKeyword(gi);
                                                                            if (e.key === 'Escape') closeAddKeyword();
                                                                        }}
                                                                        placeholder="Type a keyword and press Enter"
                                                                        className="flex-1 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                                                                        autoFocus
                                                                    />
                                                                    <button
                                                                        onClick={() => commitAddKeyword(gi)}
                                                                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                                                                    >
                                                                        <Check size={13} strokeWidth={3} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => closeAddKeyword()}
                                                                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-100 transition-colors"
                                                                    >
                                                                        <X size={13} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    onClick={() => openAddKeyword(gi)}
                                                                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer"
                                                                >
                                                                    <Plus size={13} />
                                                                    Add keyword
                                                                </button>
                                                            )}
                                                        </div>
                                                        {/* Per-group Proceed — hidden when only 1 remaining (use footer button instead) */}
                                                        {(groups.length - proceededGroups.size) > 1 && (
                                                            <div className="mt-3 flex justify-end border-t pt-3">
                                                                <Button
                                                                    small
                                                                    disabled={groupSelected === 0}
                                                                    onClick={e => { e.stopPropagation(); handleProceedGroup(gi); }}
                                                                >
                                                                    Proceed
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* User comment/instructions textarea */}
                        <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3.5 shrink-0">
                            <label htmlFor="userComment" className="text-xs font-semibold text-gray-700">
                                Additional Instructions / Comments (Optional)
                            </label>
                            <textarea
                                id="userComment"
                                value={userComment}
                                onChange={e => setUserComment(e.target.value)}
                                placeholder="Enter specific instructions or paste reference links (e.g. Tone: formal, reference: https://example.com/blog)..."
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 resize-none h-18"
                            />
                        </div>

                        {/* Footer — state machine */}
                        {(() => {
                            const allProceeded = proceededGroups.size === groups.length && groups.length > 0;

                            // Only compute statuses once all are proceeded
                            const failedGroups = allProceeded
                                ? groups.filter(g => getExtractionItem(g)?.status === 'failed')
                                : [];
                            const allCompleted = allProceeded &&
                                groups.every(g => getExtractionItem(g)?.status === 'completed');
                            const allSettled = allProceeded &&
                                groups.every(g => {
                                    const s = getExtractionItem(g)?.status;
                                    return s === 'completed' || s === 'failed';
                                });

                            // ── State 2: all proceeded but still processing → no footer buttons ──
                            if (allProceeded && !allSettled) {
                                return (
                                    <div className="flex items-center border-t pt-4">
                                        <span className="text-xs text-orange-500 animate-pulse">
                                            ⏳ {groups.length - failedGroups.length} of {groups.length} group{groups.length > 1 ? 's' : ''} processing...
                                        </span>
                                    </div>
                                );
                            }

                            // ── State 3: all settled + all completed ──
                            if (allSettled && allCompleted) {
                                return (
                                    <div className="flex items-center justify-between gap-2 border-t pt-4">
                                        <span className="text-xs font-medium text-green-600">✓ All records completed successfully</span>
                                        <div className="flex gap-2">
                                            <Button outlined onClick={onClose}>Close</Button>
                                            <Button onClick={() => { onClose(); navigate('/docsnap/record/list'); }}>
                                                View Records
                                            </Button>
                                        </div>
                                    </div>
                                );
                            }

                            // ── State 4: all settled + some failed ──
                            if (allSettled && failedGroups.length > 0) {
                                return (
                                    <div className="flex items-center justify-between gap-2 border-t pt-4">
                                        <span className="text-xs text-red-500">
                                            ⚠ {failedGroups.length} record{failedGroups.length > 1 ? 's' : ''} failed
                                        </span>
                                        <div className="flex gap-2">
                                            <Button outlined onClick={onClose}>Close</Button>
                                            <Button
                                                onClick={() => {
                                                    // Retry only the failed groups via per-group proceed
                                                    // (keeps the dialog open, re-triggers extraction)
                                                    failedGroups.forEach(group => {
                                                        if (onProceedGroup) {
                                                            onProceedGroup(group, userComment);
                                                        }
                                                    });
                                                }}
                                            >
                                                Proceed Remaining {failedGroups.length}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            }

                            // ── State 1: not all proceeded yet → Cancel + Proceed All ──
                            return (
                                <div className="flex items-center justify-between gap-2 border-t pt-4">
                                    <div className="text-xs text-gray-500">
                                        {proceededGroups.size > 0 && (
                                            <span>{proceededGroups.size} of {groups.length} group{groups.length > 1 ? 's' : ''} queued</span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button outlined onClick={handleClose}>Cancel</Button>
                                        <Button
                                            onClick={() => {
                                                const remaining = groups.filter((_, gi) => !proceededGroups.has(gi));
                                                onProceed(remaining.length > 0 ? remaining : groups, userComment);
                                            }}
                                            disabled={isSubmitting}
                                            startIcon={isSubmitting ? <Spinner size={14} /> : null}
                                        >
                                            {isSubmitting
                                                ? 'Processing...'
                                                : groups.length === 1
                                                    ? 'Proceed'
                                                    : proceededGroups.size > 0
                                                        ? `Proceed Remaining ${groups.length - proceededGroups.size}`
                                                        : 'Proceed All'
                                            }
                                        </Button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>
        </DialogComponent>
    );
};
