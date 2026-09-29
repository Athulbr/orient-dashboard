import { create } from 'zustand';
import httpRequest from '../global-utils/httpRequest';
import { TranscriptionData } from '../modules/transcript/interface';
import { useToastStore } from '../components/toast/ToastStore';
import { config } from '../config/default';

export interface transcriptIF {
    _id: string;
    name: string;
    transcriptGroupId: {
        _id: string;
        name: string;
    };
    recordedBy: string;
    deleted: boolean;
    sourceType?: string;
    patientId?: string;
    sourceFile?: string;
    medicalText?: string;
    transcriptions: TranscriptionData[];
    transcriptedFile: string;
    createdAt: string;
    updatedAt: string;
    __v: number;
}

export interface createTranscriptPayloadIF {
    name?: string;
    patientId?: string;
    transcriptedFile?: string;
    transcriptions?: any;
}

interface RoleState {
    transcripts: transcriptIF[];
    transcriptData: transcriptIF | null;
    currentData: transcriptIF | null;
    extractedData: any;
    deleting: string;
    loading: boolean;
    initialLoading: boolean;
    createTranscript: (payload: createTranscriptPayloadIF) => Promise<boolean>;
    getTranscripts: (query?: any, noLoader?: boolean) => Promise<boolean>;
    updateTranscript: (payload: any, id: string) => Promise<boolean>;
    gettranscriptData: (id: string) => Promise<boolean>;
    deleteTranscript: (id: string) => Promise<boolean>;
    uploadAudio: (payload: FormData, fileType: string) => Promise<boolean>;
    uploadText: (payload: { medical_text: string }) => Promise<boolean>;
}

const useTranscriptStore = create<RoleState>((set, get) => ({
    transcripts: [],
    transcriptData: null,
    currentData: null,
    extractedData: new Blob(),
    deleting: '',
    loading: false,
    initialLoading: false,

    createTranscript: async payload => {
        try {
            set({ loading: true, currentData: null, transcriptData: null });
            const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/transcript/create`, payload);
            set({ currentData: res.data, transcriptData: null });
            return true;
        } catch (error: any) {
            useToastStore.getState().error(error.message);
            return false;
        } finally {
            set({ loading: false });
        }
    },
    updateTranscript: async (payload, id) => {
        try {
            await httpRequest('PATCH', `${config.nodeApiUrl}/idp/transcript/update/${id}`, payload);
            await get().getTranscripts();
            return true;
        } catch (error) {
            return false;
        }
    },
    getTranscripts: async payload => {
        try {
            set({ initialLoading: true, transcripts: [], transcriptData: null });
            const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/transcript/`, payload);
            if (!res.data.length) return true;
            set({ transcripts: res.data });
            return true;
        } catch (error) {
            return false;
        } finally {
            set({ initialLoading: false });
        }
    },

    gettranscriptData: async id => {
        set({ loading: true });
        try {
            set({ transcriptData: null });
            const res = await httpRequest('GET', `${config.nodeApiUrl}/idp/transcript/${id}`);
            set({ transcriptData: res.data });
            return true;
        } catch (error) {
            return false;
        } finally {
            set({ loading: false });
        }
    },

    deleteTranscript: async id => {
        set({ deleting: id });
        try {
            await httpRequest('DELETE', `${config.nodeApiUrl}/idp/transcript/delete/${id}`);
            // toast.success("Record deleted successfully");
            await get().getTranscripts(); // Refresh after deletion
            return true;
        } catch (error) {
            // toast.error("Failed to delete record");
            return false;
        } finally {
            set({ deleting: '' });
        }
    },

    // uploadAudio: async (formData: FormData): Promise<any> => {
    //   try {
    //     const URL = `${config.baseUrl}/transcript/upload_audio/`;
    //     const response = await fetch(URL, {
    //       method: 'POST',
    //       body: formData,
    //     });

    //     if (!response.ok) {
    //       const errorText = await response.text();
    //       throw new Error(`API Error (${response.status}): ${errorText}`);
    //     }

    //     const reader = response?.body?.getReader();
    //     if (!reader) {
    //       // showToast('error', 'Error in training the bot');
    //       return false;
    //     }

    //     while (true) {
    //       const { value, done } = await reader.read();
    //       if (value) {
    //         set({ extractedData: value })
    //         return value;
    //       }
    //       if (done) break;
    //     }
    //   } catch (error) {
    //     console.error('Error in uploadAudio:', error);
    //     throw error;
    //   }
    // }

    uploadAudio: async (formData: FormData, fileType: string): Promise<any> => {
        try {
            let URL = `${config.baseUrl}/transcript/upload_audio/`;
            if (fileType === 'text') {
                URL = `${config.baseUrl}/transcript/upload_file/`;
            }
            const response = await fetch(URL, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error (${response.status}): ${errorText}`);
            }

            const reader = response?.body?.getReader();
            if (!reader) {
                // showToast('error', 'Error in training the bot');
                return false;
            }

            while (true) {
                const { value, done } = await reader.read();
                if (value) {
                    set({ extractedData: value });
                    return value;
                }
                if (done) break;
            }
        } catch (error) {
            console.error('Error in uploadAudio:', error);
            throw error;
        }
    },

    uploadText: async (payload: { medical_text: string }): Promise<any> => {
        try {
            const URL = `${config.baseUrl}/transcript/process_text/`;
            const response = await fetch(URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error (${response.status}): ${errorText}`);
            }

            const reader = response?.body?.getReader();
            if (!reader) {
                // showToast('error', 'Error in training the bot');
                return false;
            }

            while (true) {
                const { value, done } = await reader.read();
                if (value) {
                    set({ extractedData: value });
                    return value;
                }
                if (done) break;
            }
        } catch (error) {
            console.error('Error in uploadText:', error);
            throw error;
        }
    }
}));

export default useTranscriptStore;
