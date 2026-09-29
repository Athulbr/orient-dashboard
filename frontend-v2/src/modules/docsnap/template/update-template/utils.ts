export function convertLLMResponse(input: any) {
    return Object.entries(input).map(([key, value]) => {
        const isArray = Array.isArray(value);
        const firstElement = isArray ? value[0] : value;
        const { group_instruction, ...rest } = firstElement;

        const subFields = Object.entries(rest).map(([subKey, instruction]) => ({
            name: formatName(subKey),
            jsonKey: subKey,
            dataType: 'str',
            description: formatDescription(subKey),
            instruction,
            excludeExtraction: false,
            isHidden: false,
            required: false
        }));

        return {
            name: formatName(key),
            dataType: isArray ? 'list' : 'dict',
            jsonKey: key,
            subFields,
            description: key.replace(/_/g, ' '),
            instruction: group_instruction,
            excludeExtraction: false,
            isHidden: false
        };
    });
}

// helper to format names in Title Case
function formatName(key: string) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

// helper for descriptions (first word capitalized)
function formatDescription(key: string) {
    if (key.toLowerCase().includes('sku')) return 'SKU';
    return key.replace(/_/g, ' ');
}
