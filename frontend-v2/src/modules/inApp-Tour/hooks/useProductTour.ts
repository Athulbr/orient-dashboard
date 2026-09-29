import { useEffect, useRef } from 'react';
import { driver, DriveStep, Config } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../styles/useProductTour.css';
import { getTourState, setTourState, resetTourState, isUserLoggedIn, setAllToursComplete, isTourEnabled } from './tourStorage';

interface TourItem {
    name: string;
    key: string;
    description?: string;
}

interface UseProductTourProps {
    items: TourItem[];
    enabled?: boolean;
    onComplete?: () => void;
    onSkip?: () => void;
}

export const useProductTour = ({ items, enabled = true, onComplete, onSkip }: UseProductTourProps) => {
    const driverRef = useRef<ReturnType<typeof driver> | null>(null);
    const hasShownTour = useRef(false);

    useEffect(() => {
        // Check if tour has been shown before (user-specific)
        const tourShown = getTourState('productTourShown');

        if (!enabled || tourShown || hasShownTour.current || !isUserLoggedIn() || !isTourEnabled()) {
            return;
        }

        // Wait for DOM elements to be ready
        const timer = setTimeout(() => {
            const steps: DriveStep[] = items
                .map((item, index) => {
                    const element = document.querySelector(`[data-tour-id="${item.key}"]`);
                    if (!element) return null;

                    // // Special step for Content Creation
                    // if (item.key === 'content-creation') {
                    //     return {
                    //         element: `[data-tour-id="${item.key}"]`,
                    //         popover: {
                    //             title: item.name,
                    //             description: item.description || `This is the ${item.name} module. Click here to access ${item.name} features.`,
                    //             side: 'right' as const,
                    //             align: 'center' as const,
                    //             nextBtnText: 'Done',
                    //             onNextClick: () => {
                    //                 window.open('/module/content-creation/Blog%20genaration%C2%A0Module%20–%20User%20Manual%20v1.pdf', '_blank');
                    //                 setAllToursComplete();
                    //                 driverRef.current?.destroy();
                    //             }
                    //         }
                    //     } as DriveStep;
                    // }
                    return {
                        element: `[data-tour-id="${item.key}"]`,
                        popover: {
                            title: item.name,
                            description: item.description || `This is the ${item.name} module. Click here to access ${item.name} features.`,
                            side: 'right' as const,
                            align: 'center' as const
                        }
                    } as DriveStep;
                })
                .filter((step): step is DriveStep => step !== null);

            // Add settings step if it exists
            const settingsElement = document.querySelector('[data-tour-id="settings"]');
            if (settingsElement) {
                steps.push({
                    element: '[data-tour-id="settings"]',
                    popover: {
                        title: 'Settings',
                        description: 'Access application settings, user management, and configuration options here.',
                        side: 'right' as const,
                        align: 'center' as const
                    }
                });
            }

            // Add Create Template button step if it exists
            const createTemplateElement = document.querySelector('[data-tour-id="create-template"]');
            if (createTemplateElement) {
                steps.push({
                    element: '[data-tour-id="create-template"]',
                    popover: {
                        title: 'Create Template',
                        description: 'Click here to create new templates for your projects. Templates help you standardize and automate your workflow.',
                        side: 'bottom' as const,
                        align: 'end' as const,
                        onNextClick: () => {
                            // Trigger the Create Template button click
                            const button = document.querySelector('[data-tour-id="create-template"]') as HTMLElement;
                            if (button) {
                                button.click();
                                // Wait for dialog to open before moving to next step
                                setTimeout(() => {
                                    driverRef.current?.moveNext();
                                }, 400);
                            }
                        }
                    }
                });

                // Add custom template step
                steps.push({
                    element: '[data-tour-id="custom-template"]',
                    popover: {
                        title: 'Custom Template',
                        description: 'Create a custom template by uploading your own document. This is useful when you have unique requirements.',
                        side: 'top' as const,
                        align: 'center' as const
                    }
                });

                // Add predefined templates step
                steps.push({
                    element: '[data-tour-id="predefined-template-first"]',
                    popover: {
                        title: 'Predefined Templates',
                        description: 'Choose from our predefined templates. These are ready-to-use templates designed for common use cases.',
                        side: 'bottom' as const,
                        align: 'start' as const,
                        onNextClick: () => {
                            // Auto-select the first predefined template
                            const firstTemplate = document.querySelector('[data-tour-id="predefined-template-first"]') as HTMLElement;
                            if (firstTemplate) {
                                firstTemplate.click();
                                // Wait a bit before moving to next step
                                setTimeout(() => {
                                    driverRef.current?.moveNext();
                                }, 200);
                            }
                        }
                    }
                });

                // Add template name input step
                steps.push({
                    element: '[data-tour-id="template-name-input"]',
                    popover: {
                        title: 'Template Name',
                        description: 'The template name is auto-filled based on your selection. You can modify it if needed to make it unique and identifiable.',
                        side: 'top' as const,
                        align: 'start' as const
                    }
                });

                // Add create template button in dialog step
                steps.push({
                    element: '[data-tour-id="dialog-create-template-button"]',
                    popover: {
                        title: 'Create Template',
                        description: 'Click this button to create your template. Your template will be saved and ready to use for processing documents.',
                        side: 'top' as const,
                        align: 'end' as const,
                        onNextClick: () => {
                            // Trigger the Create Template button click
                            const button = document.querySelector('[data-tour-id="dialog-create-template-button"]') as HTMLElement;
                            if (button) {
                                button.click();
                            }
                            driverRef.current?.destroy();
                        }
                    }
                });
            }

            if (steps.length === 0) {
                return;
            }

            const driverConfig: Config = {
                showProgress: true,
                showButtons: ['next', 'previous', 'close'],
                allowClose: false,
                steps,
                onDestroyed: () => {
                    setTourState('productTourShown', true);
                    hasShownTour.current = true;
                    if (onComplete) {
                        onComplete();
                    }
                },
                onDestroyStarted: () => {
                    if (driverRef.current && !driverRef.current.isLastStep()) {
                        setAllToursComplete();
                        hasShownTour.current = true;
                        if (onSkip) {
                            onSkip();
                        }
                    }
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
        }, 1500);

        return () => {
            clearTimeout(timer);
            if (driverRef.current) {
                driverRef.current.destroy();
            }
        };
    }, [items, enabled, onComplete, onSkip]);

    const resetTour = () => {
        resetTourState('productTourShown');
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
