import { useToastStore } from '../../../../../components/toast/ToastStore';
import { config } from '../../../../../config/default';
import httpRequest from '../../../../../global-utils/httpRequest';
import { convertLLMResponse } from '../utils';
import { useUpdateTemplateState } from './updateTemplateContext';
import { useNavigate } from 'react-router-dom';

export const useUpdateTemplatePageApi = () => {
    const { setState } = useUpdateTemplateState();
    const toast = useToastStore();
    const navigate = useNavigate();

    // ============================= CREATE TEMPLATE ==================================

    const getTemplatesApi = async () => {
        try {
            setState(prev => ({ ...prev, loadingTemplates: true }));
            const res: any = await httpRequest('POST', `${config.nodeApiUrl}/idp/template`, { pageSize: 100 });
            setState(prev => ({ ...prev }));
            // toast.success('Template fetched successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch template list');
        }
    };
    const getTemplateApi = async (id: string) => {
        try {
            setState(prev => ({ ...prev, loadingTemplate: true }));
            const res: any = await httpRequest('GET', `${config.nodeApiUrl}/idp/template/${id}`);
            setState(prev => ({ ...prev, sectionList: res.data?.fields, loadingTemplate: false }));
            // toast.success('Template fetched successfully');
            return res.data;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch template');
        }
    };
    const createTemplateApi = async (requestBody: any) => {
        try {
            setState(prev => ({ ...prev, updatingTemplate: true }));
            const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/template/create`, requestBody);
            setState(prev => ({ ...prev, showCreateForm: false, id: '', updatingTemplate: false }));
            
            const prevSelectedTenant = window?.sessionStorage?.getItem('selectedTenant');
            console.log('prevSelectedTenant:===========', prevSelectedTenant);
            window?.sessionStorage?.removeItem('selectedTenant');

            const resp = await httpRequest('POST', `${config.nodeApiUrl}/idp/template`, {
                pageSize: 1000,
                custom: true,
                filters: { deleted: false }
            });
            window?.sessionStorage?.setItem('templates', JSON.stringify(resp?.data));

            if (prevSelectedTenant) {
                window?.sessionStorage?.setItem('selectedTenant', prevSelectedTenant);
            }
            toast.success('Template created successfully');
            navigate('/docsnap/template/list');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to create template');
        }
    };
    const updateTemplateApi = async (id: string, requestBody: any, reload = true) => {
        try {
            setState(prev => ({ ...prev, updatingTemplate: true }));
            const res = await httpRequest('PATCH', `${config.nodeApiUrl}/idp/template/update/${id}`, requestBody);
            setState(prev => ({ ...prev, id: '', showCreateForm: false, updatingTemplate: false }));

            const prevSelectedTenant = window?.sessionStorage?.getItem('selectedTenant');
            window?.sessionStorage?.removeItem('selectedTenant');

            const resp = await httpRequest('POST', `${config.nodeApiUrl}/idp/template`, {
                pageSize: 1000,
                custom: true,
                filters: { deleted: false }
            });
            window?.sessionStorage?.setItem('templates', JSON.stringify(resp?.data));

            if (prevSelectedTenant) {
                window?.sessionStorage?.setItem('selectedTenant', prevSelectedTenant);
            }
            toast.success('Template updated successfully');
            if (reload) {
                window.location.reload();
            } else {
                // navigate('/docsnap/template/list');
            }
            return true;
        } catch (error) {
            console.error('error:===========', error);
            setState(prev => ({ ...prev, updatingTemplate: false }));
            toast.error('Failed to update Template');
        }
    };
    const deleteTemplateApi = async (id: string) => {
        try {
            const res = await httpRequest('DELETE', `${config.nodeApiUrl}/idp/template/delete/${id}`);
            setState(prev => ({ ...prev, showCreateDialog: false, id: '' }));
            toast.success('Template deleted successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to delete Template');
        }
    };

    const generateTemplateFieldsWithAI = async (requestBody: any = {}) => {
        try {
            const module = sessionStorage.getItem('module');
            setState(prev => ({ ...prev, generatingTemplateFieldsWithAI: true }));
            if (module === 'document-generation') {
                const res = await httpRequest('POST', `${config.mlServiceNodejs}/document-generation/generate-document-fields`, requestBody);
                setState(prev => ({
                    ...prev,
                    sectionList: res.data?.documentFields,
                    generatingTemplateFieldsWithAI: false,
                    visionOcrText: [res.data?.documentText]
                }));
                toast.success('Template fields generated successfully');
                return true;
            }
            const res = await httpRequest('POST', `${config.mlServiceNodejs}/template-fields/generate`, requestBody);
            const data = convertLLMResponse(res.data?.templateFields || {});
            setState(prev => ({ ...prev, sectionList: data, generatingTemplateFieldsWithAI: false }));
            // const data = convertLLMResponse(newSchema);
            // setState(prev => ({ ...prev, sectionList: data, generatingTemplateFieldsWithAI: false }));
            toast.success('Template fields generated successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            setState(prev => ({ ...prev, generatingTemplateFieldsWithAI: false }));
            toast.error('Failed to generate template fields');
        }
    };
    const updateTemplateFieldsWithAI = async (requestBody: any = {}) => {
        try {
            setState(prev => ({ ...prev, updatingTemplateFieldsWithAI: true }));
            const res = await httpRequest('POST', `${config.mlServiceNodejs}/template-fields/update`, requestBody);
            const data = convertLLMResponse(res.data?.templateFields || {});
            setState(prev => ({ ...prev, sectionList: data, updatingTemplateFieldsWithAI: false, userQuery: '' }));
            toast.success('Template fields updated successfully');
            return true;
        } catch (error) {
            setState(prev => ({ ...prev, updatingTemplateFieldsWithAI: false }));
            console.error('error:===========', error);
            toast.error('Failed to update template fields');
        }
    };
    const regenerateInstructionWithAI = async (requestBody: any = {}) => {
        try {
            setState(prev => ({ ...prev, regeneratingInstructionWithAI: true }));
            const res = await httpRequest('POST', `${config.mlServiceNodejs}/docsnap/regenerate-instruction`, requestBody);
            setState(prev => ({ ...prev, regeneratingInstructionWithAI: false, userQuery: '' }));
            toast.success('Template fields updated successfully');
            return res.data?.updatedInstruction;
        } catch (error) {
            setState(prev => ({ ...prev, regeneratingInstructionWithAI: false }));
            console.error('error:===========', error);
            toast.error('Failed to update template fields');
        }
    };
    const extractSectionFields = async (requestBody: any = {}, mainIndex: number) => {
        try {
            setState(prev => ({ ...prev, extractingSection: mainIndex }));
            const res = await httpRequest('POST', `${config.mlServiceNodejs}/template-fields/extract-section-fields`, requestBody);
            setState(prev => ({ ...prev, extractingSection: -1 }));
            toast.success('Section fields extracted successfully');
            return res.data;
        } catch (error) {
            console.error('error:===========', error);
            setState(prev => ({ ...prev, extractingSection: -1 }));
            toast.error('Failed to extract section fields');
            return null;
        }
    };

    const getTestExtractedData = async (templateId: string) => {
        try {
            const res = await httpRequest('GET', `${config.nodeApiUrl}/idp/history/latest/template/${templateId}`);
            return res.data;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to fetch test data');
            return null;
        }
    };

    return {
        createTemplateApi,
        updateTemplateApi,
        getTemplateApi,
        deleteTemplateApi,
        getTemplatesApi,
        generateTemplateFieldsWithAI,
        updateTemplateFieldsWithAI,
        regenerateInstructionWithAI,
        extractSectionFields,
        getTestExtractedData
    };
};

const newSchema = {
    basic_details: {
        dealer_name: 'Extract main dealer name from top section (before product details). Ignore buyer/consignee sections.',
        dealer_branch: 'Extract dealer branch/city from top section. Normalize to Title Case (e.g., Raipur).',
        sub_dealer: "Extract sub-dealer from 'Buyer', 'Consignee', or 'Ship To' labels.",
        invoice_number: 'Extract invoice number.',
        invoice_date: 'Extract invoice date.',
        delivery_note: 'Extract delivery note number.',
        delivery_note_date: 'Extract delivery note date.',
        cgst: 'Extract CGST amount.',
        sgst: 'Extract SGST amount.',
        total_tax: 'Extract total tax (CGST + SGST).',
        total_amount: 'Extract total invoice amount.'
    },
    consignee: {
        name: 'Extract consignee/ship-to name.',
        street: 'Extract consignee street address.',
        city: 'Extract consignee city.',
        state: 'Extract consignee state.',
        zip: 'Extract consignee ZIP code.',
        gstin_uin: 'Extract consignee GSTIN/UIN if present.'
    },
    buyer: {
        name: 'Extract buyer/bill-to name.',
        street: 'Extract buyer street address.',
        city: 'Extract buyer city.',
        state: 'Extract buyer state.',
        zip: 'Extract buyer ZIP code.',
        gstin_uin: 'Extract buyer GSTIN/UIN if present.'
    },
    line_items: [
        {
            table_instruction:
                'CRITICAL: Use image for table extraction, not OCR text. OCR often corrupts table data. Cross-reference table columns visually. Correct OCR mistakes by analyzing remaining data patterns (e.g., if quantities are 1,2,3,1222 → correct 1222 to reasonable value). Each row with HSN/SAC = one line item. Verify calculations: amount = quantity × rate ± discount ± tax. Check SGST = CGST (usually equal).',
            serial_no: 'Extract serial number or assign sequential order.',
            description: 'Extract item description. Verify against image if OCR seems corrupted.',
            hsn_sac: 'Extract HSN/SAC code. Cross-check with image for accuracy.',
            quantity: 'Extract quantity as integer. CRITICAL: Correct OCR errors by comparing with other quantities and logical patterns.',
            rate: 'Extract rate as float. Verify calculations match amount = quantity × rate. Default: 0.0 if missing.',
            per: "Extract 'per' unit if available.",
            discount: 'Extract discount percentage or amount. Check if calculations are consistent. Default: 0 if missing.',
            sgst: 'Extract SGST amount. Should equal CGST in most cases.',
            cgst: 'Extract CGST amount. Should equal SGST in most cases.',
            amount: 'Extract line item amount. Verify: amount = (quantity × rate) - discount + taxes.'
        }
    ],
    bank_details: {
        bank_name: 'Extract company bank name.',
        account_number: 'Extract bank account number (may be labeled as A/c No.).',
        branch_name: 'Extract branch name if available.',
        ifsc_code: 'Extract IFSC/branch code if available.'
    }
};
