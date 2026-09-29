import { StatusCustomUI } from '../../../builders/tablebuilder/render-tablebuilder/components/CustomUI';
import { UseTablebuilder } from '../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';
import { useFeatureState } from './hooks/featureContext';
import { useFeaturesApi } from './hooks/useFeatureApi';

export const ListFeatureComponent: React.FC = () => {
    const { setState, state } = useFeatureState();
    const { getFeatureByIdApi, deleteFeatureApi } = useFeaturesApi();

    const actionButtons = [
        {
            label: 'Create Feature',
            action: () => {
                setState(prev => ({ ...prev, showCreateDialog: true }));
            }
        }
    ];

    const customFunctions = {
        rowClickHandler: (row: any) => {
            // setState(prev => ({ ...prev, showViewDialog: true, id: row._id }));
            // getFeatureByIdApi(row._id);
        },
        editClickHandler: (row: any) => {
            setState(prev => ({ ...prev, showCreateDialog: true, feature: row, id: row._id }));
        },
        deleteClickHandler: (row: any) => {
            deleteFeatureApi(row._id);
        }
    };

    const customUI = {
        status: StatusCustomUI
    };

    return (
        <UseTablebuilder
            name="List Feature Table"
            fluidHeight
            refresh={state.refresh}
            customFunctions={customFunctions}
            customUI={customUI}
            actionButtons={actionButtons}
            externalFilters={{ isActive: true }}
            deletePermission="delete:feature"
            updatePermission="update:feature"
        />
    );
};
