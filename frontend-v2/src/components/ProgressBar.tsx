import React from 'react';

interface ProgressBarProps {
    value: number;
    className?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ value, className = '' }) => {
    return (
        <div className={`h-[5px] w-full min-w-30 overflow-hidden rounded-full bg-gray-200 ${className}`}>
            <div className={`h-full rounded-full bg-amber-500 transition-all duration-300 ease-in-out`} style={{ width: `${value}%` }} />
        </div>
    );
};

export default ProgressBar;
