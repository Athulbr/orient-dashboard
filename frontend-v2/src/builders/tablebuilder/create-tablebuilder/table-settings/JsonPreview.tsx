import { useTablebuilderSettings } from '../hooks/useTablebuilderSettingsContext';
import { Copy } from 'lucide-react';

export const JsonPreviewSection: React.FC = () => {
    const { settings } = useTablebuilderSettings();
    return (
        <div className="flex flex-col gap-6">
            <div className="relative">
                <button
                    className="absolute top-2 right-2 rounded bg-white p-1"
                    onClick={() => {
                        const json = JSON.stringify(settings, null, 2);
                        navigator.clipboard.writeText(json);
                        const icon = document.querySelector('.copy-icon');
                        icon?.classList.add('text-green-600');
                        setTimeout(() => {
                            icon?.classList.remove('text-green-600');
                        }, 2000);
                    }}
                >
                    <Copy size={16} className="copy-icon cursor-pointer text-blue-600" />
                </button>
                <pre className="max-h-80 overflow-auto rounded-lg bg-gray-100 p-3 text-xs text-gray-800">{JSON.stringify(settings, null, 2)}</pre>
            </div>
        </div>
    );
};
