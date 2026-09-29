import { useEffect, useState } from 'react';
import httpRequest from '../../../global-utils/httpRequest';
import { config } from '../../../config/default';
import { useContentCreationEditorState } from './DocumentCreationEditorContext';
import { useToastStore } from '../../../components/toast/ToastStore';
import { useParams } from 'react-router-dom';

export const useContentCreationApi = () => {
    const { state, setState } = useContentCreationEditorState();
    const toast = useToastStore()
    const { id } = useParams()

    const fetchRecord = async () => {
        if (!id) return;
        const res = await httpRequest('GET', `${config.nodeApiUrl}/idp/history/${id}`);
        const fetchedRecord = res.data;
        const fetchedContent = fetchedRecord?.extractedData?.htmlContent || '';

        let fetchedExtractionPrompt = '';
        let fetchedBlogCss = '';
        let fetchedBlogCssWrapperClass = 'contentbody';
        if (fetchedRecord?.templateId) {
            const templateId = fetchedRecord.templateId._id;
            const templateRes = await httpRequest('GET', `${config.nodeApiUrl}/idp/template/${templateId}`);
            fetchedExtractionPrompt = templateRes.data?.settings?.extractionPrompt || '';
            fetchedBlogCss = templateRes.data?.settings?.blogCss || '';
            fetchedBlogCssWrapperClass = templateRes.data?.settings?.blogCssWrapperClass || 'contentbody';
        }

        setState(prev => ({
            ...prev,
            extractedData: {
                ...(fetchedRecord?.extractedData || {}),
                title: fetchedRecord?.title || fetchedRecord?.extractedData?.title || fetchedRecord?.extractedData?.rowData?.name || fetchedRecord?.name || '',
                // author: fetchedRecord?.extractedData?.rowData?.author || '',
                primaryImageUrl: fetchedRecord?.extractedData?.primaryImageUrl || '',
                rowData: fetchedRecord?.extractedData?.rowData || {}
            },
            ...(fetchedRecord?.keywords ? { keywords: fetchedRecord.keywords } : {}),
            content: fetchedContent,
            record: fetchedRecord,
            extractionPrompt: fetchedExtractionPrompt,
            blogCss: fetchedBlogCss,
            blogCssWrapperClass: fetchedBlogCssWrapperClass,
        }));
    };
    const regenerateBlog = async (payload: { keywords?: any[]; extractedData?: any; extractionPrompt?: string; userComment?: string }) => {
        const res = await httpRequest('POST', `${config.mlServiceNodejs}/content-creation/regenerate-blog`, {
            ...payload,
            blogCss: state.blogCss,
            blogCssWrapperClass: state.blogCssWrapperClass,
        });
        return res;
    };

    const updateContentCreationPrompt = async (requestBody: {
        userInstruction: string;
        currentPrompt?: string;
    }): Promise<string | null> => {
        try {
            const res = await httpRequest('POST', `${config.mlServiceNodejs}/content-creation/update-prompt`, requestBody);
            return res.data?.prompt;
        } catch (error: any) {
            return null;
        }
    };

    const editSelectedContent = async (requestBody: {
        selectedText: string;
        userInstruction: string;
    }): Promise<string | null> => {
        try {
            const res = await httpRequest('POST', `${config.mlServiceNodejs}/content-creation/edit-content`, requestBody);
            return res.data?.content ?? null;
        } catch {
            return null;
        }
    };

    const updateRecordApi = async (requestBody: any) => {
        try {
            const res = await httpRequest('PATCH', `${config.nodeApiUrl}/idp/history/save/extraction/${id}`, requestBody);
            toast.success('Record updated successfully');
        } catch (error) {
            toast.error('Failed to update record');
        }
    };

    const htmlToAudio = async (fullHTML: string): Promise<string | null> => {
        try {
            const blob = new Blob([fullHTML], { type: 'text/html' });
            const formData = new FormData();
            formData.append('file', blob, `content-${Date.now()}.html`);

            const sessionStorageAccessToken = window?.sessionStorage?.getItem('accessToken') || '';
            const accessToken = sessionStorageAccessToken ? JSON.parse(sessionStorageAccessToken) : '';
            const selectedTenant = window?.sessionStorage?.getItem('selectedTenant') || '';
            const selectedRole = window?.sessionStorage?.getItem('selectedRole') || '';
            const selectedModule = window?.sessionStorage?.getItem('module') || '';
            const user: any = JSON.parse(window?.sessionStorage?.getItem('user') || '{}');

            const headers: HeadersInit = {
                Accept: 'application/json',
                tenantid: selectedTenant ? selectedTenant : user?.tenant?._id,
                roleid: selectedRole ? selectedRole : user?.role?._id,
                module: selectedModule,
                'x-api-key': 'secret1',
                authorization: `Bearer ${accessToken}`
            };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000000);

            try {
                const response = await fetch(`${config.mlServiceNodejs}/content-creation/html-to-audio`, {
                    method: 'POST',
                    headers,
                    body: formData,
                    signal: controller.signal,
                    credentials: 'same-origin'
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errText = await response.text().catch(() => '');
                    toast.error(errText || `Audio generation failed: ${response.status}`);
                    return null;
                }

                const data = await response.json();
                toast.success('Audio generated successfully');
                return data.audioUrl as string;
            } finally {
                clearTimeout(timeoutId);
            }
        } catch (error) {
            console.error('Error in htmlToAudio:', error);
            toast.error('Audio generation failed');
            return null;
        }
    };



    return { fetchRecord, regenerateBlog, updateContentCreationPrompt, updateRecordApi, editSelectedContent, htmlToAudio };
};
