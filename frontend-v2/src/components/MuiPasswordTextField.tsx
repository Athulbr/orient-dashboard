import { Eye, EyeOff } from 'lucide-react';
import { InputHTMLAttributes, useRef, useState } from 'react';

interface MuiPasswordTextFieldIF extends InputHTMLAttributes<HTMLInputElement> {
    label: string;
    errorMessage?: string;
}

export const MuiPasswordTextField: React.FC<MuiPasswordTextFieldIF> = ({ label, errorMessage, value, onChange, ...rest }) => {
    const [visible, setVisible] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const toggleVisibility = (e: React.MouseEvent<HTMLSpanElement>) => {
        e.stopPropagation();
        setVisible(!visible);
    };

    return (
        <div className="mt-4 flex flex-col">
            <div className="relative">
                <input
                    type={visible ? 'text' : 'password'}
                    value={value}
                    onChange={onChange}
                    className={`peer w-full rounded border border-gray-400 px-4 py-3 pr-11 text-sm text-gray-800 duration-200 outline-none hover:border-gray-600 focus:border-gray-900 ${errorMessage ? 'border-red-500 hover:border-red-500 focus:border-red-500' : ''}`}
                    {...rest}
                    ref={inputRef}
                    autoComplete="new-password"
                    role="textbox"
                    aria-label="Password"
                />
                <span
                    onClick={() => inputRef.current?.focus()}
                    className={`absolute left-3 bg-white px-1 tracking-wide ${errorMessage ? 'text-red-500' : 'text-gray-600'} duration-200 ${
                        value
                            ? 'pointer-events-none top-0 -translate-y-2 text-xs'
                            : 'top-[10px] peer-focus:pointer-events-none peer-focus:-translate-y-[18px] peer-focus:text-xs'
                    } ${!visible ? 'focus:text-2xl' : ''} `}
                >
                    {label}
                </span>
                {value && (
                    <span data-testid="toggle-visibility" onClick={toggleVisibility} className="absolute top-1 right-2 cursor-pointer p-2 text-gray-400">
                        {visible ? <Eye size={20} /> : <EyeOff size={20} />}
                    </span>
                )}
            </div>
            {errorMessage && (
                <p className="relative top-1 pl-1 text-sm text-red-500" role="alert">
                    {errorMessage}
                </p>
            )}
        </div>
    );
};
