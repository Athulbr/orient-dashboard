import { useState } from 'react';
import { UseTablebuilder } from '../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';
import PageNameComponent from '../../../components/PageName';
import PageContainer from '../../../components/PageContainer';
import Breadcrumbs from '../../../components/Breadcrumbs';
import { PromptTuningStateProvider } from './hooks/promptTuningContext';
import PromptTuningDialogComponent from './PromptTuningDialog';

export interface PromptTuningStateIF {
    showTuningDialog: boolean;
    loading: boolean;
    id: string;
    refresh: number;
    promptTuning: any | null;
    selectedTemplateId: string;
    templateName: string;
    fineTunedFieldList: Record<string, any>[];
    fromDate: any;
    toDate: any;
    validationSuccess: boolean;
    validating: boolean;
    updatingTemplate: boolean;
}
const sampleResponse = [
    {
        field_name: 'bill_to.bill_to_company vin-1',
        current_prompt: 'Extract name of the VA facility or medical center. it represents which company or VA facility we are received order from.',
        updated_prompt:
            'Extract the name of the VA facility or medical center. It represents which company or VA facility we received the order from. Ensure to standardize the name by appending "VAMC" to the end of the facility name if it is a VA Medical Center. If the facility name includes a location or identifier in parentheses, retain the main facility name followed by "VAMC". If the facility is not a VA Medical Center, use the name as is.',
        update_count: 120
    },
    {
        field_name: 'bill_to.bill_to_name vin-2',
        current_prompt: 'extract it from purchase agent field or from Fax page who is making purchase order. or received from whom',
        updated_prompt:
            'Ensure names are extracted in the format "First Last" or "First Middle Last" without any additional punctuation or formatting. If the name includes a middle initial, it should be placed between the first and last name. If the name is in all caps, convert it to title case. If the name includes a suffix like "III," it should be placed at the end of the name. If the name includes a prefix like "Dr." or "Mr.," it should be placed at the beginning of the name. If the name is associated with an organization, ensure the organization name is included before the person\'s name.',
        update_count: 115
    },
    {
        field_name: 'bill_to.bill_to_name vin-2',
        current_prompt: 'extract it from purchase agent field or from Fax page who is making purchase order. or received from whom',
        updated_prompt:
            'Ensure names are extracted in the format "First Last" or "First Middle Last" without any additional punctuation or formatting. If the name includes a middle initial, it should be placed between the first and last name. If the name is in all caps, convert it to title case. If the name includes a suffix like "III," it should be placed at the end of the name. If the name includes a prefix like "Dr." or "Mr.," it should be placed at the beginning of the name. If the name is associated with an organization, ensure the organization name is included before the person\'s name.',
        update_count: 115
    },
    {
        field_name: 'bill_to.bill_to_name vin-2',
        current_prompt: 'extract it from purchase agent field or from Fax page who is making purchase order. or received from whom',
        updated_prompt:
            'Ensure names are extracted in the format "First Last" or "First Middle Last" without any additional punctuation or formatting. If the name includes a middle initial, it should be placed between the first and last name. If the name is in all caps, convert it to title case. If the name includes a suffix like "III," it should be placed at the end of the name. If the name includes a prefix like "Dr." or "Mr.," it should be placed at the beginning of the name. If the name is associated with an organization, ensure the organization name is included before the person\'s name.',
        update_count: 115
    }
];
const initialState = {
    showTuningDialog: false,
    loading: false,
    templateName: '',
    id: '',
    refresh: 1,
    promptTuning: null,
    selectedTemplateId: '',
    fineTunedFieldList: [],
    fromDate: null,
    toDate: null,
    validationSuccess: false,
    validating: false,
    updatingTemplate: false
};

const UpdatedFieldsListPage: React.FC = () => {
    const [state, setState] = useState<PromptTuningStateIF>(initialState);
    const customFunctions = {
        rowClickHandler: (row: any) => {
            setState(prev => ({ ...prev, showTuningDialog: true, selectedTemplateId: row.template?._id, templateName: row.template?.name }));
        }
    };
    const updatedQuery = (query: any) => {
        if (query.startDate && query.endDate) {
            setState(prev => ({ ...prev, fromDate: query.startDate.toISOString().split('T')[0], toDate: query.endDate.toISOString().split('T')[0] }));
        }
        return query;
    };
    return (
        <PromptTuningStateProvider value={{ state, setState }}>
            <PageContainer className="">
                <PageNameComponent name="Updated Fields" />
                <UseTablebuilder
                    name="Prompt Tuning Table"
                    updatedQuery={updatedQuery}
                    customFunctions={customFunctions}
                    fluidHeight
                    deletePermission="delete:promptTuning"
                    updatePermission="update:promptTuning"
                />
            </PageContainer>
            <PromptTuningDialogComponent />
        </PromptTuningStateProvider>
    );
};

export default UpdatedFieldsListPage;
