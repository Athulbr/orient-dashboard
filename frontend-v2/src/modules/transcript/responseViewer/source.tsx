import { AlertCircle, FileText } from 'lucide-react';
import Spinner from '../../../components/Spinner';

interface SourcePageProps {
    isProcessing: boolean;
    transcriptionData?: { content?: string; filename?: string };
    error?: string | null;
    value?: string;
    onChange?: (val: string) => void;
    disable?: boolean;
}

const SourcePage = ({ isProcessing, transcriptionData, error, value, onChange, disable }: SourcePageProps) => {
    const renderContent = () => {
        if (error) {
            return (
                <div className="flex w-full h-full flex-col items-center justify-center text-center p-6 gap-4">
                    <AlertCircle className="w-12 h-12 text-red-600" />
                    <h3 className="text-lg font-semibold text-red-600">Error</h3>
                    <p className="text-red-600">{error}</p>
                </div>
            );
        }

        if (isProcessing) {
            return (
                <div className="flex w-full h-full flex-col items-center justify-center text-center p-6 gap-4 animate-pulse">
                    <Spinner />
                    <h4 className="text-lg font-semibold text-gray-900">Processing</h4>
                    <p className="text-gray-500">Extracting text from your audio...</p>
                </div>
            );
        }

        if (!transcriptionData?.content && !value) {
            return (
                <div className="flex w-full h-full flex-col items-center justify-center gap-4 text-center p-6">
                    <FileText className="w-12 h-12 text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-900">No Transcription available yet.</h3>
                    <p className="text-gray-500">Record and upload audio to see the transcription here.</p>
                </div>
            );
        }

        return (
            <div className="flex flex-1 flex-col overflow-y-auto gap-4 p-2 w-full">
                <textarea
                    className="w-full border rounded-md flex-1 p-2"
                    value={value ?? transcriptionData?.content ?? ''}
                    onChange={e => onChange?.(e.target.value)}
                    placeholder="Edit source..."
                    disabled={disable}
                />
            </div>
        );
    };

    return renderContent();
};

export default SourcePage;
