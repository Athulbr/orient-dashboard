import { useState } from 'react';
import { Send, X, Minimize2 } from 'lucide-react';
import httpRequest from '../../../../global-utils/httpRequest';
import { config } from '../../../../config/default';
import { generatePrompt } from './generatePrompt';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'bot';
    timestamp: Date;
}

interface ChatWindowIF {
    setRecords: (records: any[]) => void;
}

export const ChatWindow: React.FC<ChatWindowIF> = ({ setRecords }) => {
    const [messages, setMessages] = useState<Message[]>([{ id: '1', text: 'Hi! How can I help you today?', sender: 'bot', timestamp: new Date() }]);
    const [input, setInput] = useState('');
    const [isMinimized, setIsMinimized] = useState(false);

    const handleSend = async () => {
        if (!input.trim()) return;

        const prompt = generatePrompt(input);

        const response = await httpRequest('POST', `${config.mlServiceNodejs}/chatbot/generate-response`, { prompt });

        const module = sessionStorage.getItem('module');

        const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/history`, { ...response.data?.llmResponse, module });
        setRecords(res.data);
    };
    const handleSendDummy = () => {
        if (!input.trim()) return;

        const newMessage: Message = {
            id: Date.now().toString(),
            text: input,
            sender: 'user',
            timestamp: new Date()
        };

        setMessages([...messages, newMessage]);
        setInput('');

        setTimeout(() => {
            const botReply: Message = {
                id: (Date.now() + 1).toString(),
                text: 'Thanks for your message! This is a demo response.',
                sender: 'bot',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, botReply]);
        }, 500);
    };

    return (
        <div className="fixed bottom-5 right-5 w-100 bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-3 flex items-center justify-between">
                <h3 className="font-semibold">Chat Support</h3>
                <div className="flex gap-2">
                    <button onClick={() => setIsMinimized(!isMinimized)} className="hover:bg-white/20 rounded p-1 transition">
                        <Minimize2 size={16} />
                    </button>
                    <button className="hover:bg-white/20 rounded p-1 transition">
                        <X size={16} />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    {/* Messages */}
                    <div className="p-4 space-y-3 overflow-y-auto min-h-120 max-h-120 bg-gray-50">
                        {messages.map(msg => (
                            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`max-w-xs px-4 py-2 rounded-lg ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200 text-gray-800'}`}
                                >
                                    <p className="text-sm">{msg.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Input */}
                    <div className="p-3 bg-white border-t border-gray-200">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSend()}
                                placeholder="Type a message..."
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                            <button onClick={handleSend} className="bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600 transition">
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

// give me  last 5 days record
