export const safeJsonParse = <T>(jsonString: string): T | null => {
    try {
        // Remove markdown code block fences (``` or ```json)
        const cleaned = jsonString
            ?.trim()
            .replace(/^```(?:json)?/i, '') // remove starting ``` or ```json
            .replace(/```$/, ''); // remove ending ```

        const parsed = JSON.parse(cleaned);

        if (typeof parsed === 'object' && parsed !== null) {
            return parsed as T;
        }

        console.warn('Parsed value is not a valid object.');
        return null;
    } catch (error) {
        console.error('JSON parse error:', error);
        return null;
    }
};
