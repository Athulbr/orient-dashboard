export function dataMapper(obj: any, path: string[]) {
    try {
        const result = path.reduce((current, key) => {
            if (current === undefined || current === null) {
                throw new Error('Invalid path');
            }

            return current[key];
        }, obj);

        if (result === undefined || result === null || result === '') {
            return 'N/A';
        }

        // Convert result to string
        return String(result);
    } catch (error) {
        return 'error';
    }
}
