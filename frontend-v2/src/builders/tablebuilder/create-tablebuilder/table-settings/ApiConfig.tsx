import { useTablebuilderSettings } from '../hooks/useTablebuilderSettingsContext';
import { CheckboxTB } from '../tablebuilder-components/CheckboxTB';
import { CheckboxGroupTB } from '../tablebuilder-components/CheckboxGroupTB';
import { FileInput } from 'lucide-react';
import { TextFieldTB } from '../tablebuilder-components/TextFieldTB';

export const ApiConfigSection: React.FC = () => {
    const { settings, setSettings } = useTablebuilderSettings();
    const { api } = settings;

    return (
        <div className="flex flex-col gap-6">
            <CheckboxTB
                id="APIConfig"
                label="Get URL from environment"
                checked={settings.api.getUrlFromEnv}
                onChange={e => setSettings(prev => ({ ...prev, api: { ...prev.api, getUrlFromEnv: e.target.checked } }))}
                icon={FileInput}
            />

            {api.getUrlFromEnv && (
                <TextFieldTB
                    label="Environment Variable"
                    onChange={e => setSettings(prev => ({ ...prev, api: { ...prev.api, envVariable: e.target.value } }))}
                    value={api.envVariable}
                />
            )}
            {!api.getUrlFromEnv && (
                <TextFieldTB label="API URL" onChange={e => setSettings(prev => ({ ...prev, api: { ...prev.api, url: e.target.value } }))} value={api.url} />
            )}
            <TextFieldTB
                label="API Endpoint"
                onChange={e => setSettings(prev => ({ ...prev, api: { ...prev.api, endPoint: e.target.value } }))}
                value={api.endPoint}
            />
            <button
                onClick={() => setSettings(prev => ({ ...prev, api: { ...prev.api, refresh: Math.random() } }))}
                className="flex cursor-pointer items-center justify-center rounded-md bg-blue-500 p-1 px-4 text-white hover:bg-blue-600"
            >
                Update
            </button>
        </div>
    );
};
