import { Plus } from 'lucide-react';
import { Button } from '../../../../../components/Button';
import { DialogComponent } from '../../../../../components/DialogComponent';
import { useDocumentCreationEditorState } from '../../hooks/DocumentCreationEditorContext';
import GenericFileInput from '../../../../../components/DragAndDropFileInput';
import { SelectedFileList } from './SelectedFileList';

interface KnowledgeBaseIF {
    test?: string;
}

const KnowledgeBase: React.FC<KnowledgeBaseIF> = () => {
    const { state, setState } = useDocumentCreationEditorState();

    const handleFilesChange = (files: File[]) => {
        setState(prev => ({ ...prev, files: [...prev.files, ...files], showFileInput: false }));
    };

    return (
        <div className="w-full flex flex-col overflow-y-auto h-full">
            <SelectedFileList />
            <div className="flex w-full justify-end p-2">
                <Button className="w-full" startIcon={<Plus size={16} />} onClick={() => setState(prev => ({ ...prev, showFileInput: true }))}>
                    Add Knowledge Base
                </Button>
            </div>

            <DialogComponent
                className="flex max-h-[calc(100vh-200px)] min-h-[calc(100vh-200px)] w-[80vw] flex-col overflow-y-auto"
                name="Upload Documents"
                isOpen={state.showFileInput}
                closeDialog={() => setState(prev => ({ ...prev, showFileInput: false }))}
            >
                <div className="flex h-full w-full flex-1 flex-col overflow-y-auto p-10">
                    <GenericFileInput maxFiles={10} onFilesChange={handleFilesChange} />
                </div>
            </DialogComponent>
        </div>
    );
};

export default KnowledgeBase;

// ============================================================================================================
