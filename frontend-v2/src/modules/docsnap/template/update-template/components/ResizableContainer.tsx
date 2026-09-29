import React, { useRef, useState, useEffect } from 'react';

interface ResizableContainerProps {
    left: React.ReactNode;
    right: React.ReactNode;
    initialLeftWidthPercent?: number;
    minLeftWidthPercent?: number;
    maxLeftWidthPercent?: number;
    className?: string;
    onResize?: (leftWidthPercent: number) => void;
}

export const ResizableContainer: React.FC<ResizableContainerProps> = ({
    left,
    right,
    initialLeftWidthPercent = 50,
    minLeftWidthPercent = 10,
    maxLeftWidthPercent = 90,
    className = '',
    onResize
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rightRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const [leftWidthPercent, setLeftWidthPercent] = useState(initialLeftWidthPercent);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current || !containerRef.current) return;

            const containerRect = containerRef.current.getBoundingClientRect();
            const containerWidth = containerRect.width;
            const relativeX = e.clientX - containerRect.left;
            const newLeftPercent = (relativeX / containerWidth) * 100;

            if (newLeftPercent >= minLeftWidthPercent && newLeftPercent <= maxLeftWidthPercent) {
                setLeftWidthPercent(newLeftPercent);
                onResize?.(newLeftPercent);
            }
        };

        const handleMouseUp = () => {
            isDragging.current = false;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [minLeftWidthPercent, maxLeftWidthPercent]);

    return (
        <div ref={containerRef} className={`flex h-full w-full ${className}`}>
            <div style={{ width: `${leftWidthPercent}%` }} className="h-full !hidden md:!block">
                {left}
            </div>
            <div
                onMouseDown={e => {
                    e.preventDefault();
                    isDragging.current = true;
                }}
                className={`relative w-0.5 cursor-col-resize bg-gray-200 transition-colors hover:bg-blue-500`}
                style={{
                    userSelect: 'none',
                    flexShrink: 0
                }}
                draggable={false}
            >
                <div
                    className={`absolute top-1/2 left-1/2 h-8 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-gray-400 transition-colors hover:bg-blue-500`}
                >
                    <div className="flex h-full w-full items-center justify-center">
                        <div className="h-1 w-0.5 rounded-full bg-gray-300"></div>
                        <div className="ml-0.5 h-1 w-0.5 rounded-full bg-gray-300"></div>
                    </div>
                </div>
            </div>
            <div
                ref={rightRef}
                style={{
                    // @ts-ignore
                    '--right-width': `${100 - leftWidthPercent}%`
                }}
                className="h-full overflow-y-auto w-full md:w-[var(--right-width)]"
            >
                {right}
            </div>
        </div>
    );
};

{
    /* <div ref={containerRef} className={`flex h-full w-full ${className}`}>
            <div style={{ width: `${leftWidthPercent}%` }} className="h-full">
                {left}
            </div>
            <div
                onMouseDown={e => {
                    e.preventDefault();
                    isDragging.current = true;
                }}
                className={`relative w-0.5 cursor-col-resize bg-gray-200 transition-colors hover:bg-blue-500`}
                style={{
                    userSelect: 'none',
                    flexShrink: 0
                }}
                draggable={false}
            >
                <div
                    className={`absolute top-1/2 left-1/2 h-8 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-gray-400 transition-colors hover:bg-blue-500`}
                >
                    <div className="flex h-full w-full items-center justify-center">
                        <div className="h-1 w-0.5 rounded-full bg-gray-300"></div>
                        <div className="ml-0.5 h-1 w-0.5 rounded-full bg-gray-300"></div>
                    </div>
                </div>
            </div>
            <div ref={rightRef} style={{ width: `${100 - leftWidthPercent}%` }} className="h-full overflow-y-auto">
                {right}
            </div>
        </div> */
}
