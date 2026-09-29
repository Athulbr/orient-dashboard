import { useNavigate, useSearchParams } from 'react-router-dom';
import { UseTablebuilder } from '../../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';
import { RecordStatusCustomUI } from './components/RecordStatusCustomUI';
import { useListRecordPageState } from './hooks/listRecordPageContext';
import { useListRecordApi } from './hooks/useListRecordApi';
import { useEffect, useState } from 'react';
import DealerListComponent from './components/DealerSelectionComponent';
import { usePermissionStore } from '../../../../zustand-store/PermissionStore';
import { OnlyDateCustomUI } from './components/OnlyDateCustomUI';
import { downloadXlsxFile } from './utils/downloadXlsxFile';
import { UseFormbuilder } from '../../../../builders/formbuilder/use-formbuilder';
import httpRequest from '../../../../global-utils/httpRequest';
import { useToastStore } from '../../../../components/toast/ToastStore';
import { useExtractionStore } from '../../../../zustand-store/extractionStore';
const selectedTenant = window?.sessionStorage?.getItem('selectedTenant') || '';
import { config } from '../../../../config/default';

export const Polink = (row: any) => {
    let rmLink: any = row?.data?.rmResponse?.data?.url ? row?.data?.rmResponse?.data?.url : row?.data?.rmResponse?.url;
    const poId = row?.data?.rmResponse?.data?.id ? row?.data?.rmResponse?.data?.id : row?.data?.rmResponse?.id;

    if (row?.data?.rmResponse?.blog_uid && !rmLink) {
        rmLink = `https://dev.rehabmart.com/post/${row?.data?.rmResponse?.blog_file_name}`;
    }

    const onClickPOLink = (e: any, row: any) => {
        e.stopPropagation();
        window.open(`${rmLink}`, '_blank');
    };

    if (!rmLink) {
        return <div className="text-blue-400  pl-6">-</div>;
    }

    return (
        <div onClick={e => onClickPOLink(e, row)} className="text-blue-400 text-sm hover:underline cursor-pointer hover:text-blue-700">
            {poId || row?.data?.rmResponse?.blog_uid}
        </div>
    );
};

export const ListRecordComponent: React.FC = () => {
    const { state, setState } = useListRecordPageState();
    const navigate = useNavigate();
    const { deleteRecordApi } = useListRecordApi();
    const [params] = useSearchParams();
    const { checkPermission, user } = usePermissionStore();
    const toast = useToastStore();

    const [rowSelected, setRowSelected] = useState<boolean>(false);
    const { refreshRecord, updateRefreshRecord, extractionQueue } = useExtractionStore();

    useEffect(() => {
        if (refreshRecord === 100) return;
        setState(prev => ({ ...prev, refresh: refreshRecord }));
    }, [refreshRecord, setState]);

    const customFunctions = {
        rowClickHandler: (row: any, data: any) => {
            const url = window.location.href;
            const module = sessionStorage.getItem('module');
            if (module === 'document-generation') {
                navigate(`/document-generation/view/${row._id}`, { state: { from: url } });
                return;
            }
            if (module === 'content-creation') {
                navigate(`/content-creation/view-content/${row._id}`, { state: { from: url } });
                return;
            }
            navigate(`/docsnap/record/view/${row._id}`, { state: { from: url } });
            window?.sessionStorage?.setItem('recordIdList', JSON.stringify(data.map((item: any) => item._id)));
        },
        deleteClickHandler: (row: any) => {
            deleteRecordApi(row._id);
        }
    };

    const customUI = {
        recordStatus: RecordStatusCustomUI,
        poLink: Polink,
        documentDate: OnlyDateCustomUI
    };

    const actionButtons = [];
    if (checkPermission('assign:record:rehab') && rowSelected) {
        actionButtons.push({
            label: 'Assign',
            action: (selectedIds: string[]) => {
                setState(prev => ({ ...prev, assignDialog: true, selectedIds }));
            }
        });
    }
    if (checkPermission('export:record:ardex')) {
        actionButtons.push({
            label: 'Export Record',
            action: () => {
                setState(prev => ({ ...prev, dealerSelectionDialog: true }));
            }
        });
    }
    // checkPermission('export:record:ardex') && tenants.includes(tenantId)
    checkPermission('export:record:ardex')
        ? [
              {
                  label: 'Export Record',
                  action: () => {
                      //   setState(prev => ({ ...prev, dealerSelectionDialog: true }));
                  }
              },
              {
                  label: 'Assign',
                  action: (selectedIds: string[]) => {
                      setState(prev => ({ ...prev, assignDialog: true, selectedIds }));
                  }
              }
          ]
        : [];
    const updatedQuery = (query: any) => {
        const validators = query.filters?.validators;
        const updatedQuery = { ...query };
        if (validators !== undefined) {
            updatedQuery.filters.extractedBy = validators;
            delete updatedQuery.filters.validators;
        }
        setState(prev => ({ ...prev, query: updatedQuery }));
        return updatedQuery;
    };

    const onSubmit = async (dealers: any, startDate: null | Date, endDate: null | Date) => {
        let formattedStart: string | null = null;
        let formattedEnd: string | null = null;

        const loginUser = JSON.parse(window?.sessionStorage?.getItem('user') as string);

        if (startDate) {
            const s = new Date(startDate);
            s.setHours(0, 0, 0, 0); // start of day
            formattedStart = s.toISOString(); // still UTC, but exact 00:00 local
        }

        if (endDate) {
            const e = new Date(endDate);
            e.setHours(23, 59, 59, 999); // end of day
            formattedEnd = e.toISOString();
        }
        const payload = {
            startDate: formattedStart,
            endDate: formattedEnd,
            // format: 'xlsx',
            // dealers,
            tenantId: loginUser?.tenant?._id ? loginUser?.tenant?._id : selectedTenant
        };

        await downloadXlsxFile(payload, selectedTenant);
        setState(prev => ({ ...prev, dealerSelectionDialog: false }));
    };
    const onRowSelect = (selectedRows: any) => {
        if (selectedRows.length > 0) {
            setRowSelected(true);
        } else {
            setRowSelected(false);
        }
    };

    const hiddenColumns = String(user?.tenant?.name).toLowerCase() == 'rehabmart' ? ['documentDate'] : ['poLink', 'assignedTo'];

    const selectedFilter = params.get('status') || '' ? { status: params.get('status') || '' } : {};
    return (
        <>
            <UseTablebuilder
                disableLoader={extractionQueue.length > 0}
                customUI={customUI}
                externalFilters={{ deleted: false, ...selectedFilter }}
                refresh={state.refresh}
                name="List Record Table"
                fluidHeight
                customFunctions={customFunctions}
                deletePermission="delete:record"
                updatePermission="update:record"
                actionButtons={actionButtons}
                updatedQuery={updatedQuery}
                hiddenColumns={hiddenColumns}
                onRowSelect={onRowSelect}
            />

            {/* <ListRecordCustomTable /> */}
            {state.dealerSelectionDialog && (
                <DealerListComponent
                    onSubmit={onSubmit}
                    isOpen={state.dealerSelectionDialog}
                    closeDialog={() => setState(prev => ({ ...prev, dealerSelectionDialog: false }))}
                />
            )}
            {state.assignDialog && (
                <UseFormbuilder
                    name="Select Validator"
                    closeDialog={() => setState(prev => ({ ...prev, assignDialog: false }))}
                    onSubmit={async (fields: any) => {
                        try {
                            setState(prev => ({ ...prev, assigningRecords: true }));
                            const requestBody = {
                                ids: state.selectedIds,
                                assignedTo: fields?.selectedValidator
                            };
                            await httpRequest('POST', `${config.nodeApiUrl}/idp/history/bulk/update`, requestBody);
                            setState(prev => ({ ...prev, assignDialog: false, refresh: refreshRecord }));
                            updateRefreshRecord();
                            toast.success('Record Assigned Successfully');
                        } catch (error) {
                            console.error('Error assigning records:', error);
                            toast.error('Failed to assign records');
                        } finally {
                            setState(prev => ({ ...prev, assigningRecords: false }));
                        }
                    }}
                    loadingPrimaryButton={state.assigningRecords}
                />
            )}
        </>
    );
};
