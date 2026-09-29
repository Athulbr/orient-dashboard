import { useEffect, useRef } from 'react';
import { driver, DriveStep, Config } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../styles/useProductTour.css';
import { getTourState, setTourState, resetTourState, isUserLoggedIn, setAllToursComplete, isTourEnabled } from './tourStorage';

interface UseTemplateListTourProps {
    enabled?: boolean;
}

export const useTemplateListTour = ({ enabled = true }: UseTemplateListTourProps) => {
    const driverRef = useRef<ReturnType<typeof driver> | null>(null);
    const hasShownTour = useRef(false);

    useEffect(() => {
        // Check if product tour is completed and we should continue
        const productTourShown = getTourState('productTourShown');
        const templateListTourShown = getTourState('templateListTourShown');
        
        if (!enabled || templateListTourShown || hasShownTour.current || !productTourShown || !isUserLoggedIn() || !isTourEnabled()) {
            return;
        }

        // Wait for DOM elements to be ready
        const timer = setTimeout(() => {
            const firstTemplateCard = document.querySelector('[data-tour-id="first-template-card"]');
            const editFieldsButton = document.querySelector('[data-tour-id="edit-fields-button"]');
            const uploadButton = document.querySelector('[data-tour-id="upload-button"]');
            
            if (!firstTemplateCard || !editFieldsButton || !uploadButton) {
                return;
            }

            const steps: DriveStep[] = [
                {
                    element: '[data-tour-id="first-template-card"]',
                    popover: {
                        title: 'Template Created!',
                        description: 'Great! Your template has been created successfully. This card shows your template with its statistics and available actions.',
                        side: 'bottom' as const,
                        align: 'start' as const
                    }
                } as DriveStep,
                {
                    element: '[data-tour-id="edit-fields-button"]',
                    popover: {
                        title: 'Edit Fields',
                        description: 'Click here to customize your template fields. You can add, remove, or modify fields based on your document structure.',
                        side: 'bottom' as const,
                        align: 'start' as const
                    }
                } as DriveStep,
                {
                    element: '[data-tour-id="upload-button"]',
                    popover: {
                        title: 'Upload Documents',
                        description: 'Click here to upload documents for processing using this template. You can upload PDF or image files.',
                        side: 'bottom' as const,
                        align: 'end' as const,
                        onNextClick: () => {
                            // Trigger the Upload button click
                            const button = document.querySelector('[data-tour-id="upload-button"]') as HTMLElement;
                            if (button) {
                                button.click();
                            }
                            driverRef.current?.destroy();
                        }
                    }
                } as DriveStep
            ];

            const driverConfig: Config = {
                showProgress: true,
                showButtons: ['next', 'previous', 'close'],
                allowClose: false,
                steps,
                onDestroyed: () => {
                    setTourState('templateListTourShown', true);
                    hasShownTour.current = true;
                },
                onDestroyStarted: () => {
                    setAllToursComplete();
                    hasShownTour.current = true;
                    driverRef.current?.destroy();
                },
                progressText: '{{current}} of {{total}}',
                nextBtnText: 'Next',
                prevBtnText: 'Previous',
                doneBtnText: 'Done'
            };

            driverRef.current = driver(driverConfig);
            driverRef.current.drive();
            hasShownTour.current = true;
        }, 1000);

        return () => {
            clearTimeout(timer);
            if (driverRef.current) {
                driverRef.current.destroy();
            }
        };
    }, [enabled]);

    const resetTour = () => {
        resetTourState('templateListTourShown');
        hasShownTour.current = false;
    };

    const startTour = () => {
        if (driverRef.current) {
            driverRef.current.drive();
        }
    };

    return {
        resetTour,
        startTour
    };
};
