import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface AnalyticsComponentIF {
    test?: string;
}

const sampleRecords = [
    // April Data
    {
        _id: 'rec15',
        name: 'doc15.pdf',
        documentType: 'Invoice',
        createdAt: '2025-04-03T10:00:00.000Z',
        extractedData: { po_number: { value: '201', confidence: 0.94 }, total: { value: 180.0, confidence: 0.97 } }
    },
    {
        _id: 'rec16',
        name: 'doc16.pdf',
        documentType: 'PO',
        createdAt: '2025-04-08T11:00:00.000Z',
        extractedData: { po_number: { value: '202', confidence: 0.9 }, total: { value: 400.0, confidence: 0.95 } }
    },
    {
        _id: 'rec17',
        name: 'doc17.pdf',
        documentType: 'Receipt',
        createdAt: '2025-04-15T12:00:00.000Z',
        extractedData: { po_number: null, total: { value: 90.0, confidence: 0.92 } }
    },
    {
        _id: 'rec18',
        name: 'doc18.pdf',
        documentType: 'Invoice',
        createdAt: '2025-04-22T13:00:00.000Z',
        extractedData: { po_number: { value: '204', confidence: 0.88 }, total: { value: 220.0, confidence: 0.93 } }
    },
    {
        _id: 'rec24',
        name: 'doc24.pdf',
        documentType: 'Credit Note',
        createdAt: '2025-04-25T09:00:00.000Z',
        extractedData: { po_number: { value: '205', confidence: 0.91 }, total: { value: 50.0, confidence: 0.99 } }
    },
    {
        _id: 'rec25',
        name: 'doc25.pdf',
        documentType: 'Invoice',
        createdAt: '2025-04-28T11:00:00.000Z',
        extractedData: { po_number: { value: '206', confidence: 0.92 }, total: { value: 210.0, confidence: 0.96 } }
    },

    // May Data
    {
        _id: 'rec1',
        name: 'doc1.pdf',
        documentType: 'Invoice',
        createdAt: '2025-05-01T10:00:00.000Z',
        extractedData: { po_number: { value: '123', confidence: 0.95 }, total: { value: 150.0, confidence: 0.98 } }
    },
    {
        _id: 'rec2',
        name: 'doc2.pdf',
        documentType: 'Receipt',
        createdAt: '2025-05-05T11:00:00.000Z',
        extractedData: { po_number: { value: '456', confidence: 0.92 }, total: { value: 75.5, confidence: 0.96 } }
    },
    {
        _id: 'rec3',
        name: 'doc3.pdf',
        documentType: 'Invoice',
        createdAt: '2025-05-10T12:00:00.000Z',
        extractedData: { po_number: { value: '789', confidence: 0.98 }, total: { value: 300.0, confidence: 0.99 } }
    },
    {
        _id: 'rec4',
        name: 'doc4.pdf',
        documentType: 'PO',
        createdAt: '2025-05-15T13:00:00.000Z',
        extractedData: { po_number: null, total: { value: 500.0, confidence: 0.9 } }
    },
    {
        _id: 'rec5',
        name: 'doc5.pdf',
        documentType: 'Invoice',
        createdAt: '2025-05-20T14:00:00.000Z',
        extractedData: { po_number: { value: '101', confidence: 0.85 }, total: { value: 250.0, confidence: 0.92 } }
    },
    {
        _id: 'rec26',
        name: 'doc26.pdf',
        documentType: 'Credit Note',
        createdAt: '2025-05-22T10:00:00.000Z',
        extractedData: { po_number: { value: '207', confidence: 0.9 }, total: { value: 60.0, confidence: 0.98 } }
    },
    {
        _id: 'rec27',
        name: 'doc27.pdf',
        documentType: 'Receipt',
        createdAt: '2025-05-25T15:00:00.000Z',
        extractedData: { po_number: { value: '208', confidence: 0.87 }, total: { value: 80.0, confidence: 0.91 } }
    },

    // June Data
    {
        _id: 'rec6',
        name: 'doc6.pdf',
        documentType: 'Receipt',
        createdAt: '2025-06-02T10:00:00.000Z',
        extractedData: { po_number: { value: '112', confidence: 0.96 }, total: { value: 120.0, confidence: 0.97 } }
    },
    {
        _id: 'rec7',
        name: 'doc7.pdf',
        documentType: 'Invoice',
        createdAt: '2025-06-08T11:00:00.000Z',
        extractedData: { po_number: { value: '113', confidence: 0.93 }, total: { value: 85.0, confidence: 0.95 } }
    },
    {
        _id: 'rec8',
        name: 'doc8.pdf',
        documentType: 'PO',
        createdAt: '2025-06-12T12:00:00.000Z',
        extractedData: { po_number: { value: '114', confidence: 0.99 }, total: { value: 450.0, confidence: 0.99 } }
    },
    {
        _id: 'rec9',
        name: 'doc9.pdf',
        documentType: 'Receipt',
        createdAt: '2025-06-18T13:00:00.000Z',
        extractedData: { po_number: null, total: { value: 60.0, confidence: 0.88 } }
    },
    {
        _id: 'rec10',
        name: 'doc10.pdf',
        documentType: 'Invoice',
        createdAt: '2025-06-25T14:00:00.000Z',
        extractedData: { po_number: { value: '115', confidence: 0.89 }, total: { value: 210.0, confidence: 0.94 } }
    },
    {
        _id: 'rec11',
        name: 'doc11.pdf',
        documentType: 'Invoice',
        createdAt: '2025-06-28T15:00:00.000Z',
        extractedData: { po_number: { value: '116', confidence: 0.94 }, total: { value: 320.0, confidence: 0.96 } }
    },
    {
        _id: 'rec28',
        name: 'doc28.pdf',
        documentType: 'Credit Note',
        createdAt: '2025-06-05T09:00:00.000Z',
        extractedData: { po_number: { value: '209', confidence: 0.93 }, total: { value: 40.0, confidence: 0.97 } }
    },
    {
        _id: 'rec29',
        name: 'doc29.pdf',
        documentType: 'Invoice',
        createdAt: '2025-06-15T16:00:00.000Z',
        extractedData: { po_number: { value: '210', confidence: 0.99 }, total: { value: 310.0, confidence: 0.98 } }
    },

    // July Data
    {
        _id: 'rec12',
        name: 'doc12.pdf',
        documentType: 'PO',
        createdAt: '2025-07-01T10:00:00.000Z',
        extractedData: { po_number: { value: '117', confidence: 0.97 }, total: { value: 180.0, confidence: 0.98 } }
    },
    {
        _id: 'rec13',
        name: 'doc13.pdf',
        documentType: 'Receipt',
        createdAt: '2025-07-05T11:00:00.000Z',
        extractedData: { po_number: { value: '118', confidence: 0.91 }, total: { value: 95.0, confidence: 0.93 } }
    },
    {
        _id: 'rec14',
        name: 'doc14.pdf',
        documentType: 'Invoice',
        createdAt: '2025-07-09T12:00:00.000Z',
        extractedData: { po_number: { value: '119', confidence: 0.99 }, total: { value: 600.0, confidence: 0.99 } }
    },
    {
        _id: 'rec30',
        name: 'doc30.pdf',
        documentType: 'Credit Note',
        createdAt: '2025-07-12T09:00:00.000Z',
        extractedData: { po_number: { value: '211', confidence: 0.92 }, total: { value: 55.0, confidence: 0.95 } }
    },
    {
        _id: 'rec31',
        name: 'doc31.pdf',
        documentType: 'Invoice',
        createdAt: '2025-07-20T14:00:00.000Z',
        extractedData: { po_number: { value: '212', confidence: 0.96 }, total: { value: 275.0, confidence: 0.97 } }
    },
    {
        _id: 'rec32',
        name: 'doc32.pdf',
        documentType: 'Receipt',
        createdAt: '2025-07-25T15:00:00.000Z',
        extractedData: { po_number: { value: '213', confidence: 0.94 }, total: { value: 85.0, confidence: 0.93 } }
    },

    // August Data
    {
        _id: 'rec19',
        name: 'doc19.pdf',
        documentType: 'Receipt',
        createdAt: '2025-08-01T10:00:00.000Z',
        extractedData: { po_number: { value: '301', confidence: 0.96 }, total: { value: 110.0, confidence: 0.97 } }
    },
    {
        _id: 'rec20',
        name: 'doc20.pdf',
        documentType: 'Invoice',
        createdAt: '2025-08-07T11:00:00.000Z',
        extractedData: { po_number: { value: '302', confidence: 0.92 }, total: { value: 230.0, confidence: 0.95 } }
    },
    {
        _id: 'rec21',
        name: 'doc21.pdf',
        documentType: 'PO',
        createdAt: '2025-08-14T12:00:00.000Z',
        extractedData: { po_number: { value: '303', confidence: 0.98 }, total: { value: 550.0, confidence: 0.99 } }
    },
    {
        _id: 'rec22',
        name: 'doc22.pdf',
        documentType: 'Invoice',
        createdAt: '2025-08-20T13:00:00.000Z',
        extractedData: { po_number: null, total: { value: 330.0, confidence: 0.91 } }
    },
    {
        _id: 'rec23',
        name: 'doc23.pdf',
        documentType: 'Receipt',
        createdAt: '2025-08-28T14:00:00.000Z',
        extractedData: { po_number: { value: '305', confidence: 0.89 }, total: { value: 70.0, confidence: 0.94 } }
    },
    {
        _id: 'rec33',
        name: 'doc33.pdf',
        documentType: 'Invoice',
        createdAt: '2025-08-30T16:00:00.000Z',
        extractedData: { po_number: { value: '306', confidence: 0.97 }, total: { value: 290.0, confidence: 0.99 } }
    },
    {
        _id: 'rec34',
        name: 'doc34.pdf',
        documentType: 'Credit Note',
        createdAt: '2025-08-31T18:00:00.000Z',
        extractedData: { po_number: { value: '307', confidence: 0.91 }, total: { value: 65.0, confidence: 0.98 } }
    }
];

export const AnalyticsComponent: React.FC<AnalyticsComponentIF> = () => {
    const confidenceChartRef = useRef<SVGSVGElement>(null);
    const fillRateChartRef = useRef<SVGSVGElement>(null);
    const weeklyExtractionLineChartRef = useRef<SVGSVGElement>(null);
    const docTypePieChartRef = useRef<SVGSVGElement>(null);

    const { analyticsData, weeklyExtractionData, docTypeDistributionData } = React.useMemo(() => {
        const fieldStats: { [key: string]: { confidences: number[]; filledCount: number } } = {};

        const processNode = (node: any, path: string) => {
            if (!node) return;

            if (Array.isArray(node)) {
                node.forEach((item, index) => processNode(item, `${path}[${index}]`));
                return;
            }

            if (typeof node === 'object') {
                if (node.hasOwnProperty('value')) {
                    const fieldName = path
                        .replace(/\.\w+\[\d+\]/g, '')
                        .replace(/\b\d+\b/g, '')
                        .replace(/\.value$/, '');
                    if (!fieldStats[fieldName]) {
                        fieldStats[fieldName] = { confidences: [], filledCount: 0 };
                    }
                    if (typeof node.confidence === 'number') {
                        fieldStats[fieldName].confidences.push(node.confidence);
                    }
                    if (node.value !== null && node.value !== undefined) {
                        fieldStats[fieldName].filledCount++;
                    }
                } else {
                    Object.keys(node).forEach(key => {
                        processNode(node[key], path ? `${path}.${key}` : key);
                    });
                }
            }
        };

        sampleRecords.forEach(record => {
            processNode(record.extractedData, '');
        });

        const totalRecords = sampleRecords.length;

        const analyticsData = Object.keys(fieldStats).map(field => {
            const stats = fieldStats[field];
            const avgConfidence = stats.confidences.length > 0 ? d3.mean(stats.confidences) || 0 : 0;
            const fillRate = totalRecords > 0 ? (stats.filledCount / totalRecords) * 100 : 0;
            return { field, avgConfidence, fillRate };
        });

        // Weekly Extraction Data
        const weeklyCounts: { [key: string]: number } = {};
        sampleRecords.forEach(record => {
            const date = new Date(record.createdAt);
            const weekStart = d3.timeWeek.floor(date);
            const weekString = weekStart.toISOString().split('T')[0];
            weeklyCounts[weekString] = (weeklyCounts[weekString] || 0) + 1;
        });
        const weeklyExtractionData = Object.keys(weeklyCounts)
            .map(weekString => ({ date: new Date(weekString), count: weeklyCounts[weekString] }))
            .sort((a, b) => a.date.getTime() - b.date.getTime());

        // Document Type Distribution Data
        const docTypeCounts: { [key: string]: number } = {};
        sampleRecords.forEach(record => {
            const docType = record.documentType || 'Unknown';
            docTypeCounts[docType] = (docTypeCounts[docType] || 0) + 1;
        });
        const docTypeDistributionData = Object.keys(docTypeCounts).map(type => ({ type, count: docTypeCounts[type] }));

        return { analyticsData, weeklyExtractionData, docTypeDistributionData };
    }, []);

    useEffect(() => {
        if (confidenceChartRef.current) {
            const data = analyticsData;
            const svg = d3.select(confidenceChartRef.current);
            svg.selectAll('*').remove();
            const margin = { top: 20, right: 30, bottom: 150, left: 60 };
            const width = 600 - margin.left - margin.right;
            const height = 400 - margin.top - margin.bottom;
            const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

            const x = d3
                .scaleBand()
                .range([0, width])
                .domain(data.map(d => d.field))
                .padding(0.2);
            const y = d3.scaleLinear().range([height, 0]).domain([0, 1]);

            g.append('g')
                .attr('transform', `translate(0,${height})`)
                .call(d3.axisBottom(x))
                .selectAll('text')
                .attr('transform', 'translate(-10,0)rotate(-45)')
                .style('text-anchor', 'end');
            g.append('g').call(d3.axisLeft(y).tickFormat(d3.format('.0%')));

            g.selectAll('.bar')
                .data(data)
                .enter()
                .append('rect')
                .attr('class', 'bar')
                .attr('x', d => x(d.field)!)
                .attr('y', d => y(d.avgConfidence))
                .attr('width', x.bandwidth())
                .attr('height', d => height - y(d.avgConfidence))
                .attr('fill', '#1f77b4');
        }
    }, [analyticsData]);

    useEffect(() => {
        if (fillRateChartRef.current) {
            const data = analyticsData;
            const svg = d3.select(fillRateChartRef.current);
            svg.selectAll('*').remove();
            const margin = { top: 20, right: 30, bottom: 150, left: 60 };
            const width = 600 - margin.left - margin.right;
            const height = 400 - margin.top - margin.bottom;
            const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

            const x = d3
                .scaleBand()
                .range([0, width])
                .domain(data.map(d => d.field))
                .padding(0.2);
            const y = d3.scaleLinear().range([height, 0]).domain([0, 100]);

            g.append('g')
                .attr('transform', `translate(0,${height})`)
                .call(d3.axisBottom(x))
                .selectAll('text')
                .attr('transform', 'translate(-10,0)rotate(-45)')
                .style('text-anchor', 'end');
            g.append('g').call(
                d3
                    .axisLeft(y)
                    .ticks(5)
                    .tickFormat(d => `${d}%`)
            );

            g.selectAll('.bar')
                .data(data)
                .enter()
                .append('rect')
                .attr('class', 'bar')
                .attr('x', d => x(d.field)!)
                .attr('y', d => y(d.fillRate))
                .attr('width', x.bandwidth())
                .attr('height', d => height - y(d.fillRate))
                .attr('fill', '#ff7f0e');
        }
    }, [analyticsData]);

    useEffect(() => {
        if (weeklyExtractionLineChartRef.current) {
            const data = weeklyExtractionData;
            const svg = d3.select(weeklyExtractionLineChartRef.current);
            svg.selectAll('*').remove();
            const margin = { top: 20, right: 30, bottom: 40, left: 50 };
            const width = 600 - margin.left - margin.right;
            const height = 400 - margin.top - margin.bottom;
            const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

            const x = d3
                .scaleTime()
                .range([0, width])
                .domain(d3.extent(data, d => d.date) as [Date, Date]);
            const y = d3
                .scaleLinear()
                .range([height, 0])
                .domain([0, d3.max(data, d => d.count) || 0]);

            g.append('g')
                .attr('transform', `translate(0,${height})`)
                .call(
                    d3
                        .axisBottom(x)
                        .ticks(d3.timeWeek.every(1))
                        .tickFormat(d3.timeFormat('%b %d') as (domainValue: Date | d3.NumberValue, index: number) => string)
                );
            g.append('g').call(d3.axisLeft(y).ticks(5));

            const line = d3
                .line<{ date: Date; count: number }>()
                .x(d => x(d.date))
                .y(d => y(d.count));

            g.append('path').datum(data).attr('fill', 'none').attr('stroke', '#2ca02c').attr('stroke-width', 2).attr('d', line);
        }
    }, [weeklyExtractionData]);

    useEffect(() => {
        if (docTypePieChartRef.current) {
            const data = docTypeDistributionData;
            const svg = d3.select(docTypePieChartRef.current);
            svg.selectAll('*').remove();
            const width = 450;
            const height = 450;
            const margin = 40;
            const radius = Math.min(width, height) / 2 - margin;

            const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`);

            const color = d3.scaleOrdinal(d3.schemeCategory10);

            const pie = d3.pie<{ type: string; count: number }>().value(d => d.count);
            const path = d3.arc<any>().outerRadius(radius).innerRadius(0);

            const arcs = g.selectAll('.arc').data(pie(data)).enter().append('g').attr('class', 'arc');

            arcs.append('path')
                .attr('d', path)
                .attr('fill', (d, i) => color(i.toString()));

            const label = d3
                .arc<d3.PieArcDatum<{ type: string; count: number }>>()
                .outerRadius(radius)
                .innerRadius(radius - 80);

            arcs.append('text')
                .attr('transform', d => `translate(${label.centroid(d)})`)
                .text(d => d.data.type)
                .style('fill', '#fff')
                .style('font-size', '12px');
        }
    }, [docTypeDistributionData]);

    // --- Summary Calculations ---
    const totalDocs = sampleRecords.length;
    const docTypeCounts: { [key: string]: number } = {};
    let totalConfidence = 0;
    let confidenceCount = 0;
    sampleRecords.forEach(r => {
        const docType = r.documentType || 'Unknown';
        docTypeCounts[docType] = (docTypeCounts[docType] || 0) + 1;
        // Gather all confidence values for average
        Object.values(r.extractedData).forEach((field: any) => {
            if (field && typeof field.confidence === 'number') {
                totalConfidence += field.confidence;
                confidenceCount++;
            }
        });
    });
    const topDocType = Object.entries(docTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

    return (
        <div className="overflow-y-auto bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 min-h-screen p-8">
            <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-bold text-gray-800 mb-2 tracking-tight">Extraction Analytics Dashboard</h1>
                    <p className="text-lg text-gray-500 max-w-xl">
                        A comprehensive overview of document extraction performance, confidence, and trends. Powered by rich, realistic sample data.
                    </p>
                </div>
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 shadow-lg px-6 py-4 text-white text-center min-w-[160px]">
                        <div className="text-2xl font-bold">{totalDocs}</div>
                        <div className="text-sm tracking-wide">Total Documents</div>
                    </div>
                    <div className="rounded-xl bg-gradient-to-r from-pink-500 to-rose-400 shadow-lg px-6 py-4 text-white text-center min-w-[160px]">
                        <div className="text-2xl font-bold">{topDocType}</div>
                        <div className="text-sm tracking-wide">Top Document Type</div>
                    </div>
                    <div className="rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 shadow-lg px-6 py-4 text-white text-center min-w-[160px]">
                        <div className="text-2xl font-bold">{(avgConfidence * 100).toFixed(1)}%</div>
                        <div className="text-sm tracking-wide">Avg. Confidence</div>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <div className="rounded-2xl bg-white p-6 shadow-xl hover:shadow-2xl transition-shadow duration-300 border border-gray-100">
                    <h2 className="mb-4 text-2xl font-bold text-indigo-700 flex items-center gap-2">
                        Average Confidence Score per Field
                        <span className="ml-2 inline-block w-3 h-3 rounded-full bg-indigo-400"></span>
                    </h2>
                    <svg ref={confidenceChartRef} width="600" height="400"></svg>
                </div>
                <div className="rounded-2xl bg-white p-6 shadow-xl hover:shadow-2xl transition-shadow duration-300 border border-gray-100">
                    <h2 className="mb-4 text-2xl font-bold text-pink-700 flex items-center gap-2">
                        Field Fill Rate (%)
                        <span className="ml-2 inline-block w-3 h-3 rounded-full bg-pink-400"></span>
                    </h2>
                    <svg ref={fillRateChartRef} width="600" height="400"></svg>
                </div>
                <div className="rounded-2xl bg-white p-6 shadow-xl hover:shadow-2xl transition-shadow duration-300 border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-2xl font-bold text-emerald-700 flex items-center gap-2">
                            Documents Extracted per Week
                            <span className="ml-2 inline-block w-3 h-3 rounded-full bg-emerald-400"></span>
                        </h2>
                        <span className="text-xs text-gray-400">April–August 2025</span>
                    </div>
                    <svg ref={weeklyExtractionLineChartRef} width="600" height="400"></svg>
                    <div className="mt-2 flex gap-3 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                            <span className="inline-block w-4 h-1 rounded-full bg-emerald-400"></span> Extraction Volume
                        </div>
                    </div>
                </div>
                <div className="rounded-2xl bg-white p-6 shadow-xl hover:shadow-2xl transition-shadow duration-300 border border-gray-100">
                    <h2 className="mb-4 text-2xl font-bold text-rose-700 flex items-center gap-2">
                        Document Type Distribution
                        <span className="ml-2 inline-block w-3 h-3 rounded-full bg-rose-400"></span>
                    </h2>
                    <svg ref={docTypePieChartRef} width="450" height="450"></svg>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                        {Object.keys(docTypeCounts).map(type => (
                            <div key={type} className="flex items-center gap-1">
                                <span
                                    className="inline-block w-3 h-3 rounded-full"
                                    style={{
                                        background:
                                            type === 'Invoice'
                                                ? '#6366f1'
                                                : type === 'Receipt'
                                                  ? '#f472b6'
                                                  : type === 'PO'
                                                    ? '#34d399'
                                                    : type === 'Credit Note'
                                                      ? '#f87171'
                                                      : '#a3a3a3'
                                    }}
                                ></span>{' '}
                                {type}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="mt-10 rounded-2xl bg-white p-6 shadow-xl border border-gray-100">
                <h2 className="mb-4 text-2xl font-semibold text-gray-700">Field-Level Analytics</h2>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        {' '}
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Field Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Average Confidence</th>
                                <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase">Fill Rate</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                            {analyticsData.map(data => (
                                <tr key={data.field}>
                                    <td className="px-6 py-4 font-mono whitespace-nowrap">{data.field}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{d3.format('.2%')(data.avgConfidence)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{data.fillRate.toFixed(2)}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
