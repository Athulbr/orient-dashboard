import React from 'react';

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    errorMessage?: string;
    startIcon?: React.ReactNode;
    endIcon?: React.ReactNode;
}

export const TextField: React.FC<TextFieldProps> = ({
    label,
    errorMessage,
    startIcon,
    endIcon,
    className = '',
    disabled = false,
    placeholder = '',
    type = 'text',
    ...props
}) => {
    const hasError = !!errorMessage;

    return (
        <div className="flex flex-col space-y-1">
            {label && <label className="text-sm font-medium text-gray-700 pl-1">{label}</label>}

            <div className="relative">
                {startIcon && <div className="absolute top-1/2 left-3 -translate-y-1/2 transform text-gray-400">{startIcon}</div>}

                <input
                    type={type}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={`w-full rounded-md border px-3 py-2 outline-none ${startIcon ? 'pl-10' : ''} ${endIcon ? 'pr-10' : ''} ${
                        hasError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    } ${
                        disabled ? 'cursor-not-allowed bg-gray-100 text-gray-500' : 'bg-white text-gray-900'
                    } transition-colors duration-200 focus:ring-1 focus:outline-none ${className} `}
                    {...props}
                />

                {endIcon && <div className="absolute top-1/2 right-3 -translate-y-1/2 transform text-gray-400">{endIcon}</div>}
            </div>

            {errorMessage && <span className="text-sm text-red-600">{errorMessage}</span>}
        </div>
    );
};
