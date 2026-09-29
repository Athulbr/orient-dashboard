import { config } from '../../../../../config/default';

export const downloadXlsxFile = async (payload = {}, selectedTenant: string) => {
    const accessToken = window?.sessionStorage?.getItem('accessToken') as string;

    let exportURL = '';
    exportURL = `${config.nodeApiUrl}/idp/history/export/new`;

    const response = await fetch(exportURL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${accessToken ? JSON.parse(accessToken) : ''}`,
            tenantid: selectedTenant
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `table-export-${new Date().getTime()}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};
