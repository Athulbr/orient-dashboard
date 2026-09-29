import React from 'react';

interface DataRendererProps {
    data: any;
    title?: string;
}

export const DataRenderer: React.FC<DataRendererProps> = ({ data, title }) => {
    if (!data) return null;

    // Render array as table
    const renderTable = (items: any[]) => {
        if (items.length === 0) return <p className="text-gray-500">No data available</p>;

        const headers = Object.keys(items[0]);

        return (
            <div className="overflow-x-auto">
                <table className="min-w-full border-collapse border border-gray-300">
                    <thead>
                        <tr className="bg-gray-100">
                            {headers.map(header => (
                                <th key={header} className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold text-gray-700">
                                    {header.replace(/_/g, ' ').toUpperCase()}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                                {headers.map(header => (
                                    <td key={header} className="border border-gray-300 px-4 py-2 text-sm text-gray-600">
                                        {renderValue(item[header])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    // Render object as key-value pairs
    const renderObject = (obj: Record<string, any>) => {
        return (
            <div className="space-y-2">
                {Object.entries(obj).map(([key, value]) => (
                    <div key={key} className="flex border-b border-gray-200 py-2">
                        <span className="w-1/3 font-semibold text-gray-700 text-sm">{key.replace(/_/g, ' ').toUpperCase()}:</span>
                        <span className="w-2/3 text-gray-600 text-sm">{renderValue(value)}</span>
                    </div>
                ))}
            </div>
        );
    };

    // Helper function to render values properly
    const renderValue = (value: any): string => {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    return (
        <div className="p-6 bg-white rounded-lg shadow-md">
            {title && <h2 className="text-xl font-bold mb-4 text-gray-800">{title}</h2>}
            {Array.isArray(data) ? renderTable(data) : renderObject(data)}
        </div>
    );
};
