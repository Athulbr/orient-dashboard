import { Loader } from 'lucide-react';
import { useState } from 'react';
import httpRequest from '../../render-tablebuilder/utils/HttpRequest';
import { safeJsonParse } from '../utils/safeParseJson';
import { useTablebuilderSettings } from '../hooks/useTablebuilderSettingsContext';
import { TablebuilderSettingsIF } from '../../render-tablebuilder/interface';
import { config } from '../../../../config/default';

export const TablebuilderBot = () => {
    const { setSettings } = useTablebuilderSettings();

    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSendPrompt = async () => {
        if (!input) return;
        setLoading(true);
        try {
            const response = await httpRequest('POST', `${config.nodeApiUrl}/generate-table-settings`, { prompt });
            const parsedJson: any = safeJsonParse(response.data);

            if (!parsedJson) {
                throw new Error('Failed to parse AI response');
            }
            const finalData: TablebuilderSettingsIF = parsedJson;
            setSettings(finalData);
        } catch (error) {
            console.error('Error in sendPrompt:', error);
        } finally {
            setLoading(false);
        }
    };
    return (
        <>
            <div className="flex flex-col gap-2">
                <textarea
                    className="rounded border p-3 text-sm outline-none"
                    placeholder="Write Prompt Here..."
                    rows={10}
                    data-gramm="false"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                />
                <div className="flex w-full gap-2">
                    <button
                        onClick={() => setInput('')}
                        className="bg-white-500 flex flex-1 cursor-pointer items-center justify-center rounded-md border p-1 hover:bg-gray-100"
                    >
                        Clear
                    </button>
                    <button
                        onClick={handleSendPrompt}
                        className="flex flex-1 cursor-pointer items-center justify-center rounded-md bg-blue-500 p-1 text-white hover:bg-blue-600"
                    >
                        {loading ? <Loader size={20} className="ml-2 animate-spin" /> : 'Generate'}
                    </button>
                </div>
            </div>
        </>
    );
};
