import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const useBackButtonOverride = (redirectPath: string = '/') => {
    const navigate = useNavigate();

    useEffect(() => {
        window.history.pushState(null, '', window.location.pathname);

        const handlePopState = (event: PopStateEvent) => {
            event.preventDefault();
            window.history.pushState(null, '', window.location.pathname);
            navigate(redirectPath);
        };

        window.addEventListener('popstate', handlePopState);

        // Cleanup function
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [navigate]);
};
