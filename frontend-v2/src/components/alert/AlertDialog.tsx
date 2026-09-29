import React, { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { ButtonBox } from '../ButtonBox';
import { Button } from '../Button';
import { useAlertStore } from './AlertStore';

export const AlertDialog: React.FC = () => {
    const { alertText, isOpen, primaryButtonText, secondaryButtonText, hideCancelButton, onPrimaryAction, onSecondaryAction, closeAlert } = useAlertStore();

    const alertDialogRef = useRef<HTMLDivElement>(null);

    const handlePrimaryAction = () => {
        if (onPrimaryAction) {
            onPrimaryAction();
        }
        closeAlert();
    };

    const handleSecondaryAction = () => {
        if (onSecondaryAction) {
            onSecondaryAction();
        }
        closeAlert();
    };

    // Prevent body scrolling when alertDialog is open
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

    return (
        <div className="animate-fadeIn fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)]">
            <div
                ref={alertDialogRef}
                className="animate-scaleIn relative bottom-10 flex min-w-md flex-col overflow-hidden rounded-lg bg-white shadow-xl"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="alertDialog-title"
            >
                <div className="flex items-center justify-end p-3">
                    <button
                        type="button"
                        onClick={closeAlert}
                        className="cursor-pointer rounded-full p-1 text-gray-400 transition-colors hover:text-gray-500 focus:ring-2 focus:ring-gray-200 focus:outline-none"
                        aria-label="Close alertDialog"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="max-w-xl px-8 pb-4">{alertText}</div>

                <ButtonBox className="p-5">
                    {secondaryButtonText && !hideCancelButton && (
                        <Button onClick={handleSecondaryAction} outlined>
                            {secondaryButtonText}
                        </Button>
                    )}
                    {primaryButtonText && <Button onClick={handlePrimaryAction}>{primaryButtonText}</Button>}
                </ButtonBox>
            </div>
        </div>
    );
};
