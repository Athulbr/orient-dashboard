import { useEffect, useRef } from 'react';
import { driver, DriveStep, Config } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../styles/useProductTour.css';
import { getTourState, setTourState, resetTourState, isUserLoggedIn, setAllToursComplete, isTourEnabled } from './tourStorage';

interface UseRecordListTourProps {
    enabled?: boolean;
}

export const useRecordListTour = ({ enabled = true }: UseRecordListTourProps) => {
    const driverRef = useRef<ReturnType<typeof driver> | null>(null);
    const hasShownTour = useRef(false);

    useEffect(() => {
        // Check if product tour is completed and we should continue
        const productTourShown = getTourState('productTourShown');
        const recordListTourShown = getTourState('recordListTourShown');
        
        if (!enabled || recordListTourShown || hasShownTour.current || !productTourShown || !isUserLoggedIn() || !isTourEnabled()) {
            return;
        }

        // Wait for DOM elements to be ready
        const timer = setTimeout(() => {
            const recordTable = document.querySelector('[data-tour-id="record-list-table"]');
            const extractionWindow = document.querySelector('[data-tour-id="extraction-floating-window"]');
            
            const steps: DriveStep[] = [];

            // Add extraction window step first if it exists
            if (extractionWindow) {
                steps.push({
                    element: '[data-tour-id="extraction-floating-window"]',
                    popover: {
                        title: 'Extraction Status',
                        description: 'This window shows the real-time progress of your document extraction. You can see the status of each uploaded file and track the processing time.',
                        side: 'left' as const,
                        align: 'center' as const
                    }
                } as DriveStep);
            }

            // Add records table step
            if (recordTable) {
                steps.push({
                    element: '[data-tour-id="record-list-table"]',
                    popover: {
                        title: 'Records Table',
                        description: 'Here you can see all your uploaded documents and their processing status. You can view, edit, filter, and manage your records from this table.',
                        side: 'top' as const,
                        align: 'center' as const
                    }
                } as DriveStep);
            }

            if (steps.length === 0) {
                return;
            }

            const driverConfig: Config = {
                showProgress: steps.length > 1,
                showButtons: ['next', 'previous', 'close'],
                allowClose: false,
                steps,
                onDestroyed: () => {
                    setTourState('recordListTourShown', true);
                    hasShownTour.current = true;
                },
                onDestroyStarted: () => {
                    hasShownTour.current = true;
                    driverRef.current?.destroy();
                },
                onCloseClick: () => {
                    setAllToursComplete();
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
    }, [enabled]);

    const resetTour = () => {
        resetTourState('recordListTourShown');
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
