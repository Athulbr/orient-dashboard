import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Mic, FileUp, Play, Pause, Square, Upload, Trash2 } from 'lucide-react';
import AudioWaveform from './audioWave';
import { getCurrentDateTime } from '../../global-utils/convert-date-format';
import { processZipResponse } from '../../global-utils/zipHandler';
import useTranscriptStore from '../../zustand-store/transcriptStore';
import httpUploadRequest from '../../global-utils/httpUploadRequest';
import { Button } from '../../components/Button';
import { config } from '../../config/default';

interface AudioRecorderProps {
    setIsProcessing?: (val: boolean) => void;
    setTranscriptionData?: (data: any) => void;
    setZipBlob?: (blob: Blob | null) => void;
    titleName: string;
    setError?: (val: string | null) => void;
    deleteAudioTrack?: boolean;
    disable?: boolean;
    setMedicalText: (val: string) => void;
    setSource: (val: SourceType) => void;
    setShowPreview?: (value: boolean) => void;
}

type SourceType = 'text' | 'audio' | 'file';

const AudioRecorder = ({
    setIsProcessing,
    setTranscriptionData,
    setZipBlob,
    titleName,
    setError,
    deleteAudioTrack,
    disable,
    setMedicalText,
    setSource,
    setShowPreview
}: AudioRecorderProps) => {
    const [isRecording, setIsRecording] = useState(false);
    const [voiceRecording, setVoiceRecording] = useState(false);
    const [fileUpload, setFileUpload] = useState(false);
    const [isRecordingStop, setIsRecordingStop] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [exit, setExit] = useState(false);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [transcription, setTranscription] = useState<any[]>([]);
    const [clicked, setClicked] = useState(false);
    const navigate = useNavigate();
    const { uploadAudio, uploadText, updateTranscript, currentData, transcriptData } = useTranscriptStore();
    const { id } = useParams();
    const [uploadedContent, setUploadedContent] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [sourceType, setSourceType] = useState<any>('text');
    const [textInput, setTextInput] = useState('');
    const [file, setFile] = useState<File | null>(null);

    useEffect(() => {
        if (deleteAudioTrack) deleteAudio();
    }, [deleteAudioTrack]);

    useEffect(() => {
        return () => {
            if (timerRef.current) window.clearInterval(timerRef.current);
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        };
    }, []);

    useEffect(() => {
        if (transcriptData && id) {
            if (transcriptData?.medicalText) setTextInput(transcriptData?.medicalText);
            if (transcriptData?.sourceType) setSourceType(transcriptData?.sourceType);
        }
    }, [transcriptData, id]);

    const handleText = async () => {
        if (!textInput.trim()) {
            setError?.('Please type something to upload.');
            return;
        }
        setIsProcessing?.(true);
        setSource('text');
        setMedicalText(textInput);

        try {
            const payload = { medical_text: textInput };
            const response: any = await uploadText(payload);

            if (response) {
                const transcriptedFile = new File([response], `transcriptedFile_${currentData?.patientId}_${getCurrentDateTime()}.zip`, {
                    type: 'application/zip'
                });
                Promise.all([processZipResponse(response), uploadFileToS3(transcriptedFile)]).then(([transcriptions, transcriptedFileResponse]) => {
                    setTranscriptionData?.(transcriptions);
                    const payload = { medicalText: textInput, sourceType: 'text', transcriptions, transcriptedFile: transcriptedFileResponse?.data?.fileName };
                    if (currentData?._id) updateTranscript(payload, currentData._id);

                    const zipBlob = new Blob([response], { type: 'application/zip' });
                    setZipBlob?.(zipBlob);
                });
            }
        } catch (err) {
            console.error(err);
            setError?.('Failed to process text.');
            setTranscriptionData?.([]);
        } finally {
            setIsProcessing?.(false);
        }
    };

    const startRecording = async () => {
        try {
            setAudioBlob(null);
            setError?.(null);
            audioChunksRef.current = [];
            setVoiceRecording(true);

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
                setAudioBlob(audioBlob);
                stream.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            };

            mediaRecorder.start();
            setIsRecording(true);
            setIsPaused(false);
            setRecordingTime(0);
            timerRef.current = window.setInterval(() => setRecordingTime(p => p + 1), 1000);
        } catch (err) {
            setError?.('Could not access microphone. Please ensure permissions are granted.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecordingStop(true);
            setIsRecording(false);
            setIsPaused(false);
            setRecordingTime(0);
            if (timerRef.current) window.clearInterval(timerRef.current);
        }
    };

    const togglePause = () => {
        if (mediaRecorderRef.current && isRecording) {
            if (isPaused) {
                mediaRecorderRef.current.resume();
                timerRef.current = window.setInterval(() => setRecordingTime(p => p + 1), 1000);
            } else {
                mediaRecorderRef.current.pause();
                if (timerRef.current) window.clearInterval(timerRef.current);
            }
            setIsPaused(!isPaused);
        }
    };

    const uploadAudioFile = () => fileInputRef.current?.click();
    const handleFileDrop = async (files: FileList) => {
        setAudioBlob(null);
        setError?.(null);
        audioChunksRef.current = [];
        if (files?.[0].type.startsWith('audio/')) {
            setFileUpload(true);
            setAudioBlob(files?.[0]);
        } else {
            setFile(files?.[0]);
        }
        const text = await files?.[0].text();
        setUploadedContent(text);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            setAudioBlob(null);
            setError?.(null);
            audioChunksRef.current = [];
            if (files?.[0].type.startsWith('audio/')) {
                setFileUpload(true);
                setAudioBlob(files?.[0]);
            } else {
                setFile(files?.[0]);
            }
        }
    };

    const uploadFileToS3 = async (file: File) => {
        try {
            return await httpUploadRequest(`${config.nodeApiUrl}/idp/document/upload`, file);
        } catch (err) {
            console.error('Error:', err);
        }
    };

    const handleUpload = async () => {
        if (!audioBlob && !file) return setError?.('No audio file to upload.');

        try {
            setIsUploading(true);
            setIsProcessing?.(true);
            setError?.(null);

            const fd = new FormData();
            if (audioBlob) fd.append('file', audioBlob, 'recording.m4a');
            if (!audioBlob && file) fd.append('file', file, file.name);
            const response: any = await uploadAudio(fd, `${file ? 'text' : 'audio'}`);

            setSource('audio');

            if (response) {
                const transcriptions = await processZipResponse(response);
                setTranscriptionData?.(transcriptions);
                setTranscription(transcriptions);

                const blob = new Blob([response], { type: 'application/zip' });
                setZipBlob?.(blob);

                const transcriptedFile = new File([response], `transcriptedFile_${currentData?.patientId}_${getCurrentDateTime()}.zip`, {
                    type: 'application/zip'
                });
                const transcriptedFileResponse = await uploadFileToS3(transcriptedFile); // This is for export

                const fileToUpload = audioBlob ? new File([audioBlob], `audio-${getCurrentDateTime()}.m4a`, { type: 'audio/m4a' }) : file;
                if (!fileToUpload) {
                    throw new Error('No audio file available to upload');
                }
                const result = await uploadFileToS3(fileToUpload);

                const payload = {
                    sourceFile: result?.data?.fileName,
                    sourceType: 'audio',
                    transcriptions,
                    transcriptedFile: transcriptedFileResponse?.data?.fileName
                };
                if (currentData?._id) updateTranscript(payload, currentData._id);
            }
        } catch (err) {
            setError?.('Failed to process audio. Try again.');
            setTranscriptionData?.([]);
        } finally {
            setIsUploading(false);
            setIsProcessing?.(false);
        }
    };

    const formatTime = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

    const deleteAudio = () => {
        setRecordingTime(0);
        setAudioBlob(null);
        setClicked(false);
        setVoiceRecording(false);
        setIsRecordingStop(false);
        setFileUpload(false);
    };

    const handleArrowDownClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileUpload = async (event: any) => {
        const file = event.target.files[0];
        if (!file) return;

        if (file.name.endsWith('.txt')) {
            // Handle text file
            const text = await file.text();
            setTextInput(text); // Update textarea
        } else if (file.name.endsWith('.docx')) {
            // Handle docx file
            const reader = new FileReader();
            reader.onload = async (e: any) => {
                const arrayBuffer = e.target.result;
                // Use docx.js or mammoth.js in the browser to parse docx
                const mammoth = await import('mammoth');
                const { value } = await mammoth.extractRawText({ arrayBuffer });
                setTextInput(value);
            };
            reader.readAsArrayBuffer(file);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex p-4 justify-between">
                <div className="flex gap-2">
                    <label className="flex items-center gap-2">
                        <input type="radio" value="text" checked={sourceType === 'text'} onChange={() => setSourceType('text')} />
                        Text
                    </label>
                    <label className="flex items-center gap-2">
                        <input type="radio" value="audio" checked={sourceType === 'audio'} onChange={() => setSourceType('audio')} />
                        Audio
                    </label>
                </div>
                <Button outlined onClick={() => setShowPreview?.(true)} className="md:hidden">
                    View Result
                </Button>
            </div>
            <div className="flex flex-col justify-center overflow-y-auto flex-1">
                {/* {sourceType === 'text' && (
                    <>
                        <div className="flex justify-end px-5">
                            <Upload size={24} className="text-gray-500" onClick={handleArrowDownClick} />
                        </div>
                        <input type="file" accept=".txt,.docx" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
                    </>
                )} */}
                {sourceType === 'text' && (
                    <div className={`flex flex-1 flex-col overflow-y-auto gap-4 p-2 ${disable ? 'pointer-events-none opacity-50' : ''}`}>
                        <textarea
                            className="w-full border rounded-md flex-1 p-2"
                            placeholder="Type your text here..."
                            value={textInput}
                            onChange={e => setTextInput(e.target.value)}
                        />
                        <div className={`flex gap-2 justify-center`}>
                            <Button onClick={handleArrowDownClick} className="Primary text-white">
                                Upload Text File
                            </Button>
                            <input ref={fileInputRef} type="file" accept=".txt,.docx" onChange={handleFileUpload} className="hidden" />
                            <Button onClick={handleText} className="Primary text-white">
                                Send Text
                            </Button>
                        </div>
                    </div>
                )}

                {sourceType === 'audio' && (
                    <div className={` flex flex-col items-center justify-center flex-grow gap-4 p-2 ${disable ? 'pointer-events-none opacity-50' : ''}`}>
                        <div className="w-full h-32 bg-gray-100 rounded-md overflow-hidden">
                            <AudioWaveform isRecording={isRecording && !isPaused} />
                        </div>
                        <div className="text-xl font-mono text-gray-700">{formatTime(recordingTime)}</div>

                        {/*  Buttons */}
                        <div className="flex justify-center gap-4 flex-wrap">
                            {!isRecording ? (
                                <>
                                    <Button
                                        onClick={startRecording}
                                        disabled={isRecordingStop}
                                        className="flex items-center text-nowrap gap-2 px-6 py-3 text-white bg-gray-700 rounded-full hover:bg-gray-800 disabled:opacity-50"
                                    >
                                        <Mic className="w-5 h-5" /> Start Recording
                                    </Button>

                                    <Button
                                        onClick={uploadAudioFile}
                                        disabled={isUploading}
                                        className="flex text-nowrap items-center gap-2 px-6 py-3 text-white bg-gray-700 rounded-full hover:bg-gray-800 disabled:opacity-50"
                                    >
                                        <FileUp className="w-5 h-5" /> Choose File
                                    </Button>
                                    <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
                                </>
                            ) : (
                                <>
                                    <Button
                                        onClick={togglePause}
                                        className="flex items-center gap-2 px-6 py-3 text-white bg-gray-700 rounded-full hover:bg-gray-800"
                                    >
                                        {isPaused ? (
                                            <>
                                                <Play className="w-5 h-5" /> Resume
                                            </>
                                        ) : (
                                            <>
                                                <Pause className="w-5 h-5" /> Pause
                                            </>
                                        )}
                                    </Button>
                                    <Button
                                        onClick={stopRecording}
                                        className="flex text-nowrap items-center gap-2 px-6 py-3 text-white bg-red-600 rounded-full hover:bg-red-700"
                                    >
                                        <Square className="w-5 h-5" /> Stop Recording
                                    </Button>
                                </>
                            )}

                            {/* Upload  Button */}
                            <Button
                                onClick={handleUpload}
                                disabled={!audioBlob || isUploading || transcription.length > 0}
                                className="flex items-center gap-2 px-6 py-3 text-white Primary rounded-full disabled:opacity-50"
                            >
                                {isUploading ? (
                                    <div className="flex items-center gap-2">
                                        <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                        Processing...
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="w-5 h-5" /> Upload
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )}

                {/* <DragAndDropFileInput onFileDrop={handleFileChange} /> */}

                {/* {sourceType === 'file' && (
                    <div className="flex flex-col gap-4 justify-center overflow-y-auto h-full p-2">
                        <DragAndDropFileInput onFileDrop={handleFileDrop} />

                        <Button onClick={handleUpload} className="bg-blue-600 text-white">
                            <Upload className="w-5 h-5" /> Upload File
                        </Button>
                    </div>
                )} */}

                {/* Preview */}
                {audioBlob && !isRecording && !isUploading && !exit && (
                    <div className="flex flex-col overflow-auto justify-center">
                        <div className="p-4 mb-10 bg-blue-50 rounded-md">
                            <p className="mb-2 text-sm text-blue-600">Audio Ready For Upload!</p>
                            <div className="flex items-center gap-4">
                                <audio controls className="w-4/5">
                                    <source src={URL.createObjectURL(audioBlob)} type="audio/wav" />
                                    Your browser does not support the audio element.
                                </audio>
                                {transcription.length === 0 && (
                                    <span
                                        onClick={() => {
                                            deleteAudio();
                                        }}
                                        className="text-red-600 cursor-pointer"
                                    >
                                        <Trash2 />
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AudioRecorder;
