import { InputHTMLAttributes, useRef } from 'react';

interface MuiTextFieldIF extends InputHTMLAttributes<HTMLInputElement> {
    label: string;
    errorMessage?: string;
}

export const MuiTextField: React.FC<MuiTextFieldIF> = ({ label, errorMessage, value, onChange, className, ...rest }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <div className="mt-4 flex flex-col">
            <div className="relative">
                <input
                    type="text"
                    value={value}
                    onChange={onChange}
                    className={`peer w-full rounded border border-gray-400 px-4 py-3 pr-11 text-sm text-gray-800 duration-200 outline-none hover:border-gray-600 focus:border-gray-900 ${errorMessage ? 'border-red-500 hover:border-red-500 focus:border-red-500' : ''} ${className}`}
                    {...rest}
                    ref={inputRef}
                />
                <span
                    onClick={() => inputRef.current?.focus()}
                    className={`text-md absolute left-3 bg-white px-1 tracking-wide ${errorMessage ? 'text-red-500' : 'text-gray-600'} duration-200 ${
                        value
                            ? 'pointer-events-none top-0 -translate-y-2 text-xs'
                            : 'top-[10px] w-[calc(100%-20px)] peer-focus:pointer-events-none peer-focus:w-fit peer-focus:-translate-y-[18px] peer-focus:text-xs'
                    } `}
                >
                    {label}
                </span>
            </div>
            {errorMessage && (
                <p className="relative top-1 pl-1 text-sm text-red-500" role="alert">
                    {errorMessage}
                </p>
            )}
        </div>
    );
};
