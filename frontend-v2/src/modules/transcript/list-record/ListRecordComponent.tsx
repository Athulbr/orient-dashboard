import { useNavigate, useSearchParams } from 'react-router-dom';
import { useListRecordPageState } from './hooks/listRecordPageContext';
import { useListRecordApi } from './hooks/useListRecordApi';
import { usePermissionStore } from '../../../zustand-store/PermissionStore';
import { UseTablebuilder } from '../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';

export const ListRecordComponent: React.FC = () => {
    const { state, setState } = useListRecordPageState();
    const navigate = useNavigate();
    const { deleteRecordApi } = useListRecordApi();
    const [params] = useSearchParams();
    const { checkPermission } = usePermissionStore();

    const customFunctions = {
        rowClickHandler: (row: any, data: any) => {
            navigate(`/transcript/record/view/${row._id}`);
        },
        deleteClickHandler: (row: any) => {
            deleteRecordApi(row._id);
        }
    };

    const actionButtons = checkPermission('export:record:ardex')
        ? [
              {
                  label: 'Export Record',
                  action: () => {
                      //   setState(prev => ({ ...prev, dealerSelectionDialog: true }));
                  }
              }
          ]
        : [];
    const updatedQuery = (query: any) => {
        setState(prev => ({ ...prev, query }));
        return query;
    };

    const selectedFilter = params.get('status') || '' ? { status: params.get('status') || '' } : {};
    return (
        <>
            <UseTablebuilder
                externalFilters={{ deleted: false, ...selectedFilter }}
                refresh={state.refresh}
                name="Medical Code List"
                fluidHeight
                customFunctions={customFunctions}
                deletePermission="delete:medicalCode"
                updatePermission="update:medicalCode"
                actionButtons={actionButtons}
                updatedQuery={updatedQuery}
            />
        </>
    );
};
