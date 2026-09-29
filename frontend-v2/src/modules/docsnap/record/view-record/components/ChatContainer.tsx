import { ReactNode } from 'react';
import ScrollToBottom from 'react-scroll-to-bottom';

interface ChatContainerIF {
    children: ReactNode;
    showButtons?: boolean;
    name?: string;
}

export const ChatContainer: React.FC<ChatContainerIF> = ({ children, showButtons, name }) => {
    return (
        <ScrollToBottom className={`flex-1 flex-col overflow-y-auto px-5 pt-2 pb-8`}>
            <div className="my-5 flex w-full justify-center">
                <div className="flex flex-col items-center gap-0.5">
                    <div className="mb-1 flex h-[74px] w-[74px] items-center justify-center rounded-md bg-gray-300 text-[60px] font-bold text-white">P</div>
                    <div className="font-medium">{name || 'Chat with Document'}</div>
                    <div className="text-[12px] font-normal text-gray-400">Powered by makez.ai</div>
                    <div className="text-center text-sm font-normal text-gray-400">
                        A responsive assistant that expertly locates, extracts, and distills important content from your documents in real-time.
                    </div>
                </div>
            </div>
            {children}
        </ScrollToBottom>
    );
};
