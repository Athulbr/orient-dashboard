import { PromptFieldIF } from '../../../prompt-tuning/interface';

type ReferenceField = {
    name: string;
    dataType: string;
    description: string;
    instruction: string;
    jsonKey: string;
    excludeExtraction: boolean;
    subFields?: ReferenceField[];
};

type TransformedField = {
    type: string;
    description: string;
    instruction: string;
    fields?: Record<string, TransformedField>;
    is_list?: boolean;
    item_fields?: Record<string, TransformedField>;
};

export function convertJSON(reference: PromptFieldIF[]): Record<string, any> {
    const transformed: Record<string, any> = { fields: {} };
    reference.forEach(field => {
        const { name, dataType, jsonKey, excludeExtraction, description, instruction, subFields } = field;
        const baseField: TransformedField = {
            type: dataType,
            description,
            instruction
        };
        if (subFields && dataType === 'dict') {
            baseField.fields = transformSubFields(subFields);
        } else if (subFields && dataType === 'list') {
            baseField.is_list = true;
            baseField.fields = transformSubFields(subFields);
        }
        if (!excludeExtraction) {
            transformed.fields[jsonKey] = baseField;
        }
    });

    return transformed;
}
function transformSubFields(subFields: ReferenceField[]): Record<string, TransformedField> {
    const subFieldResult: Record<string, TransformedField> = {};

    subFields.forEach(subField => {
        const { dataType, jsonKey, description, instruction, subFields: nestedSubFields, excludeExtraction } = subField;
        const transformedSubField: TransformedField = {
            type: dataType,
            description,
            instruction
        };

        if (nestedSubFields) {
            transformedSubField.fields = transformSubFields(nestedSubFields);
        }
        if (excludeExtraction) return null;
        subFieldResult[jsonKey] = transformedSubField;
    });

    return subFieldResult;
}
