import { create } from 'zustand';
import httpRequest from '../global-utils/httpRequest';
import httpUploadRequest from '../global-utils/httpUploadRequest';
import { config } from '../config/default';

interface S3StorageIF {
    files: Record<string, ArrayBuffer | null>;
    uploading: Record<string, Promise<ArrayBuffer | null> | undefined>;
    uploadS3File: (file: File) => Promise<any>;
    getS3File: (fileName: string) => Promise<ArrayBuffer | null>;
}

export const useS3Storage = create<S3StorageIF>((set, get) => ({
    files: {},
    uploading: {},

    uploadS3File: async (file: File) => {
        try {
            const uploadResponse = await httpUploadRequest(`${config.nodeApiUrl}/idp/document/upload`, file);
            return uploadResponse.data;
        } catch (error) {
            console.error('Error uploading file:', error);
            throw error;
        }
    },

    getS3File: async (fileName: string) => {
        const { files, uploading } = get();

        // ✅ Already cached
        if (files[fileName]) {
            return files[fileName];
        }

        // ✅ If a fetch is in progress, return that promise instead of starting new
        if (uploading[fileName]) {
            return uploading[fileName]!;
        }

        // ✅ Create fetch promise first and put in state immediately
        const fetchPromise: Promise<ArrayBuffer | null> = (async () => {
            try {
                const fileDataResponse = await httpRequest('POST', `${config.nodeApiUrl}/idp/document/get/file`, { fileName });

                set(state => ({
                    files: { ...state.files, [fileName]: fileDataResponse.data },
                    uploading: { ...state.uploading, [fileName]: undefined }
                }));

                return fileDataResponse.data;
            } catch (error) {
                console.error(`Error fetching file: ${fileName}`, error);

                set(state => ({
                    uploading: { ...state.uploading, [fileName]: undefined }
                }));

                throw new Error(`Error fetching file`);
            }
        })();

        // ✅ Store promise immediately so concurrent calls reuse it
        set(state => ({
            uploading: { ...state.uploading, [fileName]: fetchPromise }
        }));

        return fetchPromise;
    }
}));
