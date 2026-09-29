export const llmModels = {
    openai: [
        { label: 'GPT-4o', value: 'gpt-4o' },
        { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
        { label: 'GPT-4 Turbo with Vision', value: 'gpt-4-turbo' },
        { label: 'GPT-4 Vision', value: 'gpt-4-vision-preview' },
        { label: 'GPT-4 Vision', value: 'gpt-4-vision' },
        { label: 'GPT-4 Turbo Vision Preview', value: 'gpt-4-1106-vision-preview' }
    ],
    gemini: [
        { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
        { label: 'Gemini Pro', value: 'gemini-pro' },
        { label: 'Gemini 1.0 Pro', value: 'gemini-1.0-pro' },
        { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
        { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
        { label: 'Gemini Pro', value: 'models/gemini-pro' }
    ]
};

export const llmProviders = [
    { label: 'Open AI', value: 'openai' },
    { label: 'Gemini', value: 'gemini' }
];
