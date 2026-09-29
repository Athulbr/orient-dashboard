import { useEffect, useState } from 'react';
import { FileText, ChevronRight } from 'lucide-react';
import { DialogComponent } from '../../../components/DialogComponent';
import { cn } from '../../../global-utils/twMerge';
import { useToastStore } from '../../../components/toast/ToastStore';
import Spinner from '../../../components/Spinner';

interface Page {
    pageNumber: number;
    s3ImageName: string;
}

interface Document {
    pages: Page[];
    documentNumber: string;
}

export type SegregatedData = Document[][];

interface SegregatedDocumentsProps {
    isOpen: boolean;
    closeDialog: () => void;
    onSubmit: (segregatedDocuments: SegregatedData) => void;
    selectedFiles: File[];
}

const fetchSegregatedDocuments = async (file: File): Promise<Document[]> => {
    const formData = new FormData();
    formData.append('file', file);

    const accessToken = window?.sessionStorage?.getItem('accessToken') || '';
    const selectedTenant = window?.sessionStorage?.getItem('selectedTenant') || '';
    const selectedModule = window?.sessionStorage?.getItem('module') || '';
    const selectedRole = window?.sessionStorage?.getItem('selectedRole') || '';

    const headers: HeadersInit = {
        tenantid: selectedTenant,
        roleid: selectedRole,
        module: selectedModule
    };

    if (accessToken) {
        headers.authorization = `Bearer ${JSON.parse(accessToken)}`;
    }

    const response = await fetch('http://localhost:6008/docsnap/segregate-documents', {
        method: 'POST',
        headers,
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Failed to segregate document: ${response.statusText}`);
    }

    const result = await response.json();
    return result.data?.segregatedDocuments;
};

export const SegregatedDocuments: React.FC<SegregatedDocumentsProps> = ({ isOpen, closeDialog, onSubmit, selectedFiles }) => {
    const toast = useToastStore();
    const [segregatedDocuments, setSegregatedDocuments] = useState<SegregatedData>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedPdfIndex, setSelectedPdfIndex] = useState(0);

    useEffect(() => {
        const fetchAll = async () => {
            setIsLoading(true);
            try {
                const results: SegregatedData = [];
                for (const file of selectedFiles) {
                    const docs = await fetchSegregatedDocuments(file);
                    results.push(docs);
                }
                setSegregatedDocuments(results);
            } catch (error: any) {
                toast.error(error.message || 'Failed to segregate documents');
            } finally {
                setIsLoading(false);
            }
        };
        if (selectedFiles.length > 0) {
            fetchAll();
        }
    }, [selectedFiles]);

    const selectedDocuments = segregatedDocuments[selectedPdfIndex] ?? [];

    console.log('segregatedDocuments:===========', segregatedDocuments);

    return (
        <DialogComponent
            name="Segregated Documents"
            className="max-h-[calc(100vh-200px)] min-h-[calc(100vh-200px)] w-[80vw]"
            isOpen={isOpen}
            closeDialog={closeDialog}
            primaryButtonText={segregatedDocuments.length > 0 ? 'Confirm' : ''}
            secondaryButtonText="Cancel"
            onPrimaryAction={() => onSubmit(segregatedDocuments)}
        >
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <div className="flex w-64 flex-shrink-0 flex-col border-r border-gray-200 bg-gray-50/50">
                    <div className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-500">PDF Files ({segregatedDocuments.length})</div>
                    <div className="flex-1 overflow-y-auto">
                        {segregatedDocuments.map((docs, index) => (
                            <button
                                key={index}
                                onClick={() => setSelectedPdfIndex(index)}
                                className={cn(
                                    'flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors',
                                    selectedPdfIndex === index ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                                )}
                            >
                                <FileText size={18} className="flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">File {index + 1}</div>
                                    <div className="text-xs text-gray-500">{docs.length} documents</div>
                                </div>
                                {selectedPdfIndex === index && <ChevronRight size={16} className="flex-shrink-0" />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500">
                            <Spinner size={18} /> Segregating documents...
                        </div>
                    ) : (
                        <>
                            <div className="mb-4 text-sm text-gray-500">
                                {selectedDocuments.length} documents found in File {selectedPdfIndex + 1}
                            </div>
                            <div className="flex flex-col gap-4">
                                {selectedDocuments.map((doc, docIndex) => (
                                    <div key={docIndex} className="rounded-lg border border-gray-200 bg-white p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <span className="text-sm font-semibold text-gray-800">#{doc.documentNumber}</span>
                                            <span className="text-xs text-gray-400">{doc.pages.length} pages</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {doc.pages.map(page => (
                                                <div
                                                    key={page.pageNumber}
                                                    className="flex h-20 w-16 items-center justify-center rounded border border-gray-200 bg-gray-50 text-xs text-gray-500"
                                                >
                                                    {page.pageNumber}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </DialogComponent>
    );
};
