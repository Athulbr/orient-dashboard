import React, { useState } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    RadialLinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Line, Bar, Pie, Doughnut, Radar, PolarArea } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, RadialLinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

interface Dataset {
    label: string;
    data: number[];
}

interface GraphComponentProps {
    labels?: string[];
    datasets?: Dataset[];
}

const GraphComponent: React.FC<GraphComponentProps> = ({ labels, datasets }) => {
    const [selectedType, setSelectedType] = useState('line');

    // Default props for demo
    const defaultLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const defaultDatasets = [
        {
            label: 'Sales 2024',
            data: [65, 59, 80, 81, 56, 55]
        },
        {
            label: 'Sales 2023',
            data: [45, 49, 60, 71, 46, 45]
        }
    ];

    const displayLabels = labels || defaultLabels;
    const displayDatasets = datasets || defaultDatasets;

    // Generate random colors
    const generateRandomColor = (opacity: number = 1) => {
        const r = Math.floor(Math.random() * 200 + 55);
        const g = Math.floor(Math.random() * 200 + 55);
        const b = Math.floor(Math.random() * 200 + 55);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };

    // Generate consistent colors for datasets
    const getDatasetColors = (count: number) => {
        const colors = [];
        for (let i = 0; i < count; i++) {
            const baseColor = generateRandomColor(1);
            const rgb = baseColor.match(/\d+/g);
            if (rgb) {
                colors.push({
                    border: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
                    bg: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.5)`
                });
            }
        }
        return colors;
    };

    // Generate colors for pie charts
    const getPieColors = (count: number) => {
        const colors = [];
        for (let i = 0; i < count; i++) {
            colors.push(generateRandomColor(0.9));
        }
        return colors;
    };

    const datasetColors = getDatasetColors(displayDatasets.length);
    const pieColors = getPieColors(displayLabels.length);

    // Prepare data for different chart types
    const getChartData = () => {
        if (['pie', 'doughnut', 'polarArea'].includes(selectedType)) {
            return {
                labels: displayLabels,
                datasets: [
                    {
                        label: displayDatasets[0]?.label || 'Data',
                        data: displayDatasets[0]?.data || [],
                        backgroundColor: pieColors,
                        borderColor: '#ffffff',
                        borderWidth: 3,
                        hoverOffset: selectedType === 'polarArea' ? 0 : 8
                    }
                ]
            };
        }

        return {
            labels: displayLabels,
            datasets: displayDatasets.map((dataset, index) => {
                const color = datasetColors[index % datasetColors.length];
                const baseConfig: any = {
                    label: dataset.label,
                    data: dataset.data,
                    borderColor: color.border
                };

                if (selectedType === 'line') {
                    return {
                        ...baseConfig,
                        backgroundColor: color.bg.replace('0.5', '0.1'),
                        tension: 0.4,
                        fill: true,
                        borderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    };
                } else if (selectedType === 'bar') {
                    return {
                        ...baseConfig,
                        backgroundColor: color.bg.replace('0.5', '0.85'),
                        borderWidth: 0,
                        borderRadius: 6
                    };
                } else if (selectedType === 'radar') {
                    return {
                        ...baseConfig,
                        backgroundColor: color.bg.replace('0.5', '0.2'),
                        borderWidth: 2,
                        pointRadius: 4,
                        pointBackgroundColor: color.border,
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: color.border
                    };
                }
                return baseConfig;
            })
        };
    };

    // Common options
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                position: 'bottom' as const,
                labels: {
                    padding: 15,
                    font: { size: 12 },
                    usePointStyle: true,
                    pointStyle: 'circle' as const,
                    color: '#374151'
                }
            },
            tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                padding: 12,
                titleColor: '#1f2937',
                bodyColor: '#374151',
                borderColor: 'rgba(0, 0, 0, 0.1)',
                borderWidth: 1
            }
        }
    };

    // Options for different chart types
    const getChartOptions = () => {
        if (['line', 'bar'].includes(selectedType)) {
            return {
                ...commonOptions,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        ticks: { color: '#6b7280', font: { size: 11 } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#6b7280', font: { size: 11 } }
                    }
                }
            };
        } else if (['radar', 'polarArea'].includes(selectedType)) {
            return {
                ...commonOptions,
                scales: {
                    r: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        ticks: {
                            color: '#6b7280',
                            font: { size: 10 },
                            backdropColor: 'transparent'
                        },
                        pointLabels: { color: '#6b7280', font: { size: 11 } }
                    }
                }
            };
        } else if (selectedType === 'doughnut') {
            return {
                ...commonOptions,
                cutout: '65%'
            };
        }
        return commonOptions;
    };

    // Render appropriate chart
    const renderChart = () => {
        const data = getChartData();
        const options = getChartOptions();

        switch (selectedType) {
            case 'line':
                return <Line data={data} options={options} />;
            case 'bar':
                return <Bar data={data} options={options} />;
            case 'pie':
                return <Pie data={data} options={options} />;
            case 'doughnut':
                return <Doughnut data={data} options={options} />;
            case 'radar':
                return <Radar data={data} options={options} />;
            case 'polarArea':
                return <PolarArea data={data} options={options} />;
            default:
                return null;
        }
    };

    const chartTypes = [
        { type: 'line', icon: '📈', name: 'Line', color: 'from-indigo-500 to-purple-500' },
        { type: 'bar', icon: '📊', name: 'Bar', color: 'from-blue-500 to-cyan-500' },
        { type: 'pie', icon: '🥧', name: 'Pie', color: 'from-pink-500 to-rose-500' },
        { type: 'doughnut', icon: '🍩', name: 'Doughnut', color: 'from-amber-500 to-orange-500' },
        { type: 'radar', icon: '🎯', name: 'Radar', color: 'from-green-500 to-emerald-500' },
        { type: 'polarArea', icon: '⭕', name: 'Polar', color: 'from-violet-500 to-purple-500' }
    ];

    const selectedChart = chartTypes.find(ct => ct.type === selectedType);

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 p-4 md:p-8">
            <div className=" mx-auto">
                <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-gray-200">
                    <h2 className="text-gray-800 font-semibold text-sm mb-4 flex items-center gap-2">
                        <span className="text-lg">🎨</span>
                        Chart Type
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {chartTypes.map(chart => (
                            <button
                                key={chart.type}
                                onClick={() => setSelectedType(chart.type)}
                                className={`relative overflow-hidden rounded-xl p-4 transition-all duration-300 ${
                                    selectedType === chart.type
                                        ? 'bg-gradient-to-br from-indigo-50 to-purple-50 ring-2 ring-indigo-500 scale-105 shadow-lg'
                                        : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                                }`}
                            >
                                {selectedType === chart.type && <div className={`absolute inset-0 bg-gradient-to-br ${chart.color} opacity-5`}></div>}
                                <div className="relative flex flex-col items-center gap-2">
                                    <span className="text-2xl">{chart.icon}</span>
                                    <span className={`text-xs font-medium ${selectedType === chart.type ? 'text-indigo-700' : 'text-gray-600'}`}>
                                        {chart.name}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Chart Card */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
                    <div className={`h-1.5 bg-gradient-to-r ${selectedChart?.color}`}></div>
                    <div className="p-8">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-gray-800 font-bold text-xl flex items-center gap-3">
                                <span className="text-3xl">{selectedChart?.icon}</span>
                                {selectedChart?.name} Chart
                            </h3>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                <span className="text-xs text-gray-500">Live</span>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl p-6 backdrop-blur-sm border border-gray-100">
                            <div className="h-96">{renderChart()}</div>
                        </div>
                    </div>
                </div>

                {/* Data Info */}
                <div className="mt-6 bg-white rounded-2xl p-6 border border-gray-200 shadow-lg">
                    <h3 className="text-gray-800 font-semibold text-sm mb-4 flex items-center gap-2">
                        <span>📊</span>
                        Data Overview
                    </h3>
                    <div className="space-y-3">
                        <div className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl p-4 border border-gray-100">
                            <p className="text-xs text-gray-600 mb-2 font-medium">Labels ({displayLabels.length})</p>
                            <p className="text-sm text-gray-800 font-mono break-words">{displayLabels.join(' · ')}</p>
                        </div>
                        {displayDatasets.map((dataset, index) => (
                            <div key={index} className="bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl p-4 border border-gray-100">
                                <p className="text-xs text-gray-600 mb-2 font-medium">{dataset.label}</p>
                                <p className="text-sm text-indigo-600 font-mono">{dataset.data.join(' · ')}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 text-center">
                    <p className="text-gray-500 text-sm">Built with Chart.js & react-chartjs-2 • Interactive visualization • Real-time updates</p>
                </div>
            </div>
        </div>
    );
};

export default GraphComponent;

const sampleRecord = {
    _id: '6954b9af236f206129a77bea',
    name: 'PO_Private_45049798224.pdf',
    templateId: {
        name: 'Purchase Order - Private',
        docType: 'purchase_order',
        primaryModel: 'openai',
        documentDateKey: '',
        documentNumberKey: ''
    },
    extractedData: {
        basic_details: {
            po_number: {
                value: '4504979822',
                bbox: {
                    x_min: 0.4188235294,
                    y_min: 0.1184848485,
                    x_max: 0.6415686275,
                    y_max: 0.1272727273
                },
                page: 1,
                confidence: 0.9791,
                index: 19,
                wordIndexes: [19, 20, 21]
            },
            total_amount: {
                value: 421.02,
                bbox: {
                    x_min: 0.9235294118,
                    y_min: 0.5893939394,
                    x_max: 0.9670588235,
                    y_max: 0.5972727273
                },
                page: 1,
                confidence: 0.9895,
                index: 348,
                wordIndexes: [348]
            }
        },
        line_items: [
            {
                sku_number: {
                    value: 'FEI-10-5676',
                    bbox: {
                        x_min: 0.2690196078,
                        y_min: 0.4412121212,
                        x_max: 0.3321568627,
                        y_max: 0.4506060606
                    },
                    page: 1,
                    confidence: 0.9423,
                    index: 262,
                    wordIndexes: [262, 263, 264]
                },
                quantity: {
                    value: 2,
                    bbox: {
                        x_min: 0.5933333333,
                        y_min: 0.4287878788,
                        x_max: 0.6019607843,
                        y_max: 0.4363636364
                    },
                    page: 1,
                    confidence: 0.9814,
                    index: 253,
                    wordIndexes: [253]
                },
                unit_price: {
                    value: 64.44,
                    bbox: {
                        x_min: 0.8062745098,
                        y_min: 0.4287878788,
                        x_max: 0.8380392157,
                        y_max: 0.4354545455
                    },
                    page: 1,
                    confidence: 0.969,
                    index: 256,
                    wordIndexes: [256]
                },
                total_price: {
                    value: 128.88,
                    bbox: {
                        x_min: 0.9298039216,
                        y_min: 0.4278787879,
                        x_max: 0.9674509804,
                        y_max: 0.4354545455
                    },
                    page: 1,
                    confidence: 0.9871,
                    index: 257,
                    wordIndexes: [257]
                }
            },
            {
                sku_number: {
                    value: 'FEI-10-5677',
                    bbox: {
                        x_min: 0.2694117647,
                        y_min: 0.4939393939,
                        x_max: 0.3317647059,
                        y_max: 0.5033333333
                    },
                    page: 1,
                    confidence: 0.964,
                    index: 295,
                    wordIndexes: [295, 296, 297]
                },
                quantity: {
                    value: 2,
                    bbox: {
                        x_min: 0.5933333333,
                        y_min: 0.4818181818,
                        x_max: 0.6019607843,
                        y_max: 0.4890909091
                    },
                    page: 1,
                    confidence: 0.9829,
                    index: 286,
                    wordIndexes: [286]
                },
                unit_price: {
                    value: 69.98,
                    bbox: {
                        x_min: 0.8058823529,
                        y_min: 0.4815151515,
                        x_max: 0.8380392157,
                        y_max: 0.4884848485
                    },
                    page: 1,
                    confidence: 0.9848,
                    index: 289,
                    wordIndexes: [289]
                },
                total_price: {
                    value: 139.96,
                    bbox: {
                        x_min: 0.9294117647,
                        y_min: 0.4812121212,
                        x_max: 0.9682352941,
                        y_max: 0.4884848485
                    },
                    page: 1,
                    confidence: 0.9915,
                    index: 290,
                    wordIndexes: [290]
                }
            }
        ]
    },
    status: 'extracted',
    extractedBy: 'vinayak admin  ',
    createdAt: '2025-12-31T05:50:39.126Z',
    updatedAt: '2025-12-31T05:50:39.126Z'
};
