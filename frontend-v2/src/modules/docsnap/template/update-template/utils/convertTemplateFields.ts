type OutputJson = Record<string, any>;

export const convertTemplateFields = (input: any[]): OutputJson => {
    const output: OutputJson = {};

    input.forEach(field => {
        // Skip if no jsonKey; cannot index output with undefined
        if (!field.jsonKey) return;
        if (field.dataType === 'dict') {
            // Dict -> object with group_instruction + subfields
            const dictObj: OutputJson = {
                group_instruction: field.instruction
            };

            if (field.subFields?.length) {
                field.subFields.forEach((sub: any) => {
                    if (!sub.jsonKey) return; // ensure key is defined
                    dictObj[sub.jsonKey] = sub.instruction;
                });
            }

            output[field.jsonKey] = dictObj;
        } else if (field.dataType === 'list') {
            // List -> array with one object containing table_instruction + subfields
            const listObj: OutputJson = {
                table_instruction: field.instruction
            };

            if (field.subFields?.length) {
                field.subFields.forEach((sub: any) => {
                    if (!sub.jsonKey) return; // ensure key is defined
                    listObj[sub.jsonKey] = sub.instruction;
                });
            }

            output[field.jsonKey] = [listObj];
        } else {
            // Primitive field (rare case)
            output[field.jsonKey] = field.instruction;
        }
    });

    return output;
};
