import { createRoot } from 'react-dom/client';
import './index.css';
import { StrictMode } from 'react';
import { App } from './App';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { MsalProvider } from '@azure/msal-react';
import { msalInstance, initializeMsal } from './modules/auth/login/sso/msal-service';
import { config } from './config/default';

const startApp = async () => {
    // await initializeMsal();

    const root = createRoot(document.getElementById('root')!);
    root.render(
        <GoogleOAuthProvider clientId={config.google.clientId as string}>
            {/* <MsalProvider instance={msalInstance}> */}
            <BrowserRouter>
                {/* <StrictMode> */}
                <App />
                {/* </StrictMode> */}
            </BrowserRouter>
            {/* </MsalProvider> */}
        </GoogleOAuthProvider>
    );
};

startApp();
