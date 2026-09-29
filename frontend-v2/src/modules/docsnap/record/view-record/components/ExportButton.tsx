import { FC } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '../../../../../components/Button';
import { Dropdown } from '../../../../../components/Dropdown';
import { useViewRecordState } from '../hooks/viewRecordContext';
import { config } from '../../../../../config/default';

interface ExportButtonPropsIF {
    showExportButton?: boolean;
}

export const ExportButton: FC<ExportButtonPropsIF> = ({ showExportButton = true }) => {
    const { state } = useViewRecordState();
    const userData = window?.sessionStorage?.getItem('user');
    const selectedTenant = window?.sessionStorage?.getItem('selectedTenant') || '';
    const user = userData ? JSON.parse(userData) : null;
    const arrays: any = {};
    state.tableNames.forEach((item, index) => {
        arrays[item] = state.arrayFields[index];
    });
    const extractedData = {
        ...state.objectFields,
        ...arrays
    };
    const downloadJSONFile = () => {
        const jsonString = JSON.stringify(extractedData);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${state.record?.name}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };
    const downloadXlsxFile = async () => {
        const recordId = state.record?._id;
        const accessToken = window?.sessionStorage?.getItem('accessToken') as string;

        let exportURL = '';
        // Update this condition based on your tenant settings
        if (user.tenant._id === '68896ef48e0baa23315c3cfd') {
            exportURL = `${config.nodeApiUrl}/idp/history/export/new`;
        } else {
            exportURL = `${config.nodeApiUrl}/idp/history/export`;
        }

        const response = await fetch(exportURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                authorization: `Bearer ${accessToken ? JSON.parse(accessToken) : ''}`,
                tenantid: selectedTenant
            },
            body: JSON.stringify({ recordId })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${state.record?.name?.split('.pdf')[0]}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    };
    const onChangeOption = (value: string) => {
        if (value === 'JSON') {
            downloadJSONFile();
        }
        if (value === 'XLSX') {
            downloadXlsxFile();
        }
    };
    if (!showExportButton) return;
    return (
        <Dropdown onChange={onChangeOption} options={['XLSX', 'JSON']}>
            {/* ISSUE:Button is preventing (e.preventDefault()) */}
            <button
                data-tour-id="export-button"
                disabled={state.reExtracting}
                className={`${state.reExtracting ? 'text-gray-400' : 'text-gray-700'} rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-light hover:bg-gray-100`}
            >
                Export
            </button>
        </Dropdown>
    );
};
