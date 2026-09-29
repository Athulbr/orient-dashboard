import React, { useEffect, useState, useRef } from 'react';

interface AnnotationLineProps {
    sourceId: string; // ID of the source element (input field)
    targetId: string; // ID of the target element (text span)
    color?: string;
    strokeWidth?: number;
    showDots?: boolean;
}

interface Position {
    x: number;
    y: number;
}

interface LineData {
    start: Position;
    end: Position;
}

const HORIZONTAL_OFFSET = 50;

export const AnnotationLine: React.FC<AnnotationLineProps> = ({ sourceId, targetId, color = 'rgb(13 109 214)', strokeWidth = 2, showDots = true }) => {
    const [lineData, setLineData] = useState<LineData | null>(null);
    const rafRef = useRef<number | null>(null);

    const calculateLinePosition = () => {
        const sourceEl = document.getElementById(sourceId);
        const targetEl = document.getElementById(targetId);

        if (!sourceEl || !targetEl) {
            setLineData(null);
            return;
        }

        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        // Calculate connection points (left center of source, right center of target)
        const start: Position = {
            x: sourceRect.left - 64,
            y: sourceRect.top - 64 + sourceRect.height / 2
        };

        const end: Position = {
            x: targetRect.right - 64.5,
            y: targetRect.top - 64 + targetRect.height / 2
        };

        setLineData({ start, end });
    };

    useEffect(() => {
        // Initial calculation
        calculateLinePosition();

        // Update on scroll, resize, or any layout changes
        const handleUpdate = () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
            rafRef.current = requestAnimationFrame(calculateLinePosition);
        };

        window.addEventListener('scroll', handleUpdate, true);
        window.addEventListener('resize', handleUpdate);

        // Use MutationObserver to detect DOM changes
        const observer = new MutationObserver(handleUpdate);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });

        return () => {
            window.removeEventListener('scroll', handleUpdate, true);
            window.removeEventListener('resize', handleUpdate);
            observer.disconnect();
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [sourceId, targetId]);

    if (!lineData) return null;

    const { start, end } = lineData;

    // Calculate path with horizontal offsets (like the reference)
    const diff = start.x - end.x;

    const startHorizontalX = diff > 100 ? start.x - HORIZONTAL_OFFSET : start.x - 20;
    const startHorizontalY = start.y;
    const endHorizontalX = diff > 100 ? end.x + HORIZONTAL_OFFSET : end.x + 20;
    const endHorizontalY = end.y;

    const pathData = `M ${start.x} ${start.y} L ${startHorizontalX} ${startHorizontalY} L ${endHorizontalX} ${endHorizontalY} L ${end.x} ${end.y}`;

    return (
        <svg className="pointer-events-none absolute top-0 left-0 z-10 h-full w-full" role="img" aria-label="Annotation connection line">
            {/* Main path */}
            <path d={pathData} stroke={color} strokeWidth={strokeWidth} fill="none" />

            {/* Start dot */}
            {showDots && <circle cx={start.x} cy={start.y} r={2.5} fill={color} />}

            {/* End dot */}
            {showDots && <circle cx={end.x} cy={end.y} r={3} fill={color} />}
        </svg>
    );
};

// Hook for easier usage with your context
export const useAnnotationLine = (activeId: string) => {
    const sourceId = activeId ? `input-${activeId}` : '';
    const targetId = activeId ? `span-${activeId}` : '';

    return {
        sourceId,
        targetId,
        shouldRender: !!activeId
    };
};
