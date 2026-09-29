import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AudioRecorder from './audioRecorder';
import ResponseViewer from './responseViewer/index';
import useTranscriptStore from '../../zustand-store/transcriptStore';
import PageContainer from '../../components/PageContainer';
import PageNameComponent from '../../components/PageName';
import { ResizableContainer } from '../docsnap/template/update-template/components/ResizableContainer';
import { Button } from '../../components/Button';
import { Upload, ArrowDownToLine } from 'lucide-react';
import { getCurrentDateTime } from '../../global-utils/convert-date-format';
import { useS3Storage } from '../../zustand-store/S3Storage';
import { useToastStore } from '../../components/toast/ToastStore';
import Spinner from '../../components/Spinner';
import { usePermissionStore } from '../../zustand-store/PermissionStore';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface PropsIF {
    update?: boolean;
}

interface TabIF {
    id?: string;
    title?: string;
}

interface TranscriptItem {
    filename: string;
    content: string;
}

type SourceType = 'text' | 'audio' | 'file';

const TranscriptProjectPage: React.FC<PropsIF> = ({ update }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [deleteAudio, setDeleteAudio] = useState(false);
    const [transcriptionData, setTranscriptionData] = useState<TranscriptItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [zipBlob, setZipBlob] = useState<Blob | null>(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const toast = useToastStore();
    const { id } = useParams();
    const { getS3File } = useS3Storage();
    const [sourceType, setSourceType] = useState<SourceType>('text');
    const [medicalText, setMedicalText] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const [disableExport, setDisableExport] = useState(false);
    const { updateTranscript, currentData, gettranscriptData, transcriptData } = useTranscriptStore();
    const userReadPermission = usePermissionStore.getState().permissions.includes('read:transcription');

    useEffect(() => {
        if (id) {
            gettranscriptData(id);
        }
    }, [id]);

    useEffect(() => {
        const getTranscriptFile = async () => {
            const awsS3Response: any = await getS3File(transcriptData?.transcriptedFile || '');
            const bufferData = new Uint8Array(awsS3Response.Body.data);
            // Create blob from buffer
            const blob = new Blob([bufferData], { type: 'application/zip' });
            setZipBlob(blob);
        };
        if (transcriptData && transcriptData?.transcriptions?.length > 0) {
            setTranscriptionData(transcriptData?.transcriptions || []);
            getTranscriptFile();
        }
    }, [transcriptData]);

    const clearData = () => {
        setTranscriptionData([]);
        setZipBlob(null);
        setDeleteAudio(true);
    };

    // const handleExport = () => {

    //     if (!zipBlob) return;
    //     const url = window.URL.createObjectURL(zipBlob);
    //     const a = document.createElement('a');
    //     a.href = url;
    //     a.download = `${getCurrentDateTime()}.zip`;
    //     document.body.appendChild(a);
    //     a.click();
    //     a.remove();
    //     window.URL.revokeObjectURL(url);
    // };

    const composeZipFile = async () => {
        if (!transcriptionData || transcriptionData.length === 0) return;
        const zip = new JSZip();
        transcriptionData.forEach(item => {
            zip.file(item.filename, item.content); // creates .txt file
        });
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `${getCurrentDateTime()}.zip`);
    };

    const handleSubmit = async (data?: TranscriptItem[]) => {
        setLoading(true);
        const recordId = id ? id : currentData?._id;
        if (recordId) {
            const payload: any = {
                name: currentData?.name,
                transcriptions: data ?? transcriptionData
            };
            if (sourceType === 'text') {
                payload.medicaltext = medicalText;
                payload.sourceType = 'text';
            }
            const res = await updateTranscript(payload, recordId);
            if (res) {
                toast.success('Transcript updated successfully');
                setDisableExport(false);
            }
        }
        setLoading(false);
    };

    const titleName = 'Audio';

    return (
        <>
            <PageContainer className="gap-4 p-2 md:p-6">
                <PageNameComponent
                    name={id ? 'Update Operating Notes' : 'Create Operating Notes'}
                    showBackButton={true}
                    customGoBackFunction={() => navigate('/transcript/record/list')}
                >
                    <Button startIcon={<ArrowDownToLine size={16} className="text-gray-500" />} outlined onClick={composeZipFile} disabled={disableExport}>
                        Export
                    </Button>
                </PageNameComponent>
                <div className="hidden md:block overflow-auto flex-col h-full  border-t">
                    <ResizableContainer
                        left={
                            <AudioRecorder
                                titleName={titleName}
                                setIsProcessing={setIsProcessing}
                                setZipBlob={setZipBlob}
                                setTranscriptionData={setTranscriptionData}
                                setError={setError}
                                deleteAudioTrack={deleteAudio}
                                disable={userReadPermission}
                                setMedicalText={setMedicalText}
                                setSource={setSourceType}
                            />
                        }
                        right={
                            <ResponseViewer
                                isProcessing={isProcessing}
                                transcriptionData={transcriptionData}
                                titleName={titleName}
                                disable={userReadPermission}
                                error={error}
                                clearData={clearData}
                                onSubmit={handleSubmit}
                                setTranscriptionData={setTranscriptionData}
                                setDisableExport={setDisableExport}
                            />
                        }
                        initialLeftWidthPercent={60}
                        minLeftWidthPercent={30}
                        maxLeftWidthPercent={70}
                    />
                </div>
                <div className="block md:hidden overflow-auto  flex-col h-full">
                    {showPreview ? (
                        <ResponseViewer
                            isProcessing={isProcessing}
                            transcriptionData={transcriptionData}
                            titleName={titleName}
                            error={error}
                            clearData={clearData}
                            onSubmit={handleSubmit}
                            setShowPreview={setShowPreview}
                            setTranscriptionData={setTranscriptionData}
                            setDisableExport={setDisableExport}
                        />
                    ) : (
                        <AudioRecorder
                            titleName={titleName}
                            setIsProcessing={setIsProcessing}
                            setTranscriptionData={setTranscriptionData}
                            setError={setError}
                            deleteAudioTrack={deleteAudio}
                            setMedicalText={setMedicalText}
                            setSource={setSourceType}
                            setShowPreview={setShowPreview}
                        />
                    )}
                </div>
            </PageContainer>
            {/* {loading && <Spinner />} */}
        </>
    );
};

export default TranscriptProjectPage;
