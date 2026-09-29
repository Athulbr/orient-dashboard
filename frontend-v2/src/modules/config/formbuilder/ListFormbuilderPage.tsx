import { useNavigate } from 'react-router-dom';
import { StatusCustomUI } from '../../../builders/tablebuilder/render-tablebuilder/components/CustomUI';
import { UseTablebuilder } from '../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';
import PageContainer from '../../../components/PageContainer';
import PageNameComponent from '../../../components/PageName';
import httpRequest from '../../../global-utils/httpRequest';
import { useToastStore } from '../../../components/toast/ToastStore';
import { useRef, useState } from 'react';
import Breadcrumbs from '../../../components/Breadcrumbs';
import { config } from '../../../config/default';

interface ListFormbuilderPageIF {
    test?: string;
}

const ListFormbuilderPage: React.FC<ListFormbuilderPageIF> = () => {
    const navigate = useNavigate();
    const [refresh, setRefresh] = useState(1);
    const [refreshingCache, setRefreshingCache] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const toast = useToastStore();

    const refreshCache = async () => {
        try {
            setRefreshingCache(true);
            const formbuilderesponse = await httpRequest('POST', `${config.nodeApiUrl}/builder/formbuilder/query`, { pageSize: 1000 });
            window?.sessionStorage?.setItem('formbuilder', JSON.stringify(formbuilderesponse?.data));
            toast.success('Cache refreshed successfully');
        } catch (error) {
            console.error(error);
            toast.error('Failed to refresh cache');
        } finally {
            setRefreshingCache(false);
        }
    };

    const exportFormbuilder = async () => {
        try {
            setExporting(true);
            const response = await httpRequest('POST', `${config.nodeApiUrl}/builder/formbuilder/query`, { pageSize: 1000 });
            const data = response?.data ?? response;
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `formbuilder-export-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);
            toast.error('Failed to export formbuilder data');
        } finally {
            setExporting(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setImporting(true);
            const text = await file.text();
            const data = JSON.parse(text);
            await httpRequest('POST', `${config.nodeApiUrl}/builder/formbuilder/bulk`, data);
            toast.success('Formbuilder data imported successfully');
            setRefresh(prev => prev + 1);
        } catch (error) {
            console.error(error);
            toast.error('Failed to import formbuilder data');
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const actionButtons = [
        {
            label: 'Create Formbuilder',
            action: () => {
                navigate('/config/formbuilder/create');
            }
        },
        {
            label: refreshingCache ? 'Refreshing Cache...' : 'Refresh Cache',
            action: refreshCache,
            loading: refreshingCache
        },
        {
            label: exporting ? 'Exporting...' : 'Export',
            action: exportFormbuilder,
            loading: exporting
        },
        {
            label: importing ? 'Importing...' : 'Import',
            action: () => fileInputRef.current?.click(),
            loading: importing
        }
    ];

    const customFunctions = {
        editClickHandler: (row: Record<string, string>) => {
            navigate(`/config/formbuilder/update/${row._id}`);
        },
        deleteClickHandler: async (row: Record<string, string>) => {
            try {
                await httpRequest('DELETE', `${config.nodeApiUrl}/builder/formbuilder/${row._id}`);
                toast.success('Formbuilder updated successfully');
                setRefresh(prev => prev + 1);
                return true;
            } catch (error) {
                console.error(error);
                return false;
            }
        }
    };
    const customUI = {
        status: StatusCustomUI
    };
    return (
        <PageContainer className="gap-2">
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
            <PageNameComponent name="Formbuilder List" />
            <UseTablebuilder
                refresh={refresh}
                name="list formbuilder"
                customUI={customUI}
                fluidHeight
                actionButtons={actionButtons}
                customFunctions={customFunctions}
                deletePermission="delete:formbuilder"
                updatePermission="update:formbuilder"
            />
        </PageContainer>
    );
};

export default ListFormbuilderPage;
