import React, { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { ButtonBox } from './ButtonBox';
import { Button } from './Button';
import Spinner from './Spinner';
import { cn } from '../global-utils/twMerge';

export interface DialogPropsIF {
    name?: string;
    primaryButtonText?: string;
    secondaryButtonText?: string;
    children?: React.ReactNode;
    isOpen?: boolean;
    closeDialog?: () => void;
    onPrimaryAction?: () => void;
    onSecondaryAction?: () => void;
    fullScreen?: boolean;
    className?: string;
    layerClassName?: string;
    loading?: boolean;
    additionalButtons?: { label: string; action: () => void }[];
    disableBlurCloseDialog?: boolean;
    primaryButtonDataTourId?: string;
}

export const DialogComponent: React.FC<DialogPropsIF> = ({
    name,
    primaryButtonText,
    secondaryButtonText,
    children = <></>,
    isOpen,
    closeDialog = () => {},
    onPrimaryAction,
    onSecondaryAction,
    className,
    layerClassName,
    fullScreen,
    loading,
    additionalButtons,
    disableBlurCloseDialog = false,
    primaryButtonDataTourId
}) => {
    const dialogRef = useRef<HTMLDivElement>(null);

    // Handle escape key press to close the dialog
    useEscapeKey(closeDialog);

    // Handle click outside to close
    useEffect(() => {
        if (disableBlurCloseDialog || !isOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
                closeDialog();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, closeDialog]);

    const handlePrimaryAction = () => {
        if (onPrimaryAction) {
            onPrimaryAction();
        } else {
            closeDialog();
        }
    };

    const handleSecondaryAction = () => {
        if (onSecondaryAction) {
            onSecondaryAction();
        } else {
            closeDialog();
        }
    };

    // Prevent body scrolling when dialog is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    if (loading)
        return (
            <div className="fixed top-0 left-0 z-50 flex h-screen w-screen items-center justify-center overflow-hidden bg-[#00000082]">
                <Spinner className="text-white" />
            </div>
        );

    return (
        <div className={cn('fixed top-0 left-0 z-50 flex h-screen w-screen items-center justify-center overflow-hidden bg-[#00000082]', layerClassName)}>
            <div
                ref={dialogRef}
                className={cn(
                    'flex flex-col rounded-lg bg-[linear-gradient(180deg,_rgba(255,255,255,1)_0%,_rgb(246,250,252)_35%,_rgb(251,247,244)_100%)] shadow-xl',
                    className,
                    fullScreen ? 'h-full w-full rounded-none' : 'max-h-[98%]'
                )}
                role="dialog"
                aria-modal="true"
                aria-labelledby="dialog-title"
            >
                {name && (
                    <div className="flex items-center justify-between border-b border-gray-200 p-6 pl-8">
                        <h2 id="dialog-title" className="text-2xl font-semibold text-gray-900">
                            {name}
                        </h2>
                        <button
                            type="button"
                            onClick={closeDialog}
                            className="cursor-pointer rounded-full p-1 text-gray-400 transition-colors hover:text-gray-500 focus:ring-2 focus:ring-gray-500 focus:outline-none"
                            aria-label="Close dialog"
                        >
                            <X size={20} className="text-black" />
                        </button>
                    </div>
                )}

                <div className="flex h-full flex-1 flex-col overflow-y-auto">{children}</div>

                {(secondaryButtonText || primaryButtonText) && (
                    <ButtonBox className="p-4">
                        {secondaryButtonText && (
                            <Button id="secondary-button" onClick={handleSecondaryAction} outlined>
                                {secondaryButtonText}
                            </Button>
                        )}
                        {additionalButtons?.map((button, index) => (
                            <Button key={index} outlined onClick={button.action}>
                                {button.label}
                            </Button>
                        ))}
                        {primaryButtonText && (
                            <Button id="primary-button" onClick={handlePrimaryAction} data-tour-id={primaryButtonDataTourId}>
                                {primaryButtonText}
                            </Button>
                        )}
                    </ButtonBox>
                )}
            </div>
        </div>
    );
};
