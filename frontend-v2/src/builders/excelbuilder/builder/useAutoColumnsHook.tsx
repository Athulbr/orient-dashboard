import { capitalize } from 'lodash';
import { ExcelSheetConfig, ExcelColumnIF } from '.';

const generateId = () => Math.random().toString(36).substr(2, 9);

const normalizePath = (path: string) => {
    return path.replace(/\[\d+\]/g, '[*]');
};

interface UseAutoColumnsProps {
    inputData: any;
    sheets: ExcelSheetConfig[];
    setSheets: React.Dispatch<React.SetStateAction<ExcelSheetConfig[]>>;
    activeSheetIndex?: number;
}

export const useAutoColumns = ({ inputData }: UseAutoColumnsProps): ExcelColumnIF[] => {
    const detectedPaths = new Set<string>();

    if (!inputData || !Array.isArray(inputData)) {
        return [];
    }

    inputData.forEach(item => {
        const traverseData = (data: any, path: string = '') => {
            if (data === null || data === undefined) {
                return;
            }

            const isObject = data !== null && typeof data === 'object';
            const isArray = Array.isArray(data);

            if (!isObject) {
                const pathParts = path.split('.');
                const lastKey = pathParts[pathParts.length - 1]?.replace(/\[\d+\]/, '');

                if (lastKey === 'value') {
                    const normalizedPath = normalizePath(path);
                    detectedPaths.add(normalizedPath);
                }
                return;
            }

            Object.keys(data).forEach(key => {
                const currentPath = path ? (isArray ? `${path}[${key}]` : `${path}.${key}`) : key;
                traverseData(data[key], currentPath);
            });
        };

        traverseData(item);
    });

    const newColumns: ExcelColumnIF[] = Array.from(detectedPaths).map(path => {
        const pathParts = path.split('.');
        const parentKey = pathParts.length > 1 ? pathParts[pathParts.length - 2]?.replace(/\[\*\]/, '') : 'Column';
        const columnName = capitalize(parentKey.replace(/_/g, ' '));

        return {
            id: generateId(),
            columnName,
            jsonPath: path
        };
    });

    return newColumns;
};
