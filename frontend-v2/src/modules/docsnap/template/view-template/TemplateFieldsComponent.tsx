import { Edit, Baseline, Hash, CheckSquare, Sigma, FileX } from 'lucide-react';
import { Button } from '../../../../components/Button';
import { useViewTemplateState } from './hooks/viewTemplateContext';
import { useNavigate, useParams } from 'react-router-dom';
interface ListFieldsComponentIF {
    test?: string;
}

export const TemplateFieldsComponent: React.FC<ListFieldsComponentIF> = () => {
    const { state } = useViewTemplateState();
    const navigate = useNavigate();
    const fields = Array.isArray(state.templateFields) && state.templateFields.length > 0 ? state.templateFields : sampleTemplateFields;
    const { id } = useParams();
    const DataTypeIcon = ({ dataType }: { dataType: string }) => {
        const iconMap: { [key: string]: React.ReactNode } = {
            String: <Baseline size={20} />,
            Integer: <Hash size={20} />,
            Float: <Sigma size={20} />,
            Boolean: <CheckSquare size={20} />
        };
        return <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600">{iconMap[dataType] || '?'}</div>;
    };
    const convertDataTyptText = (type: string) => {
        switch (type) {
            case 'str':
                return 'String';
            case 'int':
                return 'Integer';
            case 'float':
                return 'Float';
            case 'bool':
                return 'Boolean';
            default:
                return 'Unknown';
        }
    };

    if (!fields || fields.length === 0) {
        return (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg bg-gray-50 p-8 text-center">
                <div className="flex w-full justify-end">
                    <Button onClick={() => navigate(`/docsnap/template/update/${id}`)} outlined startIcon={<Edit size={16} className="text-gray-500" />}>
                        Edit Template
                    </Button>
                </div>
                <FileX size={48} className="text-gray-400" />
                <h3 className="mt-4 text-xl font-semibold text-gray-800">No Template Fields Found</h3>
                <p className="mt-2 text-sm text-gray-500">You can add new fields to start building your template.</p>
            </div>
        );
    }

    return (
        <div className="w-full overflow-y-auto p-4" style={{ scrollbarGutter: 'stable' }}>
            <div className="flex w-full justify-end">
                <Button onClick={() => navigate(`/docsnap/template/update/${id}`)} outlined startIcon={<Edit size={16} className="text-gray-500" />}>
                    Edit Template
                </Button>
            </div>
            {fields.map((field: any) => (
                <div
                    key={field._id}
                    className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:shadow-lg"
                >
                    <div className="p-6">
                        <div className="flex items-center gap-4">
                            <DataTypeIcon dataType={convertDataTyptText(field.dataType)} />
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">{field.name}</h2>
                                <p className="text-sm text-gray-600">{field.description}</p>
                            </div>
                        </div>
                        <div className="mt-5 space-y-3 border-t border-gray-200 pt-5">
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-medium text-gray-500">JSON Key</span>
                                <span className="rounded-md bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">{field.jsonKey}</span>
                            </div>
                            {field.instruction && (
                                <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                                    <span className="font-semibold">Instruction:</span> {field.instruction}
                                </div>
                            )}
                        </div>
                    </div>
                    {field.subFields && field.subFields.length > 0 && (
                        <div className="border-t border-gray-200 bg-gray-50 px-6 py-5">
                            <h3 className="mb-4 text-base font-semibold text-gray-800">Sub-Fields</h3>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {field.subFields.map((sub: any) => (
                                    <div
                                        key={sub._id}
                                        className="transform rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md"
                                    >
                                        <div className="flex items-start justify-between">
                                            <h4 className="font-semibold text-gray-800">{sub.name}</h4>
                                            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                                {convertDataTyptText(sub.dataType)}
                                            </span>
                                        </div>
                                        <p className="mt-1.5 text-sm text-gray-500">{sub.description}</p>
                                        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 text-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-gray-500">JSON Key:</span>
                                                <span className="font-mono">{sub.jsonKey}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                {sub.required && (
                                                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 font-semibold text-green-800">Required</span>
                                                )}
                                                {sub.excludeExtraction && (
                                                    <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 font-semibold text-yellow-800">No Extract</span>
                                                )}
                                                {sub.isHidden && (
                                                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 font-semibold text-red-800">Hidden</span>
                                                )}
                                            </div>
                                            {sub.instruction && <p className="pt-1 text-blue-600 italic">{sub.instruction}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

const sampleTemplateFields = [
    {
        name: 'Basic Information',
        dataType: 'str',
        jsonKey: 'basic_information',
        excludeExtraction: false,
        description: 'Basic Information',
        instruction: 'Extract Basic Information from the Bill of Lading',
        isHidden: false,
        subFields: [
            {
                name: 'Bill of Lading Number',
                dataType: 'str',
                jsonKey: 'bill_of_lading_number',
                required: false,
                excludeExtraction: false,
                description: 'Extract Basic Information - Bill of Lading Number',
                instruction: 'Extract Basic Information - Bill of Lading Number',
                isHidden: false,
                _id: '6864ab6da3e147ab5b8e7d39'
            },
            {
                name: 'Date of Issue',
                dataType: 'str',
                jsonKey: 'date_of_issue',
                required: false,
                excludeExtraction: false,
                description: 'Extract Basic Information - Date of Issue from Bill of Lading',
                instruction: 'Extract Basic Information - Date of Issue from Bill of Lading',
                isHidden: false,
                _id: '6864ab6da3e147ab5b8e7d3a'
            },
            {
                name: 'Place of Receipt',
                dataType: 'str',
                jsonKey: 'place_of_receipt',
                required: false,
                excludeExtraction: false,
                description: 'Extract Basic Information - Place of Receipt from Bill of Lading',
                instruction: 'Extract Basic Information - Place of Receipt from Bill of Lading',
                isHidden: false,
                _id: '6864ab6da3e147ab5b8e7d3b'
            },
            {
                name: 'Port of Loading',
                dataType: 'str',
                jsonKey: 'port_of_loading',
                required: false,
                excludeExtraction: false,
                description: 'Extract Basic Information - Port of Loading from Bill of Lading',
                instruction: 'Extract Basic Information - Port of Loading from Bill of Lading',
                isHidden: false,
                _id: '6864ab6da3e147ab5b8e7d3c'
            },
            {
                name: 'Port of Discharge',
                dataType: 'str',
                jsonKey: 'port_of_discharge',
                required: false,
                excludeExtraction: false,
                description: 'Extract Basic Information - Port of Discharge from Bill of Lading',
                instruction: 'Extract Basic Information - Port of Discharge from Bill of Lading',
                isHidden: false,
                _id: '6864ab6da3e147ab5b8e7d3d'
            },
            {
                name: 'Place of Delivery',
                dataType: 'str',
                jsonKey: 'place_of_delivery',
                required: false,
                excludeExtraction: false,
                description: 'Extract Basic Information - Place of Delivery from Bill of Lading',
                instruction: 'Extract Basic Information - Place of Delivery from Bill of Lading',
                isHidden: false,
                _id: '6864ab6da3e147ab5b8e7d3e'
            },
            {
                name: 'Terms and Conditions',
                dataType: 'str',
                jsonKey: 'terms_and_conditions',
                required: false,
                excludeExtraction: false,
                description: 'Extract Basic Information - Terms and Conditions from Bill of Lading',
                instruction: 'Extract Basic Information - Terms and Conditions from Bill of Lading',
                isHidden: false,
                _id: '6864ab6da3e147ab5b8e7d3f'
            },
            {
                name: 'Signature',
                dataType: 'str',
                jsonKey: 'signature',
                required: false,
                excludeExtraction: false,
                description: 'Extract Basic Information - Signature from Bill of Lading',
                instruction: 'Extract Basic Information - Signature from Bill of Lading',
                isHidden: false,
                _id: '6864ab6da3e147ab5b8e7d40'
            },
            {
                name: 'Special Instructions',
                dataType: 'str',
                jsonKey: 'special_instructions',
                required: false,
                excludeExtraction: false,
                description: 'Extract Basic Information - Special Instructions from Bill of Lading',
                instruction: 'Extract Basic Information - Special Instructions from Bill of Lading',
                isHidden: false,
                _id: '6864ab6da3e147ab5b8e7d41'
            }
        ],
        _id: '6864ab6da3e147ab5b8e7d38'
    }
];
