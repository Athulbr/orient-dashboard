import { Mic, Plus, Send, SendHorizonal } from 'lucide-react';
import { useState } from 'react';

interface ChatInputProps {
    sendMessage: (message: string) => void;
}

export const ChatInput = ({ sendMessage }: ChatInputProps) => {
    const [input, setInput] = useState('');

    const handleSubmit = () => {
        if (input?.trim()) {
            sendMessage(input);
            setInput('');
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    };

    return (
        <div className="border-t border-gray-300 bg-white p-4">
            <div className="flex w-full items-center border border-gray-300">
                <div className="mx-2 flex h-10 w-10 cursor-pointer items-center justify-center border-r">
                    <Plus size={20} />
                </div>
                <input
                    placeholder="Message"
                    className="h-10 flex-1 bg-transparent px-2 outline-none"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                />
                <div className="mx-2 flex h-10 w-10 cursor-pointer items-center justify-center">
                    <Mic size={20} />
                </div>
                <div onClick={handleSubmit} className="flex h-10 w-10 cursor-pointer items-center justify-center bg-gray-200">
                    <SendHorizonal size={20} />
                </div>
            </div>
        </div>
    );
};
