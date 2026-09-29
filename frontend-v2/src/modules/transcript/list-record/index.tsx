import { useState } from 'react';
import { ListRecordPageStateProvider } from './hooks/listRecordPageContext';
import { ListRecordComponent } from './ListRecordComponent';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageContainer from '../../../components/PageContainer';
import PageNameComponent from '../../../components/PageName';
import { Button } from '../../../components/Button';
import { UseFormbuilder } from '../../../builders/formbuilder/use-formbuilder';
import useTranscriptStore from '../../../zustand-store/transcriptStore';
import { PromptFieldIF } from '../../docsnap/prompt-tuning/interface';
interface Project {
    _id: string;
    name: string;
}
interface Document {
    _id: string;
    name: string;
    fields: PromptFieldIF[];
    docType: string;
    primaryModel: string;
    enableOcr: boolean;
}

export interface ListRecordPageStateIF {
    refresh: number;
    fileUploadDialog: boolean;
    loadingProjects: boolean;
    loadingDocuments: boolean;
    projects: Project[];
    projectId: string;
    documents: Document[];
    document: Document | null;
    processing: boolean;
    uploading: boolean;
    analyzing: boolean;
    uploadDone: boolean;
    analyzeDone: boolean;
    dealerSelectionDialog: boolean;
    query: any;
}

const initialState = {
    refresh: 1,
    loadingProjects: false,
    loadingDocuments: false,
    projects: [],
    projectId: '',
    documents: [],
    document: null,
    fileUploadDialog: false,
    processing: false,
    uploading: false,
    analyzing: false,
    uploadDone: false,
    analyzeDone: false,
    dealerSelectionDialog: false,
    query: {}
};

const ListRecordPage: React.FC = () => {
    const [state, setState] = useState<ListRecordPageStateIF>(initialState);
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [submit, setSubmit] = useState(false);
    const { createTranscript, loading } = useTranscriptStore();

    const onSubmit = async (values: any) => {
        setSubmit(false);
        const payload = { name: values?.patientName, patientId: values?.patientId };
        const result = await createTranscript(payload);
        if (result) {
            navigate('/transcript/record/create');
        }
    };

    return (
        <ListRecordPageStateProvider value={{ state, setState }}>
            <PageContainer className="gap-4 p-6">
                {/* <Breadcrumbs page="listTranscripts" /> */}
                <PageNameComponent name={`List of Transcripts`}>
                    <Button outlined onClick={() => setSubmit(true)}>
                        Create Patient Record
                    </Button>
                </PageNameComponent>
                <ListRecordComponent />
                {submit && (
                    <UseFormbuilder
                        title="Transcription"
                        isOpen={true}
                        className="w-[40vw]"
                        name="Transcription"
                        closeDialog={() => setSubmit(false)}
                        onSubmit={(values: any) => onSubmit(values)}
                        loadingPrimaryButton={loading}
                    />
                )}
            </PageContainer>
        </ListRecordPageStateProvider>
    );
};

export default ListRecordPage;
