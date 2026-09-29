import { useState } from 'react';
import { ResizableContainer } from '../../docsnap/template/update-template/components/ResizableContainer';
import { DocumentCreationEditorStateProvider } from './hooks/DocumentCreationEditorContext';
import { tabs } from './static-data/tabs';
import RightContainer from './right-container';
import PreviewComponent from './preview-container';
import { AnnotationLine, useAnnotationLine } from './components/AnnotationLine';

interface DocumentCreationIF {
    test?: string;
}

export interface Message {
    text: string;
    source?: string[];
    userMessage: boolean;
}

export interface DocumentCreationEditorStateIF {
    activeTab: string;
    formFields: any[];
    template: any;
    formValues: Record<string, any>;
    documentText: string;
    showFileInput: boolean;
    files: any[];
    loadingTemplate: boolean;
    formData: any;
    knowledgeBase: { name: string; fileName: string; documentText: string[]; imageFileNames: string[] }[];
    uploadingDocuments: string[];
    messages: Message[];
    chatLoading: boolean;
    applyingKnowledgeBase: boolean;
    activeId: string;
    showRichTextEditor: boolean;
    record: any;
}

const initialState: DocumentCreationEditorStateIF = {
    activeTab: tabs[0].id,
    formFields: [],
    template: null,
    formValues: {},
    documentText: '',
    showFileInput: false,
    files: [],
    loadingTemplate: false,
    formData: {},
    knowledgeBase: [],
    uploadingDocuments: [],
    messages: [],
    chatLoading: false,
    applyingKnowledgeBase: false,
    activeId: '',
    showRichTextEditor: false,
    record: null
};

const DocumentCreationEditor: React.FC<DocumentCreationIF> = () => {
    const [state, setState] = useState<DocumentCreationEditorStateIF>(initialState);
    const { sourceId, targetId, shouldRender } = useAnnotationLine(state.activeId);

    return (
        <DocumentCreationEditorStateProvider value={{ state, setState }}>
            <div className="flex flex-1 overflow-y-auto relative">
                <ResizableContainer
                    className="flex flex-1 overflow-y-auto"
                    left={<PreviewComponent />}
                    right={<RightContainer />}
                    initialLeftWidthPercent={55}
                    minLeftWidthPercent={30}
                    maxLeftWidthPercent={75}
                />
                {shouldRender && <AnnotationLine sourceId={sourceId} targetId={targetId} />}
            </div>
        </DocumentCreationEditorStateProvider>
    );
};

export default DocumentCreationEditor;
