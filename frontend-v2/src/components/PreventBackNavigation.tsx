// PreventBackNavigation.tsx - Alternative Approach
import { useEffect, useRef } from 'react';

interface PreventBackNavigationProps {
    onBack: () => void;
    enabled?: boolean;
}

const PreventBackNavigation: React.FC<PreventBackNavigationProps> = ({ onBack, enabled = true }) => {
    const timeoutRef = useRef<NodeJS.Timeout>(null);
    const isPreventingRef = useRef(false);

    useEffect(() => {
        if (!enabled) return;

        let isInitialized = false;

        const setupPrevention = () => {
            // Clear any existing timeout
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            // Add a dummy state to history if not already done
            if (!isInitialized) {
                window.history.pushState({ page: 'current' }, '', window.location.href);
                isInitialized = true;
            }
        };

        const handlePopState = (event: PopStateEvent) => {
            if (!enabled || isPreventingRef.current) return;

            isPreventingRef.current = true;

            // Immediately restore the current page
            window.history.pushState({ page: 'current' }, '', window.location.href);

            // Call the callback
            onBack();

            // Reset prevention flag
            timeoutRef.current = setTimeout(() => {
                isPreventingRef.current = false;
            }, 50);
        };

        // Setup prevention
        setupPrevention();

        // Add popstate listener
        window.addEventListener('popstate', handlePopState);

        // Cleanup
        return () => {
            window.removeEventListener('popstate', handlePopState);
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, [onBack, enabled]);

    return null;
};

export default PreventBackNavigation;

// Usage Hook Alternative
export const usePreventBackNavigation = (onBack: () => void, enabled: boolean = true) => {
    useEffect(() => {
        if (!enabled) return;

        let hasSetup = false;

        const preventBack = () => {
            if (!hasSetup) {
                window.history.pushState(null, '', window.location.href);
                hasSetup = true;
            }
        };

        const handlePopState = () => {
            preventBack();
            onBack();
        };

        preventBack();
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [onBack, enabled]);
};
