import Breadcrumbs from '../../../../components/Breadcrumbs';
import PageContainer from '../../../../components/PageContainer';
import PageNameComponent from '../../../../components/PageName';
import { FieldsContainer } from './FieldsContainer';
import { ImageViewer } from './components/ImageViewer';
import { ResizableContainer } from './components/ResizableContainer';
import { UpdateTemplateStateProvider } from './hooks/updateTemplateContext';
import { useEffect, useState } from 'react';

export interface UpdateTemplateStateIF {
    sectionList: any[];
    loadingS3File: boolean;
    loadingTemplate: boolean;
    images: any[];
    updatingTemplate: boolean;
    templateData: any;
    showCreateForm: boolean;
    generatingTemplateFieldsWithAI: boolean;
    userQuery: string;
    updatingTemplateFieldsWithAI: boolean;
    visionOcrText: string[];
    noS3File: boolean;
    showSettingsForm: boolean;
    showTemplateSettingsForm: boolean;
    templateSettings: any;
    extractingSection: number;
    editingPrompt: string;
}
const initialState: UpdateTemplateStateIF = {
    sectionList: [],
    loadingS3File: false,
    loadingTemplate: false,
    images: [],
    updatingTemplate: false,
    templateData: null,
    showCreateForm: false,
    generatingTemplateFieldsWithAI: false,
    userQuery: '',
    updatingTemplateFieldsWithAI: false,
    visionOcrText: [],
    noS3File: false,
    showSettingsForm: false,
    showTemplateSettingsForm: false,
    templateSettings: null,
    extractingSection: -1,
    editingPrompt: ''
};

const UpdateTemplatePage: React.FC<{ create?: boolean; settings?: boolean }> = ({ create, settings }) => {
    const [state, setState] = useState<UpdateTemplateStateIF>(initialState);

    useEffect(() => (settings ? setState({ ...state, showTemplateSettingsForm: true }) : () => {}), []);

    return (
        <UpdateTemplateStateProvider value={{ state, setState }}>
            <PageContainer className="gap-4 overflow-hidden p-6 pb-0">
                <Breadcrumbs page="updateTemplate" />
                <PageNameComponent name={`${create ? 'Create Template' : 'Update Template'}: ${state.templateData?.name || 'New Template'}`} showBackButton />
                <ResizableContainer
                    left={<ImageViewer images={state.images} name="Document" />}
                    right={<FieldsContainer create={create} />}
                    initialLeftWidthPercent={50}
                    minLeftWidthPercent={20}
                    maxLeftWidthPercent={70}
                />
            </PageContainer>
        </UpdateTemplateStateProvider>
    );
};

export default UpdateTemplatePage;

const fields = [
    {
        name: 'Basic Details',
        dataType: 'object',
        jsonKey: 'basic_details',
        excludeExtraction: false,
        description: 'Basic Details',
        instruction: 'Extract Basic Details of the product.',
        isHidden: false,
        subFields: [
            {
                name: 'SKU Number',
                dataType: 'str',
                jsonKey: 'sku_number',
                required: false,
                excludeExtraction: false,
                isHidden: false,
                _id: '68c7c0b39fa94d034c7cb81b'
            },
            {
                name: 'Vendor Product Name',
                dataType: 'str',
                jsonKey: 'vendor_product_name',
                required: false,
                excludeExtraction: false,
                isHidden: false,
                _id: '68c7c0b39fa94d034c7cb81c',
                description: 'Product name',
                instruction: 'Extract Product name, You can find it in a ocr text.',
                guidelines: ''
            },
            {
                name: 'RM Product Name',
                dataType: 'str',
                jsonKey: 'rm_product_name',
                required: false,
                excludeExtraction: false,
                isHidden: false,
                _id: '68c7c0b39fa94d034c7cb81d'
            },
            {
                name: 'Product Sub Title',
                dataType: 'str',
                jsonKey: 'product_sub_title',
                required: false,
                excludeExtraction: false,
                isHidden: false,
                _id: '68c7c0b39fa94d034c7cb81e',
                description: 'Product sub-title',
                instruction: 'Extract Product sub-title, You can find it in a ocr text.',
                guidelines: ''
            },
            {
                name: 'URL File Path',
                dataType: 'str',
                jsonKey: 'url_file_path',
                required: false,
                excludeExtraction: false,
                isHidden: false,
                _id: '68c7c0b39fa94d034c7cb81f'
            }
        ],
        _id: '68c7c0b39fa94d034c7cb81a'
    },
    {
        name: 'Descriptions',
        dataType: 'object',
        jsonKey: 'descriptions',
        subFields: [
            {
                name: 'Manufacturer Product Short Description',
                jsonKey: 'manufacturer_product_short_description',
                dataType: 'str',
                description: 'Manufacturer Product Short Description',
                instruction: 'Extract Manufacturer Product Short Description',
                guidelines: '',
                excludeExtraction: false,
                isHidden: false,
                required: false
            },
            {
                name: 'Manufacturer Product Long Description',
                jsonKey: 'manufacturer_product_long_description',
                dataType: 'str',
                description: 'Manufacturer Product Long Description',
                instruction: 'Extract Manufacturer Product Long Description',
                guidelines: '',
                excludeExtraction: false,
                isHidden: false,
                required: false
            },
            {
                name: 'Product Benefits',
                jsonKey: 'product_benefits',
                dataType: 'str',
                description: 'Product Benefits',
                instruction: 'Extract Product Benefits',
                guidelines: '',
                excludeExtraction: false,
                isHidden: false,
                required: false
            }
        ],
        description: 'Descriptions',
        instruction: 'You can find Descriptions in ocr text.',
        excludeExtraction: false,
        isHidden: false
    },
    {
        name: 'Product Specifications',
        dataType: 'array',
        jsonKey: 'product_specifications',
        subFields: [
            {
                name: 'Serial Number',
                jsonKey: 'serial_number',
                dataType: 'str',
                description: 'Serial Number',
                instruction: 'Extract Serial Number, If not add from 1 to n.',
                guidelines: '',
                excludeExtraction: false,
                isHidden: false,
                required: false
            },
            {
                name: 'Attribute',
                jsonKey: 'attribute',
                dataType: 'str',
                description: 'Attributes',
                instruction: 'Extract attributes like "height", "weight", etc.',
                guidelines: '',
                excludeExtraction: false,
                isHidden: false,
                required: false
            },
            {
                name: 'Value',
                jsonKey: 'value',
                dataType: 'str',
                description: 'Value',
                instruction: 'Extract Value of the attribute, ex: "20", "Yes", etc.',
                guidelines: '',
                excludeExtraction: false,
                isHidden: false,
                required: false
            }
        ],
        description: 'Product Specifications',
        instruction: 'Extract Product Specifications, You can find in ocr text.',
        excludeExtraction: false,
        isHidden: false
    }
];
