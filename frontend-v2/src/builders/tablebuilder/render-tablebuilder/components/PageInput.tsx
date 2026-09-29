import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

type InputProps = {
    page: number;
    totalPages: number;
    setPage?: (pageNumber: number) => void;
    className?: string;
};

const PageInput: React.FC<InputProps> = ({ page, totalPages, setPage, className = '' }) => {
    const [value, setValue] = useState<string>(String(page));
    const [committed, setCommitted] = useState<boolean>(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const mirrorRef = useRef<HTMLSpanElement | null>(null);
    const lastCallRef = useRef<number>(0);
    const throttleTimeoutRef = useRef<number | null>(null);
    const THROTTLE_MS = 500;

    useEffect(() => {
        setValue(String(page));
    }, [page]);

    useEffect(() => {
        return () => {
            if (throttleTimeoutRef.current) {
                window.clearTimeout(throttleTimeoutRef.current);
                throttleTimeoutRef.current = null;
            }
        };
    }, []);

    useLayoutEffect(() => {
        if (!inputRef.current || !mirrorRef.current) return;

        const inputEl = inputRef.current;
        const mirrorEl = mirrorRef.current;

        // copy font-related styles so measurement matches render
        const cs = window.getComputedStyle(inputEl);
        mirrorEl.style.fontFamily = cs.fontFamily;
        mirrorEl.style.fontSize = cs.fontSize;
        mirrorEl.style.fontWeight = cs.fontWeight;
        mirrorEl.style.letterSpacing = cs.letterSpacing;
        mirrorEl.style.fontStyle = cs.fontStyle;
        mirrorEl.style.textTransform = cs.textTransform;

        // ensure mirror has at least a zero-width char so empty input still measures
        mirrorEl.textContent = value && value.length > 0 ? value : '\u200b';

        // calculate extra space from padding and borders
        const paddingLeft = parseFloat(cs.paddingLeft) || 0;
        const paddingRight = parseFloat(cs.paddingRight) || 0;
        const borderLeft = parseFloat(cs.borderLeftWidth) || 0;
        const borderRight = parseFloat(cs.borderRightWidth) || 0;
        const boxSizing = cs.boxSizing || 'content-box';

        const extra = boxSizing === 'border-box' ? paddingLeft + paddingRight + borderLeft + borderRight : paddingLeft + paddingRight;

        const width = Math.max(28, Math.ceil(mirrorEl.offsetWidth + extra + 10));
        inputEl.style.width = `${width}px`;
    }, [value]);

    const commit = () => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            setValue(String(page));
            return;
        }

        const clamped = Math.min(Math.max(1, Math.floor(parsed)), Math.max(1, totalPages || 1));
        if (setPage) setPage(clamped);
        else setValue(String(clamped));

        // mark as committed (remove hover/focus styles and caret) and blur
        setCommitted(true);
        if (inputRef.current) {
            inputRef.current.blur();
            inputRef.current.readOnly = true;
        }
    };

    const callSetPageIfValid = (val: string) => {
        const parsed = Number(val);
        if (!Number.isFinite(parsed) || parsed <= 0) return;

        const clamped = Math.min(Math.max(1, Math.floor(parsed)), Math.max(1, totalPages || 1));
        if (setPage) setPage(clamped);
    };

    const handleChange = (raw: string) => {
        const sanitized = raw.replace(/[^0-9]/g, '');
        setValue(sanitized);

        // do not trigger API for empty input
        if (!sanitized || !setPage) return;

        const now = Date.now();
        const since = now - (lastCallRef.current || 0);

        if (since >= THROTTLE_MS) {
            lastCallRef.current = now;
            callSetPageIfValid(sanitized);
        } else {
            if (throttleTimeoutRef.current) window.clearTimeout(throttleTimeoutRef.current);
            throttleTimeoutRef.current = window.setTimeout(() => {
                lastCallRef.current = Date.now();
                callSetPageIfValid(sanitized);
                throttleTimeoutRef.current = null;
            }, THROTTLE_MS - since) as unknown as number;
        }
    };

    const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = e => {
        if (e.key === 'Enter') commit();
    };

    const onFocus: React.FocusEventHandler<HTMLInputElement> = () => {
        // allow editing again when user focuses the input
        setCommitted(false);
        if (inputRef.current) inputRef.current.readOnly = false;
    };

    return (
        <span
            className={
                (className || 'cursor-pointer rounded-lg border-1 border-gray-100 px-4 py-1 text-sm') +
                ' inline-flex items-center gap-1' +
                (committed ? '' : ' hover:bg-gray-50')
            }
        >
            <span className="text-sm text-gray-500">Page</span>

            <span className="relative inline-flex items-center ">
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={value}
                    onChange={e => handleChange(e.target.value)}
                    onBlur={commit}
                    onKeyDown={onKeyDown}
                    onFocus={onFocus}
                    readOnly={committed}
                    style={{ caretColor: committed ? 'transparent' : undefined, cursor: committed ? 'default' : undefined }}
                    className={
                        'appearance-none bg-white text-sm rounded-lg border border-gray-100 h-7.5 px-1.5 py-2 text-center focus:outline-none' +
                        (committed ? '' : ' hover:border-black focus:border-black focus:ring-1 focus:ring-black')
                    }
                    aria-label={`Page ${page} of ${totalPages}`}
                />
                <span ref={mirrorRef} style={{ position: 'absolute', visibility: 'hidden', whiteSpace: 'pre' }} aria-hidden />
            </span>

            <span className="text-sm text-gray-500">of {totalPages}</span>
        </span>
    );
};

export default PageInput;
