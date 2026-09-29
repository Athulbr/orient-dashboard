import { useState, useRef, useEffect } from 'react';
import { Bot, Send, User, X } from 'lucide-react';
import styles from './chatbot.module.css';
import { useFormBuilder } from '../../create-form/formbuilder-context/useFormBuilder';

interface Message {
    id: number;
    text: string;
    isUser: boolean;
}
interface ChatbotPropsIF {
    chatLoading: boolean;
    messages: Message[];
    hideChatbot: () => void;
    handleSendPrompt: (prompt: string) => void;
}

interface Position {
    x: number;
    y: number;
}

export const Chatbot: React.FC<ChatbotPropsIF> = ({ hideChatbot, messages, handleSendPrompt, chatLoading }) => {
    const { setFields } = useFormBuilder();
    const [showScrollButton, setShowScrollButton] = useState(false);

    const [input, setInput] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
    const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });

    const chatRef = useRef<HTMLDivElement>(null);
    const messageContainerRef = useRef<HTMLDivElement>(null);
    const messageEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging && chatRef.current) {
                const deltaX = e.clientX - dragStart.x;
                const deltaY = e.clientY - dragStart.y;
                setPosition({ x: deltaX, y: deltaY });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStart]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (chatRef.current) {
            const rect = chatRef.current.getBoundingClientRect();
            setIsDragging(true);
            setDragStart({
                x: e.clientX - position.x,
                y: e.clientY - position.y
            });
        }
    };
    const scrollToBottom = () => {
        messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        const container = messageContainerRef.current;
        if (!container) return;

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
            setShowScrollButton(!isAtBottom);
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        if (!showScrollButton) {
            messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, chatLoading, showScrollButton]);

    const handleSend = () => {
        if (!input?.trim()) return;
        handleSendPrompt(input);
        setInput('');
    };
    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div
            ref={chatRef}
            className={styles.chatContainer}
            style={{
                transform: `translate(${position.x}px, ${position.y}px)`
            }}
        >
            <div className={styles.header} onMouseDown={handleMouseDown}>
                <div className={styles.headerTitle}>
                    <Bot size={20} />
                    <span> Formbuilder Chat Assistant</span>
                </div>
                <button onClick={hideChatbot} className={styles.closeButton}>
                    <X size={20} />
                </button>
            </div>

            <div ref={messageContainerRef} className={styles.messageContainer}>
                {messages.map(message => (
                    <div key={message.id} className={`${styles.message} ${message.isUser ? styles.userMessage : styles.botMessage}`}>
                        <div className={`${styles.avatar} ${message.isUser ? styles.userAvatar : styles.botAvatar}`}>
                            {message.isUser ? <User size={16} /> : <Bot size={16} />}
                        </div>
                        <div className={`${styles.messageContent} ${message.isUser ? styles.userMessageContent : styles.botMessageContent}`}>
                            {message.text}
                        </div>
                    </div>
                ))}

                {chatLoading && (
                    <div className={`${styles.message} ${styles.botMessage}`}>
                        <div className={`${styles.avatar} ${styles.botAvatar}`}>
                            <Bot size={16} />
                        </div>
                        <div className={styles.loadingIndicator}>
                            <div className={styles.loadingDot}></div>
                            <div className={styles.loadingDot}></div>
                            <div className={styles.loadingDot}></div>
                        </div>
                    </div>
                )}
                <div ref={messageEndRef} />
            </div>

            <div className={styles.inputContainer}>
                <div className={styles.inputWrapper}>
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Type your message..."
                        className={styles.input}
                    />
                    <button onClick={handleSend} className={styles.sendButton} disabled={!input?.trim()}>
                        <Send size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
};
