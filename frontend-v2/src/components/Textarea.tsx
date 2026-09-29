import React, { FC, useId } from 'react';

function classNames(...classes: (string | boolean | undefined | null)[]): string {
    return classes.filter(Boolean).join(' ');
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
    helperText?: string;
    required?: boolean;
    disabled?: boolean;
    fullWidth?: boolean;
    wrapperClassName?: string;
    labelClassName?: string;
    errorClassName?: string;
    helperTextClassName?: string;
}

export const TextAreaComponent: FC<TextAreaProps> = ({
    label,
    error,
    helperText,
    required = false,
    disabled = false,
    fullWidth = true,
    className,
    wrapperClassName,
    labelClassName,
    errorClassName,
    helperTextClassName,
    id,
    placeholder,
    rows = 4,
    ...props
}) => {
    const generatedId = useId();
    const textareaId = id || `textarea-${generatedId}`;

    return (
        <div className={classNames('flex flex-col gap-1', fullWidth ? 'w-full' : '', wrapperClassName)}>
            {label && (
                <label
                    htmlFor={textareaId}
                    className={classNames(
                        'flex items-center gap-1 pl-1 text-sm font-medium text-gray-700',
                        disabled && 'cursor-not-allowed opacity-50',
                        labelClassName
                    )}
                >
                    {label}
                    {required && <span className="text-red-500">*</span>}
                </label>
            )}
            <textarea
                id={textareaId}
                rows={rows}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                aria-invalid={error ? 'true' : 'false'}
                aria-describedby={error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
                className={classNames(
                    'rounded-md border px-3 py-2 shadow-sm',
                    'focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none',
                    'placeholder:text-gray-400',
                    'transition duration-150 ease-in-out',
                    'resize-y',
                    fullWidth ? 'w-full' : '',
                    error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300',
                    disabled && 'cursor-not-allowed bg-gray-100 opacity-75',
                    className
                )}
                {...props}
            />
            {error && (
                <p id={`${textareaId}-error`} className={classNames('mt-1 text-sm text-red-600', errorClassName)}>
                    {error}
                </p>
            )}
            {!error && helperText && (
                <p id={`${textareaId}-helper`} className={classNames('mt-1 text-sm text-gray-500', helperTextClassName)}>
                    {helperText}
                </p>
            )}
        </div>
    );
};
