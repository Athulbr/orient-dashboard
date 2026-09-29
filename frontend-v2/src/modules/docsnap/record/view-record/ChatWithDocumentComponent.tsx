import { Button } from '../../../../components/Button';
import { ChatContainer } from './components/ChatContainer';
import { ChatInput } from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import DotLoader from './components/dot-loader';
import { useViewRecordApi } from './hooks/useViewRecordApi';
import { useViewRecordState } from './hooks/viewRecordContext';
import { useNavigate } from 'react-router-dom';

interface ChatWithDocumentComponentIF {
    test?: string;
}

const ChatWithDocumentComponent: React.FC<ChatWithDocumentComponentIF> = () => {
    const { state, setState } = useViewRecordState();
    const { sendMessage, sendMessageToNode } = useViewRecordApi();
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
        if (state.templateSettings?.extractionEngine === 'node') {
            sendMessageToNode(message);
        } else {
            sendMessageToNode(message);
        }
    };
    const messages = state.messages;
    return (
        <div className="flex flex-1 flex-col overflow-hidden">
            <ChatContainer>
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
