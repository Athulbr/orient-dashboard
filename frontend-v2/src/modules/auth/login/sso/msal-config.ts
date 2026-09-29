import { config } from '../../../../config/default';

export const msalConfig = {
    auth: {
        clientId: config.azure.clientId as string,
        authority: `https://login.microsoftonline.com/common`,
        redirectUri: `${config.baseUrl}/auth/login`,
        postLogoutRedirectUri: '/'
    },
    cache: {
        cacheLocation: 'localStorage',
        storeAuthStateInCookie: false
    }
};

export const loginRequest = {
    scopes: ['User.Read']
};

export const silentRequest = {
    scopes: ['openid', 'profile'],
    loginHint: 'example@domain.net'
};

/**
 * Add here the scopes to request when obtaining an access token for MS Graph API. For more information, see:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/resources-and-scopes.md
 */
export const graphConfig = {
    graphMeEndpoint: 'https://graph.microsoft.com/v1.0/me'
};
