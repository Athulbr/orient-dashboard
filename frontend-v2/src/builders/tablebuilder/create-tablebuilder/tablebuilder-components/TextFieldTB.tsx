import { LucideIcon } from 'lucide-react';
import React from 'react';

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string;
    errorMessage?: string;
    className?: string;
    labelIcon?: LucideIcon;
}

export const TextFieldTB: React.FC<TextFieldProps> = ({ label, labelIcon: Icon, errorMessage, className = '', ...inputProps }) => {
    return (
        <div className={` ${className}`}>
            <label className="flex items-center gap-1.5 pl-1 text-sm font-medium text-gray-500">
                {Icon && <Icon size={16} />}
                {label}
            </label>
            <input
                className={`mt-1 block w-full border px-3 py-2 ${errorMessage ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm focus:ring-2 focus:outline-none ${
                    errorMessage ? 'focus:border-red-500 focus:ring-red-500' : 'focus:border-sky-200 focus:ring-sky-100'
                } sm:text-sm`}
                {...inputProps}
            />
            {errorMessage && <p className="mt-1 text-sm text-red-600">{errorMessage}</p>}
        </div>
    );
};
