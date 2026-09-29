import { ReactNode, useState, useEffect, useRef, ButtonHTMLAttributes } from 'react';
import { cn } from '../global-utils/twMerge';
import { usePermissionStore } from '../zustand-store/PermissionStore';

interface ButtonPropsIF extends ButtonHTMLAttributes<HTMLButtonElement> {
    children?: ReactNode;
    outlined?: boolean;
    small?: boolean;
    large?: boolean;
    startIcon?: ReactNode;
    endIcon?: ReactNode;
    className?: string;
    disabled?: boolean;
    onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
    disableRipple?: boolean;
    permission?: string;
    ref?: React.RefObject<HTMLButtonElement>;
}

interface RippleType {
    x: number;
    y: number;
    size: number;
    id: number;
}

// Waves component for Material UI style ripple effect
const Waves = () => {
    const [ripples, setRipples] = useState<RippleType[]>([]);
    const nextId = useRef(0);

    useEffect(() => {
        // Clean up ripples after animation completes
        if (ripples.length > 0) {
            const timeoutId = setTimeout(() => {
                setRipples(prevRipples => prevRipples.slice(1));
            }, 550); // Match the animation duration
            return () => clearTimeout(timeoutId);
        }
    }, [ripples]);

    // Function to add a ripple at the specified position
    const addRipple = (x: number, y: number, size: number) => {
        const id = nextId.current;
        nextId.current += 1;
        setRipples([...ripples, { x, y, size, id }]);
    };

    return {
        ripples,
        addRipple,
        RippleEffect: () => (
            <>
                {ripples.map(ripple => (
                    <span
                        key={ripple.id}
                        className="pointer-events-none absolute rounded-full bg-current opacity-20"
                        style={{
                            left: ripple.x - ripple.size / 2,
                            top: ripple.y - ripple.size / 2,
                            width: ripple.size,
                            height: ripple.size,
                            transform: 'scale(0)',
                            animation: 'waves-ripple 0.55s linear'
                        }}
                    />
                ))}
            </>
        )
    };
};

export const Button = ({
    children,
    outlined = false,
    small = false,
    large = false,
    startIcon,
    endIcon,
    className = '',
    disabled = false,
    onClick,
    disableRipple = false,
    ref,
    permission,
    ...rest
}: ButtonPropsIF) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const { addRipple, RippleEffect } = Waves();
    const { checkPermission } = usePermissionStore();

    // Handle ref prop in React 19 style
    useEffect(() => {
        if (ref && buttonRef.current) {
            ref.current = buttonRef.current;
        }
    }, [ref]);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (disabled) return;

        if (!disableRipple) {
            // Get click coordinates relative to button
            const button = e.currentTarget;
            const rect = button.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Calculate the size of the ripple
            const maxSize = Math.max(rect.width, rect.height);
            const rippleSize = maxSize * 2;

            // Add new ripple
            addRipple(x, y, rippleSize);
        }

        // Call the provided onClick handler
        e.stopPropagation();
        if (onClick) onClick(e);
    };

    const sizeClasses = small ? 'h-8 px-3 text-sm' : large ? 'h-12 px-6 text-lg' : 'h-10 px-4';

    const colorClasses = outlined
        ? 'bg-white border-1 border-gray-300 text-sm text-gray-800 hover:bg-gray-100'
        : 'bg-primary-500 text-white border text-sm hover:bg-colorPrimary hover:text-gray-200';

    const disabledClasses = disabled ? 'opacity-50 cursor-default' : 'cursor-pointer';

    const activeClasses = 'focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1';

    if (permission && !checkPermission(permission)) return null;

    return (
        <button
            ref={buttonRef}
            className={cn(
                'relative flex items-center justify-center gap-2 overflow-hidden rounded-md border font-light transition-colors duration-200',
                sizeClasses,
                colorClasses,
                disabledClasses,
                activeClasses,
                className
            )}
            disabled={disabled}
            onClick={handleClick}
            {...rest}
        >
            {/* Material UI style ripple effect */}
            {!disableRipple && <RippleEffect />}

            {startIcon && <span className="inline-flex items-center">{startIcon}</span>}
            {children}
            {endIcon && <span className="inline-flex items-center">{endIcon}</span>}
        </button>
    );
};

// Add Material UI waves ripple animation to document
if (typeof document !== 'undefined') {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
    @keyframes waves-ripple {
      0% {
        transform: scale(0);
        opacity: 0.60;
      }
      100% {
        transform: scale(1);
        opacity: 0;
      }
    }
  `;
    document.head.appendChild(styleEl);
}
