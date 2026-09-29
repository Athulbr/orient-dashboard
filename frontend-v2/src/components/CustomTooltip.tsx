import React, { useState, useRef, useEffect } from 'react';

interface CustomTooltipProps {
    children: React.ReactNode;
    content: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    className?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ children, content, position = 'top', className = '' }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const tooltipRef = useRef<HTMLDivElement>(null);
    const targetRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!targetRef.current || !tooltipRef.current) return;

            const targetRect = targetRef.current.getBoundingClientRect();
            const tooltipRect = tooltipRef.current.getBoundingClientRect();

            let newPosition = { x: 0, y: 0 };

            switch (position) {
                case 'top':
                    newPosition = {
                        x: e.clientX - tooltipRect.width / 2 + targetRect.width / 2,
                        y: e.clientY - tooltipRect.height - 10
                    };
                    break;
                case 'bottom':
                    newPosition = {
                        x: e.clientX - tooltipRect.width / 2 + targetRect.width / 2,
                        y: e.clientY + 10
                    };
                    break;
                case 'left':
                    newPosition = {
                        x: e.clientX - tooltipRect.width - 10,
                        y: e.clientY - tooltipRect.height / 2 + targetRect.height / 2
                    };
                    break;
                case 'right':
                    newPosition = {
                        x: e.clientX + 10,
                        y: e.clientY - tooltipRect.height / 2 + targetRect.height / 2
                    };
                    break;
            }

            setTooltipPosition(newPosition);
        };

        if (showTooltip) {
            document.addEventListener('mousemove', handleMouseMove);
        }

        return () => document.removeEventListener('mousemove', handleMouseMove);
    }, [showTooltip, position]);

    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            if (targetRef.current && tooltipRef.current && !targetRef.current.contains(e.target as Node) && !tooltipRef.current.contains(e.target as Node)) {
                setShowTooltip(false);
            }
        };

        document.addEventListener('click', handleOutsideClick);
        return () => document.removeEventListener('click', handleOutsideClick);
    }, []);

    return (
        <>
            <div ref={targetRef} onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)} className="relative">
                {children}
            </div>
            {showTooltip && (
                <div
                    ref={tooltipRef}
                    className={`absolute z-50 rounded-lg bg-gray-800 px-3 py-2 text-sm text-white shadow-lg transition-opacity duration-200 ${className}`}
                    style={{
                        left: tooltipPosition.x,
                        top: tooltipPosition.y,
                        opacity: showTooltip ? 1 : 0
                    }}
                >
                    {content}
                </div>
            )}
        </>
    );
};

export default CustomTooltip;
