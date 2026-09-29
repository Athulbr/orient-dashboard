import { usePromptTuningState } from './promptTuningContext';
import { useToastStore } from '../../../../components/toast/ToastStore';
import httpRequest from '../../../../global-utils/httpRequest';
import { config } from '../../../../config/default';

export const usePromptTuningApi = () => {
    const { state, setState } = usePromptTuningState();
    const toast = useToastStore();

    // ============================= GET PROMPTTUNING ==================================

    const fineTunePrompt = async (payload: any) => {
        if (true) {
            const sampleResponse = [
                {
                    field_name: 'basic_details.purchase_agent',
                    current_prompt:
                        "Look for labels like 'Purchase Agent', 'Purchase Agent Lead', 'Administrative support assistant',  'Ordered By', or 'Buyer' or similar words. take this from Fax page. give full name if possible",
                    updated_prompt:
                        "Look for labels like 'Purchase Agent', 'Purchase Agent Lead', 'Administrative support assistant', 'Ordered By', or 'Buyer' or similar words. take this from Fax page. give full name if possible. Ensure that names are extracted in the correct order, with the first name followed by the last name, and remove any titles or suffixes such as 'Jr', 'III', etc. Pay attention to capitalization and ensure that names are consistently capitalized. If a name appears in all caps, convert it to title case. Double-check for any potential misinterpretations of names and correct them based on context.",
                    update_count: 30
                },
                {
                    field_name: 'basic_details.from_location',
                    current_prompt:
                        "Extract the 'From:' location name from the Fax page or similar where order is received location.don't include person name.",
                    updated_prompt:
                        'Extract the \'From:\' location name from the Fax page or similar where order is received location. don\'t include person name. Ensure to extract the full name of the facility or center if it is mentioned, such as "VAMC" or "VA Medical Center," and include the city or state if specified. If the location is a specific division or healthcare system, include that in the extraction. Avoid extracting partial names or abbreviations that do not clearly indicate the facility.',
                    update_count: 29
                },
                {
                    field_name: 'bill_to.bill_to_name',
                    current_prompt: 'extract it from purchase agent field or from Fax page who is making purchase order. or received from whom.',
                    updated_prompt:
                        'extract it from purchase agent field or from Fax page who is making purchase order. or received from whom. Ensure that names are extracted in the correct order, with the first name followed by the last name, and remove any suffixes such as "Jr.", "III", or initials that are not part of the main name. Pay attention to capitalization and ensure that names are consistently capitalized. If a name appears in different formats, choose the most complete and commonly used version.',
                    update_count: 28
                },
                {
                    field_name: 'bill_to.bill_to_company',
                    current_prompt:
                        "Extract the full name of the VA facility or medical center. it represents which company or VA facility we are received order from. KEEP it as same name mentioned in 'FROM:'",
                    updated_prompt:
                        'Extract the full name of the VA facility or medical center. it represents which company or VA facility we are received order from. KEEP it as same name mentioned in \'FROM:\' Ensure that the extracted name is in the format of "[Facility Name] VAMC" or "[Facility Name] VA Medical Center" as appropriate. If the facility is part of a healthcare system, use the specific VAMC name associated with it. If the facility name includes a location or division, include it in the extracted name. If the facility is referred to by a notable individual’s name, ensure that the full name is included in the extraction.',
                    update_count: 28
                }
            ];
            setState(prev => ({ ...prev, loading: true }));
            setTimeout(() => {
                setState(prev => ({ ...prev, loading: false, fineTunedFieldList: sampleResponse }));
            }, 4000);
            return;
        }
        try {
            setState(prev => ({ ...prev, loading: true }));
            const res: any = await httpRequest('POST', `${config.extractionServicePython}/finetune/prompt_finetune`, payload);
            if (!res.success) {
                setState(prev => ({ ...prev, loading: false }));
                toast.error(res.message);
                return false;
            }
            setState(prev => ({ ...prev, loading: false, fineTunedFieldList: res.data }));
            toast.success('PromptTuning fine-tuned successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            setState(prev => ({ ...prev, loading: false }));
            toast.error('Failed to fine-tune PromptTuning');
        }
    };

    const updateTemplateApi = async (requestBody: any) => {
        if (true) {
            setState(prev => ({ ...prev, updatingTemplate: true }));
            setTimeout(() => {
                setState(prev => ({ ...prev, updatingTemplate: false }));
            }, 4000);
            return;
        }
        try {
            setState(prev => ({ ...prev, updatingTemplate: true }));
            const res = await httpRequest('PATCH', `${config.nodeApiUrl}/idp/updated-field/update/prompt/${state.selectedTemplateId}`, requestBody);
            setState(prev => ({ ...prev, showTuningDialog: false, id: '', templateName: '', selectedTemplateId: '' }));
            toast.success('Template updated successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to update Template');
        } finally {
            setState(prev => ({ ...prev, updatingTemplate: false }));
        }
    };

    return { fineTunePrompt, updateTemplateApi };
};
