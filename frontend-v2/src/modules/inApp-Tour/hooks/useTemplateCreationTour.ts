import { useEffect, useRef } from 'react';
import { driver, DriveStep, Config } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../styles/useProductTour.css';
import { getTourState, setTourState, resetTourState, isUserLoggedIn, setAllToursComplete, isTourEnabled } from './tourStorage';

interface UseTemplateCreationTourProps {
    enabled?: boolean;
}

export const useTemplateCreationTour = ({ enabled = true }: UseTemplateCreationTourProps) => {
    const driverRef = useRef<ReturnType<typeof driver> | null>(null);
    const hasShownTour = useRef(false);

    useEffect(() => {
        // Check if main product tour is completed
        const productTourShown = getTourState('productTourShown');
        const templateTourShown = getTourState('templateCreationTourShown');
        
        if (!enabled || templateTourShown || hasShownTour.current || !productTourShown || !isUserLoggedIn() || !isTourEnabled()) {
            return;
        }

        // Wait for DOM elements to be ready and for the product tour to fully complete
        const timer = setTimeout(() => {
            const createTemplateElement = document.querySelector('[data-tour-id="create-template"]');
            
            if (!createTemplateElement) {
                return;
            }

            const steps: DriveStep[] = [
                {
                    element: '[data-tour-id="create-template"]',
                    popover: {
                        title: 'Create Template',
                        description: 'Click here to create new templates for your projects. Templates help you standardize and automate your workflow.',
                        side: 'bottom' as const,
                        align: 'end' as const
                    }
                } as DriveStep
            ];

            const driverConfig: Config = {
                showProgress: false,
                showButtons: ['close'],
                allowClose: false,
                steps,
                onDestroyed: () => {
                    setTourState('templateCreationTourShown', true);
                    hasShownTour.current = true;
                },
                onDestroyStarted: () => {
                    setAllToursComplete();
                    hasShownTour.current = true;
                    driverRef.current?.destroy();
                },
                doneBtnText: 'Got it'
            };

            driverRef.current = driver(driverConfig);
            driverRef.current.drive();
            hasShownTour.current = true;
        }, 800);

        return () => {
            clearTimeout(timer);
            if (driverRef.current) {
                driverRef.current.destroy();
            }
        };
    }, [enabled]);

    const resetTour = () => {
        resetTourState('templateCreationTourShown');
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
