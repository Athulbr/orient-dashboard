import ChatWithDocumentComponent from './ChatWithDocumentComponent';

interface ChatWithKnowledgeBaseIF {
    test?: string;
}

const ChatWithKnowledgeBase: React.FC<ChatWithKnowledgeBaseIF> = () => {
    return (
        <div className="w-full h-full flex flex-col overflow-y-auto ">
            <ChatWithDocumentComponent />
        </div>
    );
};

export default ChatWithKnowledgeBase;
