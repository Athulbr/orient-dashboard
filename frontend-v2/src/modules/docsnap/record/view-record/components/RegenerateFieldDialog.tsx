// import { DialogComponent } from "../../../../../components/DialogComponent";

//  interface RegenerateFieldDialogIF{
// test?: string;
// }

// const RegenerateFieldDialog:React.FC<RegenerateFieldDialogIF> = () => {
//   return (
//     <DialogComponent isOpen className="h-[100vh] w-[50vw] max-h-[100vh]" layerClassName="justify-start p-0 pl-2 bg-[#00000032]">

//     </DialogComponent>
//   );
// };

// export default RegenerateFieldDialog;

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User } from 'lucide-react';
import { DialogComponent } from '../../../../../components/DialogComponent';
import { useViewRecordState } from '../hooks/viewRecordContext';
import { useViewRecordApi } from '../hooks/useViewRecordApi';
import { cn } from '../../../../../global-utils/twMerge';

interface Message {
    id: string;
    text: string;
    isUser: boolean;
    timestamp: Date;
    error?: boolean;
}

interface RegenerateFieldDialogIF {
    test?: string;
}

const RegenerateFieldDialog: React.FC<RegenerateFieldDialogIF> = () => {
    const { state, setState } = useViewRecordState();
    const { sendRegenerateMessage } = useViewRecordApi();
    console.log('state:===========', state);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            text: `Hello! I\'m your AI assistant.
      Your existing field value is "${state.showRegenerateFieldDialog?.value}".
      Do you want me to regenerate it?`,
            isUser: false,
            timestamp: new Date()
        }
    ]);
    const [inputValue, setInputValue] = useState('Yes');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = async () => {
        if (!inputValue.trim()) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            text: inputValue.trim(),
            isUser: true,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsTyping(true);

        const chatList = [...messages, userMessage];
        const response: any = await sendRegenerateMessage({
            context: {
                ...state.record?.extractedData?.product_information,
                ...state.record?.extractedData?.descriptions_and_benefits,
                ...state.record?.extractedData?.product_specifications
            },
            chatList,
            userQuery: inputValue,
            fieldLabel: state.showRegenerateFieldDialog?.fieldLabel,
            innerText: state.inputText || ''
        });
        if (!response) {
            setIsTyping(false);
            const aiMessage: Message = {
                error: true,
                id: Date.now().toString(),
                text: 'Something went wrong',
                isUser: false,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, aiMessage]);
            return;
        }
        const aiMessage: Message = {
            id: Date.now().toString(),
            text: response.data?.answer,
            isUser: false,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMessage]);
        setIsTyping(false);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const chooseResponseHandler = (choosedValue: string) => {
        setState(prev => ({
            ...prev,
            objectFields: {
                ...prev.objectFields,
                [state.showRegenerateFieldDialog?.key]: {
                    ...prev.objectFields[state.showRegenerateFieldDialog?.key],
                    [state.showRegenerateFieldDialog?.subKey]: {
                        ...prev.objectFields[state.showRegenerateFieldDialog?.key][state.showRegenerateFieldDialog?.subKey],
                        value: choosedValue
                    }
                }
            },
            showRegenerateFieldDialog: false
        }));
    };

    return (
        <DialogComponent
            isOpen
            className="h-[100vh] w-[50vw] max-h-[100vh]"
            layerClassName="justify-start p-0 pl-3 bg-[#00000032]"
            closeDialog={() => setState(prev => ({ ...prev, showRegenerateFieldDialog: false }))}
        >
            <div className="h-full w-full flex flex-col bg-white rounded-lg shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                    <div className="flex items-center space-x-2">
                        <Bot className="w-6 h-6 text-blue-600" />
                        <h2 className="text-lg font-semibold text-gray-800">AI Assistant</h2>
                    </div>
                    <div className="text-sm text-gray-500">{messages.length - 1} messages</div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                    {messages.map((message, index) => (
                        <div key={message.id} className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}>
                            <div className={`flex max-w-[80%] ${message.isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                                {/* Avatar */}
                                <div
                                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                        message.isUser ? 'bg-blue-600 text-white ml-3' : 'bg-gray-300 text-gray-600 mr-3'
                                    }`}
                                >
                                    {message.isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                                </div>

                                {/* Message Bubble */}
                                <div
                                    className={cn(
                                        'rounded-lg px-4 py-2',
                                        message.isUser ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-gray-800 rounded-bl-sm shadow-sm border',
                                        message.error && 'text-red-500 border border-red-500'
                                    )}
                                >
                                    <p className="font-sans leading-relaxed">{message.text}</p>
                                    <div className={`text-xs mt-1 w-full  flex justify-between ${message.isUser ? 'text-blue-100' : 'text-gray-400'}`}>
                                        {message.timestamp.toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                        {!message.isUser && !message.error && index > 0 && (
                                            <div
                                                onClick={() => chooseResponseHandler(message.text)}
                                                className="border border-gray-300 rounded-lg px-2 py-1 hover:bg-gray-100 cursor-pointer hover:text-blue-600"
                                            >
                                                Choose this response
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Typing Indicator */}
                    {isTyping && (
                        <div className="flex justify-start">
                            <div className="flex flex-row max-w-[80%]">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-300 text-gray-600 mr-3 flex items-center justify-center">
                                    <Bot className="w-4 h-4" />
                                </div>
                                <div className="bg-white text-gray-800 rounded-lg rounded-bl-sm shadow-sm border px-4 py-2">
                                    <div className="flex space-x-1">
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="border-t border-gray-200 p-4 bg-white rounded-b-lg">
                    <div className="flex items-end space-x-2">
                        <div className="flex-1">
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="Type your message here..."
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                                disabled={isTyping}
                            />
                        </div>
                        <button
                            onClick={handleSendMessage}
                            disabled={!inputValue.trim() || isTyping}
                            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="text-xs text-gray-500 mt-2 text-center">Press Enter to send, Shift+Enter for new line</div>
                </div>
            </div>
        </DialogComponent>
    );
};

export default RegenerateFieldDialog;
