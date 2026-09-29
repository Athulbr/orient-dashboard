import { create } from 'zustand';
import httpRequest from '../global-utils/httpRequest';
import { config } from '../config/default';

export interface transcriptGroupIF {
    _id: string;
    name: string;
    deleted: boolean;
    createdAt: string;
    updatedAt: string;
    __v: number;
}

export interface transcriptGroupPayloadIF {
    name: string;
}

interface RoleState {
    transcripts: transcriptGroupIF[];
    transcript: transcriptGroupIF | null;
    extractedData: any;
    deleting: string;
    loading: boolean;
    initialLoading: boolean;
    createTranscript: (payload: transcriptGroupPayloadIF) => Promise<boolean>;
    updateTranscript: (payload: transcriptGroupPayloadIF, id: string) => Promise<boolean>;
    getTranscripts: (query?: any, noLoader?: boolean) => Promise<boolean>;
    gettranscript: (id: string) => Promise<boolean>;
    deleteTranscript: (id: string) => Promise<boolean>;
}

const useTranscriptGroupStore = create<RoleState>((set, get) => ({
    transcripts: [],
    transcript: null,
    extractedData: new Blob(),
    deleting: '',
    loading: false,
    initialLoading: false,

    createTranscript: async payload => {
        try {
            await httpRequest('POST', `${config.baseUrl}/ml/api/audiogroup/create`, payload);
            return true;
        } catch (error) {
            return false;
        }
    },
    updateTranscript: async (payload, id) => {
        try {
            await httpRequest('PATCH', `${config.baseUrl}/ml/api/audiogroup/update/${id}`, payload);
            // useToastStore.getState().showToast("success", updateSuccessMessage(""), 50);
            await get().getTranscripts();
            return true;
        } catch (error) {
            return false;
        }
    },
    getTranscripts: async payload => {
        set({ initialLoading: true });
        try {
            const res = await httpRequest('POST', `${config.baseUrl}/ml/api/audiogroup/`, payload);
            if (!res.data.length) return true;
            set({ transcripts: res.data });
            return true;
        } catch (error) {
            return false;
        } finally {
            set({ initialLoading: false });
        }
    },

    gettranscript: async id => {
        set({ loading: true });
        try {
            set({ transcript: null });
            const res = await httpRequest('GET', `${config.baseUrl}/ml/api/audiogroup/${id}`);
            set({ transcript: res.data });
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
            await httpRequest('DELETE', `${config.baseUrl}/ml/api/audiogroup/delete/${id}`);
            // useToastStore.getState().showToast("success", deleteSuccessMessage("Record"));
            await get().getTranscripts(); // Refresh after deletion
            return true;
        } catch (error) {
            // useToastStore.getState().showToast("error", deleteErrorMessage("Record"));
            return false;
        } finally {
            set({ deleting: '' });
        }
    }
}));

export default useTranscriptGroupStore;
