import { useEffect } from 'react';
import { Button } from '../../../../components/Button';
import { useNavigate } from 'react-router-dom';
import { useDocumentCreationEditorState } from '../hooks/DocumentCreationEditorContext';
import { useDocumentCreationEditorApi } from '../hooks/useDocumentCreationEditorApi';
import { ChatContainer } from '../../../docsnap/record/view-record/components/ChatContainer';
import ChatMessage from '../../../docsnap/record/view-record/components/ChatMessage';
import { ChatInput } from '../../../docsnap/record/view-record/components/ChatInput';
import DotLoader from '../../../docsnap/record/view-record/components/dot-loader';

interface ChatWithDocumentComponentIF {
    test?: string;
}

const ChatWithDocumentComponent: React.FC<ChatWithDocumentComponentIF> = () => {
    const { state, setState } = useDocumentCreationEditorState();
    const { sendMessageToNode } = useDocumentCreationEditorApi();
    const navigate = useNavigate();

    const sendMessageHandler = async (message: string) => {
        if (message.trim() === '') return;
        setState(prev => ({ ...prev, chatLoading: true, messages: [...prev.messages, { text: message, userMessage: true }] }));

        const normalizedMessage = message.trim().toLowerCase();
        if (normalizedMessage === 'hi' || normalizedMessage === 'hello') {
            await new Promise(resolve =>
                setTimeout(() => {
                    setState(prev => ({
                        ...prev,
                        messages: [...prev.messages, { text: 'Hello! Ask me anything about this document.', userMessage: false }]
                    }));
                    resolve(true);
                }, 2000)
            );
            return;
        }
        sendMessageToNode(message);
    };
    const messages = state.messages;
    return (
        <div className="flex flex-1 flex-col overflow-hidden">
            <ChatContainer name="Chat with Knowledge Base">
                {state.messages.map((message, index) => (
                    <ChatMessage key={index} message={message.text} userMessage={message.userMessage} source={message.source} />
                ))}
                {messages[messages.length - 1]?.userMessage && state.chatLoading && <DotLoader />}
            </ChatContainer>
            <ChatInput sendMessage={sendMessageHandler} />
            <div className="flex items-center justify-end gap-2 border-t bg-white p-2">
                <Button onClick={() => navigate('/docsnap/record/list')} outlined small>
                    Cancel
                </Button>
            </div>
        </div>
    );
};

export default ChatWithDocumentComponent;
