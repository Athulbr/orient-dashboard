import React from 'react';

interface MetaPillProps {
    icon: React.ReactNode;
    children: React.ReactNode;
    colorClass?: string;
}

const MetaPill: React.FC<MetaPillProps> = ({ icon, children, colorClass = 'bg-gray-50 text-gray-700 border-gray-100' }) => (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${colorClass}`}>
        {icon}
        {children}
    </span>
);

export default MetaPill;
