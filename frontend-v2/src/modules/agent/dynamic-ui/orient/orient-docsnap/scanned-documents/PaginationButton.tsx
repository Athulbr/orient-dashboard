import React from 'react';

interface PaginationButtonProps {
    onClick: () => void;
    disabled: boolean;
    icon: React.ReactNode;
    title: string;
}

/**
 * Small square icon button used in the pagination control row.
 */
const PaginationButton: React.FC<PaginationButtonProps> = ({ onClick, disabled, icon, title }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer bg-white"
    >
        {icon}
    </button>
);

export default PaginationButton;
