import { Files } from 'lucide-react';
import { useState } from 'react';

interface ChatMessageIF {
    message: string;
    source?: string[];
    userMessage?: boolean;
}

export const ChatMessage: React.FC<ChatMessageIF> = ({ message, userMessage, source }) => {
    const [showSource, setShowSource] = useState(false);

    return (
        <div className="w-full">
            <div
                className={`${
                    userMessage
                        ? 'mb-2 ml-auto w-fit min-w-12 rounded-lg bg-gray-400 p-3 text-white'
                        : 'relative mr-auto mb-2 max-w-md rounded-lg bg-gray-100 p-3 text-gray-800'
                }`}
            >
                {!userMessage && (
                    <div className="absolute top-0 -left-10 flex h-8 w-8 items-center justify-center rounded-full bg-gray-600 text-sm font-semibold text-white">
                        P
                    </div>
                )}

                <div className="whitespace-pre-wrap">{message}</div>

                {!userMessage && (
                    <div className="relative mt-2">
                        <div
                            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors hover:bg-gray-200"
                            onClick={() => setShowSource(!showSource)}
                        >
                            <Files color="#9e9e9e" size={16} />
                        </div>

                        {source && showSource && (
                            <div className="absolute top-8 left-0 z-10 min-w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                                {source.map((link, index) => (
                                    <div key={index} className="mb-1 last:mb-0">
                                        <a
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            href={link}
                                            className="text-sm break-all text-gray-600 underline hover:text-gray-800"
                                        >
                                            {link}
                                        </a>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatMessage;
