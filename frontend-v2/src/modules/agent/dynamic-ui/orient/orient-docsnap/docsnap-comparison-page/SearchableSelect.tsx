import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';

interface SearchableSelectProps {
    id?: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
    onFocus?: () => void;
    onBlur?: (e: React.FocusEvent) => void;
    placeholder?: string;
    className?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({ id, value, options, onChange, onFocus, onBlur, placeholder = 'Select...', className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const filteredOptions = options.filter(opt => opt.toLowerCase().includes(search.toLowerCase()));

    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    useEffect(() => {
        if (isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setDropdownStyle({
                position: 'fixed',
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
                zIndex: 99999
            });
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleScroll = (e: Event) => {
            if (listRef.current && (listRef.current === e.target || listRef.current.contains(e.target as Node))) {
                return; // let the dropdown list scroll
            }
            setIsOpen(false);
            setSearch('');
        };
        window.addEventListener('scroll', handleScroll, true);
        return () => window.removeEventListener('scroll', handleScroll, true);
    }, [isOpen]);

    // Reset highlight when filtered options change
    useEffect(() => {
        setHighlightedIndex(0);
    }, [search]);

    // Focus search input when dropdown opens
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen]);

    // Scroll highlighted item into view
    useEffect(() => {
        if (isOpen && listRef.current) {
            const items = listRef.current.querySelectorAll('[data-option]');
            if (items[highlightedIndex]) {
                items[highlightedIndex].scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex, isOpen]);

    const handleToggle = useCallback(() => {
        setIsOpen(prev => {
            if (!prev) {
                setSearch('');
                setHighlightedIndex(0);
            }
            return !prev;
        });
    }, []);

    const handleSelect = useCallback(
        (opt: string) => {
            onChange(opt);
            setIsOpen(false);
            setSearch('');
        },
        [onChange]
    );

    const handleClear = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            onChange('');
            setIsOpen(false);
            setSearch('');
        },
        [onChange]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (!isOpen) {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    setIsOpen(true);
                    setSearch('');
                    setHighlightedIndex(0);
                }
                return;
            }

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setHighlightedIndex(prev => Math.min(prev + 1, filteredOptions.length - 1));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setHighlightedIndex(prev => Math.max(prev - 1, 0));
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (filteredOptions[highlightedIndex]) {
                        handleSelect(filteredOptions[highlightedIndex]);
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    setIsOpen(false);
                    setSearch('');
                    break;
            }
        },
        [isOpen, filteredOptions, highlightedIndex, handleSelect]
    );

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (containerRef.current && !containerRef.current.contains(target) && (!dropdownRef.current || !dropdownRef.current.contains(target))) {
                setIsOpen(false);
                setSearch('');
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Handle blur: only fire parent onBlur if focus leaves the entire container
    const handleContainerBlur = useCallback(
        (e: React.FocusEvent) => {
            const relatedTarget = e.relatedTarget as Node;
            if (containerRef.current && !containerRef.current.contains(relatedTarget) && (!dropdownRef.current || !dropdownRef.current.contains(relatedTarget))) {
                setIsOpen(false);
                setSearch('');
                onBlur?.(e);
            }
        },
        [onBlur]
    );

    const normalizedValue = `${value}`.toUpperCase();

    const isInvalidValue = normalizedValue !== '' && !options.map(opt => `${opt}`.toUpperCase()).includes(normalizedValue);
    return (
        <div ref={containerRef} className="relative w-full" onBlur={handleContainerBlur} onKeyDown={handleKeyDown}>
            {/* Trigger button */}
            <button
                type="button"
                id={id}
                onClick={() => {
                    handleToggle();
                    if (!isOpen) onFocus?.();
                }}
                onFocus={() => {
                    if (!isOpen) onFocus?.();
                }}
                className={`flex w-full items-center justify-between rounded-md border px-4 py-2.5 text-left text-sm transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none ${
                    isInvalidValue ? 'border-red-400' : value ? 'border-gray-400 text-zinc-800' : 'border-gray-400 text-zinc-400'
                } ${isOpen ? 'border-blue-400 ring-2 ring-blue-100' : ''} ${className || ''}`}
                style={{ fontFamily: "Consolas, Menlo, Monaco, 'Courier New', monospace", fontVariantNumeric: 'slashed-zero' }}
            >
                <span className={`truncate ${!value ? 'font-normal' : ''} ${isInvalidValue ? 'text-red-500 font-medium' : ''}`}>{value || placeholder}</span>
                <div className="flex items-center gap-1 ml-2">
                    {value && (
                        <span onClick={handleClear} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors cursor-pointer">
                            <X size={14} />
                        </span>
                    )}
                    <ChevronDown size={16} className={`text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>

            {/* Dropdown */}
            {isOpen &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div ref={dropdownRef} className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg animate-in fade-in slide-in-from-top-1 duration-150" style={{ ...dropdownStyle, fontFamily: "Consolas, Menlo, Monaco, 'Courier New', monospace", fontVariantNumeric: 'slashed-zero' }}>
                        {/* Search */}
                        <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2">
                            <Search size={14} className="shrink-0 text-zinc-400" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search..."
                                className="w-full bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
                            />
                        </div>

                        {/* Options list */}
                        <div ref={listRef} className="max-h-[200px] overflow-y-auto py-1">
                            {filteredOptions.length === 0 ? (
                                <div className="px-3 py-4 text-center text-xs text-zinc-400">No matching options</div>
                            ) : (
                                filteredOptions.map((opt, idx) => (
                                    <div
                                        key={opt + idx}
                                        data-option
                                        onMouseDown={e => {
                                            e.preventDefault();
                                            handleSelect(opt);
                                        }}
                                        className={`cursor-pointer px-3 py-2 text-sm transition-colors ${
                                            `${opt}`.toUpperCase() === `${value}`.toUpperCase()
                                                ? 'bg-blue-50 font-medium text-blue-700'
                                                : highlightedIndex === idx
                                                  ? 'bg-zinc-50 text-zinc-800'
                                                  : 'text-zinc-700 hover:bg-zinc-50'
                                        }`}
                                    >
                                        {opt}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
};
