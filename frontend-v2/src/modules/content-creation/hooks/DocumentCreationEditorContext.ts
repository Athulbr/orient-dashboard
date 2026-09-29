import { createContext, useContext } from 'react';
import type { ContentCreationEditorStateIF } from '../types';

const ContentCreationEditorContext = createContext<ContentCreationEditorContextIF | undefined>(undefined);
export const ContentCreationEditorStateProvider = ContentCreationEditorContext.Provider;

export const useContentCreationEditorState = () => {
    const context = useContext(ContentCreationEditorContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface ContentCreationEditorContextIF {
    state: ContentCreationEditorStateIF;
    setState: React.Dispatch<React.SetStateAction<ContentCreationEditorStateIF>>;
}
