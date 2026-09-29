import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

// --- Interfaces ---

interface ExcelColumn {
    columnName: string;
    jsonPath: string;
    javascript?: string;
}

interface ExcelSheetConfig {
    sheetName: string;
    columns: ExcelColumn[];
}

interface ExcelExportDialogNewIF {
    template: ExcelSheetConfig[];
    inputData: any[];
}

// --- Utility Functions ---

/**
 * HELPER: Safely access deeply nested objects/arrays.
 * e.g. getDeepValue(record, "extra.hobbies") -> [{...}, {...}]
 */
const getDeepValue = (obj: any, path: string): any => {
    if (!path || !obj) return undefined;
    return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
};

/**
 * Calculate column width based on content
 */
const calculateColumnWidth = (data: any[][], columnIndex: number, headerText: string): number => {
    try {
        // Start with header length
        let maxLength = headerText.length;

        // Check all data rows for this column
        for (let i = 1; i < data.length; i++) {
            if (data[i] && data[i][columnIndex]) {
                const cellValue = String(data[i][columnIndex]);
                maxLength = Math.max(maxLength, cellValue.length);
            }
        }

        // Add padding and cap the width
        const calculatedWidth = Math.min(Math.max(maxLength + 2, 10), 50);
        return calculatedWidth;
    } catch (error) {
        console.error('Error calculating column width:', error);
        return 20; // fallback to default
    }
};

/**
 * Extracts data from the record based on the path.
 */
const getValueFromPath = (record: any, path: string, arrayIndex: number = 0): string | number => {
    if (!path) return '';

    try {
        // INFERENCE: Check if this path targets an array item
        if (path.includes('[*]')) {
            const [arrayPath, propertyPath] = path.split('[*].');

            // 1. Get the Array deeply (FIXED: Handles nested arrays like 'extra.hobbies')
            let arrayData;
            if (arrayPath === '') {
                arrayData = record;
            } else {
                arrayData = getDeepValue(record, arrayPath);
            }

            // 2. Check if array exists and has an item at the specific visual row index
            if (Array.isArray(arrayData) && arrayData[arrayIndex]) {
                const itemAtIndex = arrayData[arrayIndex];

                // 3. If there is a nested property path (e.g., "name.value"), resolve it deeply
                if (propertyPath) {
                    return getDeepValue(itemAtIndex, propertyPath) ?? '';
                }
                // 4. If no property path, return the primitive value
                return itemAtIndex;
            }
            return '';
        } else {
            // Handle Standard Object Logic
            return getDeepValue(record, path) ?? '';
        }
    } catch (error) {
        console.error('Error getting value from path:', error);
        return '';
    }
};

/**
 * Resolves the value for a cell, prioritizing custom JavaScript logic
 */
const resolveCellValue = (record: any, column: ExcelColumn, arrayIndex: number = 0): string => {
    try {
        if (column.javascript) {
            try {
                const customFunc = new Function('data', `return (${column.javascript})(data)`);
                const result = customFunc(record);
                return result === null || result === undefined ? '' : String(result);
            } catch (jsError) {
                console.error('JavaScript evaluation error:', jsError);
                return 'JS Error';
            }
        }
        const val = getValueFromPath(record, column.jsonPath, arrayIndex);
        return val === null || val === undefined ? '' : String(val);
    } catch (error) {
        console.error('Error resolving cell value:', error);
        return 'Error';
    }
};

const getColumnLetter = (colIndex: number): string => {
    let letter = '';
    while (colIndex >= 0) {
        letter = String.fromCharCode((colIndex % 26) + 65) + letter;
        colIndex = Math.floor(colIndex / 26) - 1;
    }
    return letter;
};

// --- Error Boundary Component ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Excel Export Error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="bg-red-50 border border-red-300 rounded p-6 m-4">
                    <h2 className="text-red-800 text-lg font-bold mb-2">Something went wrong</h2>
                    <p className="text-red-600 text-sm mb-4">{this.state.error?.message || 'An unexpected error occurred'}</p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

// --- Component ---

const ExcelExportDialogNew: React.FC<ExcelExportDialogNewIF> = ({ template, inputData }) => {
    const [activeSheetIndex, setActiveSheetIndex] = useState(0);
    const [downloadError, setDownloadError] = useState<string | null>(null);

    // const inputData: any[] = [
    //     {
    //         name: 'John Doe',
    //         email: 'john@example_john@example_john@example.com',
    //         age: 30,
    //         address: {
    //             street: '123 Main St',
    //             city: 'Anytown'
    //         },
    //         games: [
    //             { name: 'chess', type: 'indoor' },
    //             { name: 'swimming', type: 'outdoor' }
    //         ],
    //         extra: {
    //             hobbies: [
    //                 { name: { value: 'writing' }, type: { value: 'indoor' } },
    //                 { name: { value: 'basketball' }, type: { value: 'outdoor' } }
    //             ]
    //         },
    //         test: {
    //             test1: {
    //                 test2: [{ test3: 'A1' }, { test3: 'A2' }]
    //             }
    //         }
    //     },

    //     // Missing some game properties
    //     {
    //         name: 'Kiran',
    //         email: 'kiran@example.com',
    //         age: 25,
    //         address: {
    //             street: '456 Oak Ave',
    //             city: 'Othertown'
    //         },
    //         games: [
    //             { name: 'cooking', type: 'indoor' },
    //             { name: 'traveling' }, // type missing
    //             { type: 'outdoor' } // name missing
    //         ],
    //         extra: {
    //             hobbies: [
    //                 { name: { value: 'painting' }, type: { value: 'indoor' } },
    //                 { name: { value: 'cycling' }, type: { value: 'outdoor' } }
    //             ]
    //         },
    //         test: {
    //             test1: {
    //                 test2: [{ test3: 'B1' }]
    //             }
    //         }
    //     },

    //     // Missing email, missing nested hobby type
    //     {
    //         name: 'Aarav',
    //         email: null,
    //         age: 28,
    //         address: {
    //             street: null,
    //             city: 'Bengaluru'
    //         },
    //         games: [],
    //         extra: {
    //             hobbies: [
    //                 { name: { value: 'gardening' }, type: null },
    //                 { name: null, type: { value: 'indoor' } }
    //             ]
    //         },
    //         test: {
    //             test1: {
    //                 test2: [] // empty test array
    //             }
    //         }
    //     },

    //     // Missing address, missing hobbies entirely
    //     {
    //         name: 'Sophia',
    //         email: 'sophia@example.com',
    //         age: null,
    //         address: null,
    //         games: [{ name: 'piano', type: 'indoor' }],
    //         extra: {},
    //         test: {
    //             test1: {
    //                 test2: [
    //                     { test3: null } // null test value
    //                 ]
    //             }
    //         }
    //     },

    //     // Nested objects missing inside test structure
    //     {
    //         name: 'Rohan',
    //         email: 'rohan@example.com',
    //         age: 22,
    //         address: {
    //             street: 'MG Road',
    //             city: null
    //         },
    //         games: [{ name: 'carrom', type: 'indoor' }],
    //         extra: {
    //             hobbies: [
    //                 { name: { value: 'music' } }, // type missing
    //                 { type: { value: 'outdoor' } } // name missing
    //             ]
    //         },
    //         test: {
    //             test1: null // entire branch missing
    //         }
    //     },

    //     // Several fields missing
    //     {
    //         name: 'Emily Watson',
    //         email: undefined,
    //         age: 31,
    //         address: {
    //             street: 'Sunset Blvd',
    //             city: 'Los Angeles'
    //         },
    //         games: [
    //             { name: 'tennis' } // type missing
    //         ],
    //         extra: {},
    //         test: {
    //             test1: {
    //                 test2: [{ test3: 'E1' }]
    //             }
    //         }
    //     },

    //     // Almost everything missing
    //     {
    //         name: 'Unknown User',
    //         email: null,
    //         age: null,
    //         address: null,
    //         games: null,
    //         extra: null,
    //         test: null
    //     },

    //     // Edge case hobby: missing value inside name
    //     {
    //         name: 'Zara Khan',
    //         email: 'zara@example.com',
    //         age: 26,
    //         address: {
    //             street: 'Hill Top',
    //             city: 'Hyderabad'
    //         },
    //         games: [{ name: 'table tennis' }],
    //         extra: {
    //             hobbies: [
    //                 { name: { value: 'crafting' } }, // missing type
    //                 { type: { value: 'outdoor' } } // missing name
    //             ]
    //         },
    //         test: {
    //             test1: {
    //                 test2: [{ test3: 'Z1' }]
    //             }
    //         }
    //     }
    // ];

    // const template: ExcelSheetConfig[] = [
    //     {
    //         sheetName: 'Sheet 1 (Games)',
    //         columns: [
    //             { columnName: 'Name', jsonPath: 'name' },
    //             { columnName: 'Email', jsonPath: 'email' },

    //             {
    //                 columnName: 'Name with Email',
    //                 jsonPath: '',
    //                 javascript: `
    //                 function(data){
    //                     return (data?.name || "UNKNOWN") + "_" + (data?.email || "N/A");
    //                 }
    //             `
    //             },

    //             // Games array
    //             { columnName: 'Game Name', jsonPath: 'games[*].name' },
    //             { columnName: 'Game Type', jsonPath: 'games[*].type' },

    //             // Deep nested test path
    //             { columnName: 'Test Value', jsonPath: 'test.test1.test2[*].test3' }
    //         ]
    //     },

    //     {
    //         sheetName: 'Sheet 2 (Nested Hobbies)',
    //         columns: [
    //             { columnName: 'Name', jsonPath: 'name' },
    //             { columnName: 'Age', jsonPath: 'age' },

    //             // Hobby paths (1 nested array only)
    //             { columnName: 'Hobby Name', jsonPath: 'extra.hobbies[*].name.value' },
    //             { columnName: 'Hobby Type', jsonPath: 'extra.hobbies[*].type.value' },

    //             // verify test again
    //             { columnName: 'Test Value', jsonPath: 'test.test1.test2[*].test3' }
    //         ]
    //     }
    // ];

    const activeSheet = template[activeSheetIndex] || template[0];

    // --- Logic: Calculate Visual Rows ---
    const renderedRows = useMemo(() => {
        try {
            let globalRowCounter = 0;

            return inputData
                .map(record => {
                    // Determine max height based on any column containing '[*]'
                    const maxSubRows = Math.max(
                        1,
                        ...activeSheet.columns
                            .filter(col => col.jsonPath && col.jsonPath.includes('[*]'))
                            .map(col => {
                                const arrayKey = col.jsonPath.split('[*]')[0];
                                const arr = getDeepValue(record, arrayKey);
                                return Array.isArray(arr) ? arr.length : 0;
                            })
                    );

                    const rowsForThisRecord = Array.from({ length: maxSubRows }).map((_, subIndex) => {
                        globalRowCounter++;
                        return {
                            subIndex,
                            isFirstSubRow: subIndex === 0,
                            rowNumber: globalRowCounter,
                            record,
                            rowSpan: maxSubRows
                        };
                    });

                    return rowsForThisRecord;
                })
                .flat();
        } catch (error) {
            console.error('Error rendering rows:', error);
            return [];
        }
    }, [inputData, activeSheet]);

    const handleDownloadJson = () => {
        try {
            setDownloadError(null);

            const sheetConfig = activeSheet; // Use activeSheet instead of template[0]
            const sheetData: any[] = [];

            inputData.forEach(record => {
                const maxSubRows = Math.max(
                    1,
                    ...sheetConfig.columns
                        .filter(col => col.jsonPath && col.jsonPath.includes('[*]'))
                        .map(col => {
                            const arrayKey = col.jsonPath.split('[*]')[0];
                            const arr = getDeepValue(record, arrayKey);
                            return Array.isArray(arr) ? arr.length : 0;
                        })
                );

                for (let i = 0; i < maxSubRows; i++) {
                    const row: Record<string, any> = {};

                    sheetConfig.columns.forEach(col => {
                        const isArrayCol = col.jsonPath && col.jsonPath.includes('[*]');
                        if (!isArrayCol && i > 0) {
                            row[col.columnName] = '';
                        } else {
                            row[col.columnName] = resolveCellValue(record, col, i);
                        }
                    });

                    sheetData.push(row);
                }
            });

            // Convert to JSON string with formatting
            const jsonString = JSON.stringify(sheetData, null, 2);

            // Create a Blob and download
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'Record_Export.json';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download error:', error);
            setDownloadError(error instanceof Error ? error.message : 'Failed to download file');
        }
    };

    // --- Logic: Handle Download ---
    const handleDownload = () => {
        try {
            setDownloadError(null);
            const workbook = XLSX.utils.book_new();

            template.forEach(sheetConfig => {
                const headers = sheetConfig.columns.map(col => col.columnName);
                const sheetData: any[][] = [headers];
                const merges: XLSX.Range[] = [];

                let currentRowIdx = 1;

                inputData.forEach(record => {
                    const maxSubRows = Math.max(
                        1,
                        ...sheetConfig.columns
                            .filter(col => col.jsonPath && col.jsonPath.includes('[*]'))
                            .map(col => {
                                const arrayKey = col.jsonPath.split('[*]')[0];
                                const arr = getDeepValue(record, arrayKey);
                                return Array.isArray(arr) ? arr.length : 0;
                            })
                    );

                    for (let i = 0; i < maxSubRows; i++) {
                        const row = sheetConfig.columns.map(col => {
                            const isArrayCol = col.jsonPath && col.jsonPath.includes('[*]');
                            if (!isArrayCol && i > 0) return '';
                            return resolveCellValue(record, col, i);
                        });
                        sheetData.push(row);
                    }

                    if (maxSubRows > 1) {
                        sheetConfig.columns.forEach((col, colIdx) => {
                            const isArrayCol = col.jsonPath && col.jsonPath.includes('[*]');
                            if (!isArrayCol) {
                                merges.push({
                                    s: { r: currentRowIdx, c: colIdx },
                                    e: { r: currentRowIdx + maxSubRows - 1, c: colIdx }
                                });
                            }
                        });
                    }
                    currentRowIdx += maxSubRows;
                });

                const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
                worksheet['!merges'] = merges;

                // FIXED: Dynamic column width calculation based on content
                worksheet['!cols'] = sheetConfig.columns.map((col, idx) => ({
                    wch: calculateColumnWidth(sheetData, idx, col.columnName)
                }));

                XLSX.utils.book_append_sheet(workbook, worksheet, sheetConfig.sheetName);
            });

            XLSX.writeFile(workbook, 'Record_Export.xlsx');
        } catch (error) {
            console.error('Download error:', error);
            setDownloadError(error instanceof Error ? error.message : 'Failed to download file');
        }
    };

    return (
        <ErrorBoundary>
            <div className="bg-gray-200 font-sans flex flex-col items-center overflow-y-auto max-h-screen">
                {/* Error Message Display */}
                {downloadError && (
                    <div className="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg z-50 max-w-md">
                        <div className="flex items-start">
                            <div className="flex-1">
                                <p className="font-bold">Download Error</p>
                                <p className="text-sm">{downloadError}</p>
                            </div>
                            <button onClick={() => setDownloadError(null)} className="ml-4 text-red-700 hover:text-red-900">
                                ×
                            </button>
                        </div>
                    </div>
                )}

                {/* Main Excel Container */}
                <div className="w-full bg-white shadow-2xl border border-gray-400 flex flex-col overflow-y-auto max-h-screen">
                    {/* 1. Header Toolbar */}
                    <div className="bg-[#107c41] text-white px-4 py-3 text-sm font-semibold flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                            </svg>
                            <span>Excel Preview</span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleDownloadJson}
                                className="bg-[#185c37] hover:bg-[#0c4425] cursor-pointer px-4 py-1.5 rounded text-xs border border-green-500 transition-colors shadow-sm"
                            >
                                Download JSON
                            </button>
                            <button
                                onClick={handleDownload}
                                className="bg-[#185c37] hover:bg-[#0c4425] cursor-pointer px-4 py-1.5 rounded text-xs border border-green-500 transition-colors shadow-sm"
                            >
                                Download .XLSX
                            </button>
                        </div>
                    </div>

                    {/* 2. Formula Bar Simulation (Visual only) */}
                    <div className="bg-gray-50 border-b border-gray-300 px-0.5 py-1 flex items-center gap-2 shrink-0">
                        <div className="bg-white border border-gray-300 rounded px-1 py-1.5 text-xs text-gray-500 w-9 text-center">A1</div>
                        <div className="h-4 w-px bg-gray-300"></div>
                        <div className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-700 w-full flex items-center font-mono">
                            <span className="text-gray-400 mr-2">fx</span> {activeSheet.sheetName}
                        </div>
                    </div>

                    {/* 3. Grid Container (Scrollable) */}
                    <div className="overflow-auto flex-grow bg-white relative">
                        <table className="border-collapse text-sm text-left w-full table-fixed min-w-[800px]">
                            <thead className="sticky top-0 z-10">
                                {/* Row 1: Excel Column Letters */}
                                <tr className="bg-gray-100 text-gray-600 text-center font-semibold text-xs border-b border-gray-300">
                                    <th className="w-10 border-r border-gray-300 bg-gray-100 sticky left-0 z-20"></th>
                                    {activeSheet.columns.map((_, idx) => (
                                        <th key={`letter-${idx}`} className="border-r border-gray-300 py-1 font-normal w-60">
                                            {getColumnLetter(idx)}
                                        </th>
                                    ))}
                                    <th className="w-full bg-gray-100 border-b border-gray-300"></th>
                                </tr>

                                {/* Row 2: Actual Headers */}
                                <tr className="border-b border-gray-300">
                                    <th className="bg-gray-100 border-r border-gray-300 w-10 text-center text-gray-500 font-normal sticky left-0 z-20">1</th>
                                    {activeSheet.columns.map((col, idx) => (
                                        <th
                                            key={`header-${idx}`}
                                            className="border-r border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-800 font-bold text-xs select-none"
                                        >
                                            {col.columnName}
                                        </th>
                                    ))}
                                    <th className="bg-gray-50 border-b border-gray-300"></th>
                                </tr>
                            </thead>

                            <tbody>
                                {renderedRows.map((rowObj, uniqueRowKey) => (
                                    <tr key={uniqueRowKey} className="group h-8">
                                        {/* Row Number */}
                                        <td className="bg-gray-100 border-r border-b border-gray-300 text-center text-gray-500 text-xs select-none sticky left-0 font-sans">
                                            {rowObj.rowNumber + 1}
                                        </td>

                                        {activeSheet.columns.map((col, colIdx) => {
                                            const isArrayCol = col.jsonPath && col.jsonPath.includes('[*]');

                                            if (!isArrayCol) {
                                                if (rowObj.isFirstSubRow) {
                                                    return (
                                                        <td
                                                            key={`${uniqueRowKey}-${colIdx}`}
                                                            rowSpan={rowObj.rowSpan}
                                                            className="border-r border-b border-gray-200 px-3 py-1 align-top bg-white text-gray-800 break-all"
                                                        >
                                                            {resolveCellValue(rowObj.record, col)}
                                                        </td>
                                                    );
                                                } else {
                                                    return null;
                                                }
                                            } else {
                                                return (
                                                    <td
                                                        key={`${uniqueRowKey}-${colIdx}`}
                                                        className="border-r border-b border-gray-200 px-3 py-1 bg-white text-gray-600 break-all"
                                                    >
                                                        {resolveCellValue(rowObj.record, col, rowObj.subIndex)}
                                                    </td>
                                                );
                                            }
                                        })}
                                        <td className="border-b border-gray-200"></td>
                                    </tr>
                                ))}
                                {/* Empty rows filler for visual aesthetics */}
                                {Array.from({ length: 20 }).map((_, i) => (
                                    <tr key={`filler-${i}`} className="h-8">
                                        <td className="bg-gray-100 border-r border-b border-gray-300 sticky left-0 text-center text-xs text-gray-400">
                                            {renderedRows.length + i + 2}
                                        </td>
                                        {activeSheet.columns.map((_, idx) => (
                                            <td key={idx} className="border-r border-b border-gray-200"></td>
                                        ))}
                                        <td className="border-b border-gray-200"></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* 4. Sheet Tabs Bar */}
                    <div className="bg-gray-200 border-t border-gray-300 px-1 pt-1 flex items-end gap-1 shrink-0 overflow-x-auto">
                        {/* Tab Scrollers (Visual) */}
                        <div className="flex gap-1 px-2 pb-2 text-gray-500">
                            <button className="hover:text-black">◄</button>
                            <button className="hover:text-black">►</button>
                        </div>

                        {/* Dynamic Sheets */}
                        {template.map((sheet, idx) => (
                            <button
                                key={idx}
                                onClick={() => setActiveSheetIndex(idx)}
                                className={`
                                    px-4 py-1.5 text-sm rounded-t-sm border-t border-x focus:outline-none transition-all
                                    ${
                                        activeSheetIndex === idx
                                            ? 'bg-white border-gray-300 text-green-700 font-bold border-b-2 border-b-white translate-y-[1px] shadow-sm'
                                            : 'bg-gray-200 border-transparent text-gray-600 hover:bg-gray-300 hover:text-black'
                                    }
                                `}
                            >
                                {sheet.sheetName}
                            </button>
                        ))}
                    </div>

                    {/* 5. Footer Status Bar */}
                    <div className="bg-[#f0f0f0] border-t border-gray-300 px-4 py-1 text-xs text-green-700 flex justify-between items-center shrink-0">
                        <span>Ready</span>
                        <div className="flex gap-4">
                            <span>Page Layout</span>
                            <span>Normal</span>
                        </div>
                    </div>
                </div>
            </div>
        </ErrorBoundary>
    );
};

export default ExcelExportDialogNew;
