import { PublicClientApplication, EventType, EventMessage, AuthenticationResult } from '@azure/msal-browser';
import { msalConfig } from './msal-config';

const msalInstance = new PublicClientApplication(msalConfig);

// ✅ Wrap all MSAL setup in an async initializer
export const initializeMsal = async () => {
    await msalInstance.initialize();

    const accounts = msalInstance.getAllAccounts();

    if (!msalInstance.getActiveAccount() && accounts?.length > 0) {
        msalInstance.setActiveAccount(accounts[0]);
    }

    msalInstance.addEventCallback((event: EventMessage) => {
        if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
            const authenticationResult = event.payload as AuthenticationResult;
            const account = authenticationResult.account;
            msalInstance.setActiveAccount(account);
        }
    });

    msalInstance.enableAccountStorageEvents();
};

export { msalInstance };
