import React from 'react';

const SkeletonLoader: React.FC = () => {
    return (
        <div className="h-full overflow-y-auto">
            <table className="min-w-full">
                <thead className="sticky top-0 left-0 border-b border-gray-100 bg-white text-nowrap">
                    <tr>
                        <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">Name</th>
                        <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">Extracted By</th>
                        <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">Template</th>
                        <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">Status</th>
                        <th className="px-5 py-4 text-left text-sm font-bold text-gray-800">Completed On</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                    {[...Array(15)].map((_, idx) => (
                        <tr key={idx} className="animate-pulse">
                            <td className="max-w-75 min-w-50 px-5 py-4">
                                <div className="h-4 w-55 rounded bg-gray-200" />
                            </td>
                            <td className="max-w-75 min-w-50 px-5 py-4">
                                <div className="h-4 w-26 rounded bg-gray-200" />
                            </td>
                            <td className="max-w-75 min-w-50 px-5 py-4">
                                <div className="h-4 w-30 rounded bg-gray-200" />
                            </td>
                            <td className="max-w-75 min-w-50 px-5 py-4">
                                <div className="h-6 w-20 rounded bg-gray-200" />
                            </td>
                            <td className="max-w-75 min-w-50 px-7 py-4">
                                <div className="h-4 w-24 rounded bg-gray-200" />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default SkeletonLoader;
