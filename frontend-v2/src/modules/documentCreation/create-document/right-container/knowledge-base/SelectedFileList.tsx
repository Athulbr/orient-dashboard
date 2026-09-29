import { Trash2 } from 'lucide-react';
import { useDocumentCreationEditorState } from '../../hooks/DocumentCreationEditorContext';
import { Button } from '../../../../../components/Button';
import { KnowledgeBaseList } from './KnowledgeBaseList';
import { config } from '../../../../../config/default';

export const SelectedFileList = () => {
    const { state, setState } = useDocumentCreationEditorState();

    const extractTextFromKnowledgeBase = async (file: any) => {
        // if (true) {
        //     setState(prev => ({ ...prev, uploadingDocuments: [...prev.uploadingDocuments, file.name] }));
        //     await new Promise(res => setTimeout(res, 5000));
        //     setState(prev => ({
        //         ...prev,
        //         knowledgeBase: [...prev.knowledgeBase, { name: file.name, fileName: file.fileName, documentText: ['test'] }],
        //         uploadingDocuments: prev.uploadingDocuments.filter(doc => doc !== file.name),
        //         files: prev.files.filter(doc => doc.name !== file.name)
        //     }));
        //     return;
        // }

        setState(prev => ({ ...prev, uploadingDocuments: [...prev.uploadingDocuments, file.name] }));

        const token = window?.sessionStorage?.getItem('accessToken') || '';
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`${config.mlServiceNodejs}/document-generation/extract-document-text`, {
            method: 'POST',
            headers: { authorization: `Bearer ${JSON.parse(token)}` },
            body: formData
        });

        // Check response status
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const res = await response.json();
        const data = res.data;
        setState(prev => ({
            ...prev,
            knowledgeBase: [
                ...prev.knowledgeBase,
                { name: file.name, fileName: file.fileName, documentText: data?.documentText || [], imageFileNames: data?.imageFileNames || [] }
            ],
            uploadingDocuments: prev.uploadingDocuments.filter(doc => doc !== file.name),
            files: prev.files.filter(doc => doc.name !== file.name)
        }));
    };
    const uploadFileHandler = (files: any[]) => {
        files.forEach(file => {
            extractTextFromKnowledgeBase(file);
        });
    };

    return (
        <div className="p-4  flex flex-col h-full overflow-y-auto flex-1 gap-4 pb-20">
            <KnowledgeBaseList />
            {state.files.map((file: any, index: number) => (
                <div key={index} className="flex text-sm items-center gap-2 w-full justify-between px-6 py-2 bg-sky-50 border border-sky-500 rounded-md">
                    <span className="truncate">{file.name}</span>
                    <input
                        value={file.fileName}
                        onChange={e => {
                            const updatedFiles = [...state.files];
                            updatedFiles[index].fileName = e.target.value;
                            setState(prev => ({ ...prev, files: updatedFiles }));
                        }}
                        type="text"
                        placeholder="Enter document name"
                        className="text-xs flex-1 max-w-[250px] border py-2 px-4 bg-white rounded-md"
                    />
                    <div className="flex gap-4 items-center">
                        <span
                            onClick={() => uploadFileHandler([file])}
                            className="border px-3 bg-blue-100 cursor-pointer hover:bg-blue-300 py-1 text-xs rounded-md"
                        >
                            {state.uploadingDocuments.includes(file.name) ? 'Uploading...' : 'Upload'}
                        </span>
                        <Trash2
                            onClick={() => {
                                const updatedFiles = [...state.files];
                                updatedFiles.splice(index, 1);
                                setState(prev => ({ ...prev, files: updatedFiles }));
                            }}
                            className="w-4 h-4 hover:text-red-500 cursor-pointer"
                        />
                    </div>
                </div>
            ))}
            {state.files.length > 0 && (
                <span className="flex gap-4">
                    <Button onClick={() => uploadFileHandler(state.files)} className="w-full min-h-10">
                        {state.uploadingDocuments.length > 0 ? 'Uploading...' : 'Upload All'}
                    </Button>
                    <Button className="w-full min-h-10">Clear All</Button>
                </span>
            )}
        </div>
    );
};
