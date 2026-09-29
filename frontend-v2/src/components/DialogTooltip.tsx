import React, { useLayoutEffect, useRef, useState } from 'react';

interface DialogTooltipProps {
    content: string;
    children: React.ReactNode;
}

export default function DialogTooltip({ content, children }: DialogTooltipProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [maxWidth, setMaxWidth] = useState<number>(220);
    const [leftOffset, setLeftOffset] = useState<number | null>(null);
    const [arrowOffset, setArrowOffset] = useState<number | null>(null);
    const wrapperRef = useRef<HTMLSpanElement | null>(null);
    const tooltipRef = useRef<HTMLSpanElement | null>(null);

    useLayoutEffect(() => {
        if (!isOpen || !wrapperRef.current || !tooltipRef.current) {
            return;
        }

        const padding = 12;
        const boundaryElement = wrapperRef.current.closest('[role="dialog"]') as HTMLElement | null;
        const boundaryRect = boundaryElement?.getBoundingClientRect();
        const boundaryLeft = boundaryRect?.left ?? 0;
        const boundaryRight = boundaryRect?.right ?? window.innerWidth;
        const availableWidth = Math.max(160, boundaryRight - boundaryLeft - padding * 2);
        const nextMaxWidth = Math.min(220, availableWidth);

        if (maxWidth !== nextMaxWidth) {
            setMaxWidth(nextMaxWidth);
        }

        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        const wrapperRect = wrapperRef.current.getBoundingClientRect();
        const tooltipWidth = Math.min(tooltipRect.width, nextMaxWidth);
        const desiredLeft = wrapperRect.left + wrapperRect.width / 2 - tooltipWidth / 2;
        const clampedLeft = Math.min(
            Math.max(desiredLeft, boundaryLeft + padding),
            boundaryRight - padding - tooltipWidth
        );
        const nextLeftOffset = clampedLeft - wrapperRect.left;
        const wrapperCenter = wrapperRect.left + wrapperRect.width / 2;
        const desiredArrowLeft = wrapperCenter - clampedLeft;
        const minArrow = 12;
        const maxArrow = Math.max(minArrow, tooltipWidth - 12);
        const nextArrowOffset = Math.min(Math.max(desiredArrowLeft, minArrow), maxArrow);

        if (leftOffset !== nextLeftOffset) {
            setLeftOffset(nextLeftOffset);
        }

        if (arrowOffset !== nextArrowOffset) {
            setArrowOffset(nextArrowOffset);
        }
    }, [isOpen, content, maxWidth, leftOffset, arrowOffset]);

    return (
        <span
            ref={wrapperRef}
            className="relative inline-flex"
            onMouseEnter={() => {
                setLeftOffset(null);
                setArrowOffset(null);
                setIsOpen(true);
            }}
            onMouseLeave={() => setIsOpen(false)}
            onFocus={() => {
                setLeftOffset(null);
                setArrowOffset(null);
                setIsOpen(true);
            }}
            onBlur={() => setIsOpen(false)}
        >
            {children}
            {isOpen && (
                <span
                    ref={tooltipRef}
                    style={{
                        maxWidth: `${maxWidth}px`,
                        left: leftOffset === null ? '50%' : `${leftOffset}px`,
                        transform: leftOffset === null ? 'translateX(-50%)' : 'none',
                    }}
                    className="absolute bottom-full z-10 mb-2 w-max max-w-[220px] rounded-md bg-gray-800 px-3 py-2 text-xs leading-relaxed text-white shadow-lg"
                >
                    {content}
                    <span
                        style={{
                            left: arrowOffset === null ? '50%' : `${arrowOffset}px`,
                            transform: 'translate(-50%, -50%) rotate(45deg)',
                        }}
                        className="absolute top-full h-2 w-2 bg-gray-800"
                    />
                </span>
            )}
        </span>
    );
}
