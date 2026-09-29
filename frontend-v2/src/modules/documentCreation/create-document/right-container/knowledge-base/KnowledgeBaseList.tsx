import { Trash2 } from 'lucide-react';
import { useDocumentCreationEditorState } from '../../hooks/DocumentCreationEditorContext';

export const KnowledgeBaseList = () => {
    const { state, setState } = useDocumentCreationEditorState();

    return (
        <>
            {state.knowledgeBase.map((file: any, index: number) => (
                <div
                    key={index}
                    className="min-h-13 flex text-sm items-center gap-2 w-full justify-between px-6 py-2 bg-green-50 border border-green-500 rounded-md"
                >
                    <span className="truncate">{file.name}</span>
                    <span>{file.fileName}</span>
                    <div className="flex gap-4">
                        <Trash2
                            onClick={() => {
                                const updatedFiles = [...state.knowledgeBase];
                                updatedFiles.splice(index, 1);
                                setState(prev => ({ ...prev, knowledgeBase: updatedFiles }));
                            }}
                            className="w-4 h-4 hover:text-red-500 cursor-pointer"
                        />
                    </div>
                </div>
            ))}
        </>
    );
};
