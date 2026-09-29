const globalEnv: any = {
    local: {
        baseUrl: import.meta.env.VITE_BASE_URL_LOCAL || 'http://localhost:27017/makez-new',
        nodeApiUrl: import.meta.env.VITE_NODE_URL_LOCAL || 'http://localhost:4000',
        extractionServicePython: import.meta.env.VITE_EXTRACTION_SERVICE_PYTHON_LOCAL || 'http://localhost:4000',
        chatbotServicePython: import.meta.env.VITE_CHATBOT_SERVICE_PYTHON_LOCAL,
        mlServiceNodejs: import.meta.env.VITE_AI_SERVICE_NODEJS_LOCAL || 'http://localhost:4000',
        workflowService: import.meta.env.VITE_WORKFLOW_SERVICE_LOCAL,
        reconcillationService: import.meta.env.VITE_RECONCILLATION_SERVICE_LOCAL
    },
    development: {
        baseUrl: import.meta.env.VITE_BASE_URL_DEV,
        nodeApiUrl: import.meta.env.VITE_NODE_URL_DEV,
        extractionServicePython: import.meta.env.VITE_EXTRACTION_SERVICE_PYTHON_DEV,
        chatbotServicePython: import.meta.env.VITE_CHATBOT_SERVICE_PYTHON_DEV,
        mlServiceNodejs: import.meta.env.VITE_AI_SERVICE_NODEJS_DEV,
        workflowService: import.meta.env.VITE_WORKFLOW_SERVICE_DEV
    },
    production: {
        baseUrl: import.meta.env.VITE_BASE_URL_PROD,
        nodeApiUrl: import.meta.env.VITE_NODE_URL_PROD,
        extractionServicePython: import.meta.env.VITE_EXTRACTION_SERVICE_PYTHON_PROD,
        chatbotServicePython: import.meta.env.VITE_CHATBOT_SERVICE_PYTHON_PROD,
        mlServiceNodejs: import.meta.env.VITE_AI_SERVICE_NODEJS_PROD,
        workflowService: import.meta.env.VITE_WORKFLOW_SERVICE_PROD
    },
    vinayak_local: {
        baseUrl: import.meta.env.VITE_BASE_URL_DEV,
        nodeApiUrl: import.meta.env.VITE_NODE_URL_DEV,
        extractionServicePython: import.meta.env.VITE_EXTRACTION_SERVICE_PYTHON_DEV,
        chatbotServicePython: import.meta.env.VITE_CHATBOT_SERVICE_PYTHON_DEV,
        mlServiceNodejs: import.meta.env.VITE_AI_SERVICE_NODEJS_LOCAL,
        workflowService: import.meta.env.VITE_WORKFLOW_SERVICE_LOCAL,
        reconcillationService: import.meta.env.VITE_RECONCILLATION_SERVICE_LOCAL
    },
    vinayak_local_orient: {
        baseUrl: import.meta.env.VITE_BASE_URL_ORIENT_DEV,
        nodeApiUrl: import.meta.env.VITE_NODE_URL_ORIENT_DEV,
        extractionServicePython: import.meta.env.VITE_EXTRACTION_SERVICE_PYTHON_DEV,
        chatbotServicePython: import.meta.env.VITE_CHATBOT_SERVICE_PYTHON_DEV,
        mlServiceNodejs: import.meta.env.VITE_AI_SERVICE_NODEJS_LOCAL,
        workflowService: import.meta.env.VITE_WORKFLOW_SERVICE_LOCAL
    },
    rehab: {
        baseUrl: import.meta.env.VITE_BASE_URL_REHAB,
        nodeApiUrl: import.meta.env.VITE_NODE_URL_REHAB,
        extractionServicePython: import.meta.env.VITE_EXTRACTION_SERVICE_PYTHON_REHAB,
        chatbotServicePython: import.meta.env.VITE_CHATBOT_SERVICE_PYTHON_REHAB,
        mlServiceNodejs: import.meta.env.VITE_AI_SERVICE_NODEJS_REHAB
    },
    orientProduction: {
        baseUrl: import.meta.env.VITE_BASE_URL_ORIENT_PRODUCTION,
        nodeApiUrl: import.meta.env.VITE_NODE_URL_ORIENT_PRODUCTION,
        mlServiceNodejs: import.meta.env.VITE_AI_SERVICE_NODEJS_ORIENT_PRODUCTION,
        workflowService: import.meta.env.VITE_WORKFLOW_SERVICE_ORIENT_PRODUCTION,
        reconcillationService: import.meta.env.VITE_RECONCILLATION_SERVICE_ORIENT_PRODUCTION
    },
    orientDev: {
        baseUrl: import.meta.env.VITE_BASE_URL_ORIENT_DEV,
        nodeApiUrl: import.meta.env.VITE_NODE_URL_ORIENT_DEV,
        mlServiceNodejs: import.meta.env.VITE_AI_SERVICE_NODEJS_ORIENT_DEV,
        workflowService: import.meta.env.VITE_WORKFLOW_SERVICE_ORIENT_DEV,
        reconcillationService: import.meta.env.VITE_RECONCILLATION_SERVICE_ORIENT_DEV
    }
};
const envConfig: any = globalEnv[import.meta.env.VITE_NODE_ENV || ''];

export const config = {
    baseUrl: envConfig.baseUrl,
    nodeApiUrl: envConfig.nodeApiUrl,
    workflowService: envConfig.workflowService,
    extractionServicePython: envConfig.extractionServicePython,
    chatbotServicePython: envConfig.chatbotServicePython,
    mlServiceNodejs: envConfig.mlServiceNodejs,
    reconcillationService: envConfig.reconcillationService,
    azure: {
        tenantId: import.meta.env.VITE_AZURE_TENANT_ID,
        clientId: import.meta.env.VITE_AZURE_CLIENT_ID
    },
    google: {
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID
    },
    usePhpSessionApi: true, // Toggle to true to use check-session.php endpoint, false to use local strict timer
    sessionTTLSeconds: 1800, // Global timeout sync natively matching the Orient backend configs (30 mins)
    orientSessionApi: import.meta.env.VITE_ORIENT_SESSION_API
};
