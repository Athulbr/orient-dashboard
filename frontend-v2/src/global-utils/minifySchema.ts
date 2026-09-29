export const minifySchema = (inputSchema: any) => {
    const result: any = {};
    const processSection = (sectionKey: any, sectionData: any) => {
        const sectionResult: any = {};
        if (sectionData.fields) {
            Object.keys(sectionData.fields).forEach((fieldKey: any) => {
                const field = sectionData.fields[fieldKey];
                sectionResult[fieldKey] = field.instruction || field.description || '';
            });
        }
        return sectionResult;
    };
    Object.keys(inputSchema).forEach((key: any) => {
        const section = inputSchema[key];
        result[key] = processSection(key, section);
    });
    return result;
};
