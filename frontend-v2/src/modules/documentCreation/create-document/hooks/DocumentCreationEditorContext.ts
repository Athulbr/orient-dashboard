import { createContext, useContext } from 'react';
import { DocumentCreationEditorStateIF } from '..';

const DocumentCreationEditorContext = createContext<DocumentCreationEditorContextIF | undefined>(undefined);
export const DocumentCreationEditorStateProvider = DocumentCreationEditorContext.Provider;

export const useDocumentCreationEditorState = () => {
    const context = useContext(DocumentCreationEditorContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

interface DocumentCreationEditorContextIF {
    state: DocumentCreationEditorStateIF;
    setState: React.Dispatch<React.SetStateAction<DocumentCreationEditorStateIF>>;
}
