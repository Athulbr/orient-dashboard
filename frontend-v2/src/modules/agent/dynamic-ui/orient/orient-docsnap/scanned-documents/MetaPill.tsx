import React from 'react';

interface MetaPillProps {
    icon: React.ReactNode;
    colorClass: string;
    children: React.ReactNode;
}

/**
 * Small pill badge used to display document metadata inline.
 * Pass `colorClass` to control background, text and border colours.
 */
const MetaPill: React.FC<MetaPillProps> = ({ icon, colorClass, children }) => (
    <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold border truncate max-w-[280px] ${colorClass}`}
    >
        {icon}
        <span className="truncate">{children}</span>
    </span>
);

export default MetaPill;
