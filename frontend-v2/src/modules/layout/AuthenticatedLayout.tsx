import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import HeaderComponent from './Header';
import { usePermissionStore } from '../../zustand-store/PermissionStore';
import { SidebarComponent } from './Sidebar';
import { config } from '../../config/default';
interface AuthenticatedLayoutIF {
    children: ReactNode;
}

const AuthenticatedLayout: React.FC<AuthenticatedLayoutIF> = ({ children }) => {
    const [showSidebar, setShowSidebar] = useState(false);
    const [logoutWarningSeconds, setLogoutWarningSeconds] = useState<number | null>(null);
    const [showExpiredModal, setShowExpiredModal] = useState<boolean>(false);
    const { setPermissions } = usePermissionStore();
    const location = useLocation();

    const updateRolePermission = async () => {
        const permissions: any = sessionStorage.getItem('permissions');
        const features = JSON.parse(permissions || '[]').map((feature: any) => {
            return feature.key;
        });
        setPermissions(features);
    };
    const updateUserSettingsHandler = async () => {};

    const agentRoute = location.pathname.includes('agent') || location.pathname.includes('reconcilation') || location.pathname.includes('ardex');

    useEffect(() => {
        updateRolePermission();
        updateUserSettingsHandler();

        const triggerSessionEnded = () => {
            const isOrientSSO = !!window.sessionStorage.getItem('orientClientId');
            window.sessionStorage.clear();
            const redirectTarget = isOrientSSO ? '/auth/logout-message' : '/auth/login';
            window?.location?.replace(redirectTarget);
        };

        let lastUserActivityTime = Date.now();
        const updateActivity = () => {
            lastUserActivityTime = Date.now();
        };
        window.addEventListener('mousemove', updateActivity);
        window.addEventListener('keydown', updateActivity);
        window.addEventListener('click', updateActivity);
        window.addEventListener('scroll', updateActivity);

        let isWarningActive = false;
        const handleSessionDeath = () => {
            if (isWarningActive) return;
            isWarningActive = true;
            let secs = 15;
            setLogoutWarningSeconds(secs);
            const countdownId = setInterval(() => {
                secs--;
                if (secs <= 0) {
                    clearInterval(countdownId);
                    setLogoutWarningSeconds(null);
                    setShowExpiredModal(true);
                } else {
                    setLogoutWarningSeconds(secs);
                }
            }, 1000);
        };

        const executeSessionCheck = async (forceCheck = false) => {
            if (isWarningActive) return; // Halt repeated checks during countdown

            const loginTime = window.sessionStorage.getItem('reactLoginTime');
            if (!loginTime) return;

            const makezSessionLimitMs = config.sessionTTLSeconds * 1000;
            const elapsedMs = Date.now() - parseInt(loginTime, 10);

            // Check if user was actively interacting with Makez during the local timeout window
            const isUserActiveLocally = Date.now() - lastUserActivityTime < makezSessionLimitMs;

            // Just before expiry of makez session, OR if forced by a visibility change ping
            if ((forceCheck || elapsedMs >= makezSessionLimitMs - 15000) && config.usePhpSessionApi) {
                try {
                    const orientClientId = window.sessionStorage.getItem('orientClientId') || '';
                    const currentUser = JSON.parse(window.sessionStorage.getItem('user') || '{}');
                    const userEmail = currentUser.email || '';

                    // Ping Orient to retrieve session status dynamically mapping Orient architecture
                    const baseUrl = config.orientSessionApi || 'http://localhost:8085/auth/session-status.php';
                    const url = `${baseUrl}?client_id=${orientClientId}`;

                    console.log('Session Status URL:', url);
                    const res = await fetch(url, {
                        method: 'GET',
                        credentials: 'omit' // No longer strictly need cookies since we explicitly pass session_id
                    });

                    const data = await res.json().catch(() => ({}));

                    if (res.ok && data?.active) {
                        // Orient guarantees valid session.
                        if (forceCheck) {
                            // If tab-switch triggered this, definitively trust Orient is alive and silently extend Makez local clock!
                            window.sessionStorage.setItem('reactLoginTime', Date.now().toString());
                        } else {
                            if (isUserActiveLocally) {
                                // User actively working in natural timeout limit, extend Makez session
                                window.sessionStorage.setItem('reactLoginTime', Date.now().toString());
                            } else {
                                // User left Makez untouched completely and Makez has naturally timed out
                                handleSessionDeath();
                            }
                        }
                    } else {
                        // Orient API explicitly returned an error or active: false
                        if (forceCheck) {
                            // Tab-focus verification explicitly verified Orient is dead -> Hard Modal immediately! NO grace period!
                            setShowExpiredModal(true);
                        } else {
                            // Natural timeout discovery -> 15 second grace period
                            handleSessionDeath();
                        }
                    }
                } catch (error) {
                    // Network glitch. Do not falsely fail a forceCheck over a momentary network drop
                    if (!forceCheck) {
                        handleSessionDeath();
                    }
                }
            } else if (!config.usePhpSessionApi && elapsedMs > makezSessionLimitMs) {
                // strict fallback mapping entirely ignoring the server if disabled natively
                handleSessionDeath();
            }
        };

        // [07] Layer 1: Check session on initial application component wrapper load
        executeSessionCheck();

        // Fire session-status on visibilitychange event when tab becomes visible
        const visibilityHandler = () => {
            if (document.visibilityState === 'visible') {
                executeSessionCheck(true);
            }
        };
        document.addEventListener('visibilitychange', visibilityHandler);

        // Layer 3: Fallback Poller safety net
        // using 1 second (1000ms) frequency check allowing precise sub-second bounds evaluations flawlessly before actual expiry bounds
        const fallBackPollerId = setInterval(executeSessionCheck, 1000);

        return () => {
            document.removeEventListener('visibilitychange', visibilityHandler);
            clearInterval(fallBackPollerId);
        };
    }, []);

    return (
        <div className="relative flex h-full w-screen flex-col">
            {logoutWarningSeconds !== null && (
                <div className="fixed bottom-6 right-6 z-[9998] flex flex-col gap-1 rounded-md bg-red-600 px-6 py-4 text-white shadow-2xl">
                    <p className="text-[16px] font-bold">Orient Session About to Expire</p>
                    <p className="text-sm">Makez will automatically lock in {logoutWarningSeconds} seconds.</p>
                </div>
            )}

            {showExpiredModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" style={{ pointerEvents: 'auto' }}>
                    <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl bg-white p-8 text-center shadow-2xl">
                        <div className="mb-2 rounded-full bg-red-100 p-3 text-red-600">
                            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-slate-800">Session Expired</h2>
                        <p className="mb-4 text-sm text-slate-600">Orient Session expired. Please go back to orient and login.</p>
                        <button
                            className="w-full rounded-md bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700"
                            onClick={() => {
                                const isOrientSSO = !!window.sessionStorage.getItem('orientClientId');
                                window.sessionStorage.clear();
                                if (isOrientSSO) {
                                    window.close(); // Request browser to close target='makez_reviewer' tab seamlessly
                                }
                                const redirectTarget = isOrientSSO ? '/auth/logout-message' : '/auth/login';
                                window.location.replace(redirectTarget);
                            }}
                        >
                            Okay
                        </button>
                    </div>
                </div>
            )}
            <HeaderComponent showSidebar={showSidebar} setShowSidebar={setShowSidebar} />
            <div className="flex h-screen w-full overflow-y-auto">
                {!agentRoute && <SidebarComponent showSidebar={showSidebar} setShowSidebar={setShowSidebar} />}
                {children}
            </div>
        </div>
    );
};

export default AuthenticatedLayout;
