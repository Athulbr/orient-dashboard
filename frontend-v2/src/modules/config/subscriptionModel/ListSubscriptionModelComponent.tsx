import { useEffect } from 'react';
import { StatusCustomUI } from '../../../builders/tablebuilder/render-tablebuilder/components/CustomUI';
import { UseTablebuilder } from '../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';
import { useSubscriptionModelState } from './hooks/subscriptionModelContext';
import { useSubscriptionModelsApi } from './hooks/useSubscriptionModelApi';
import { useParams } from 'react-router-dom';

export const ListSubscriptionModelComponent: React.FC = () => {
    const { id } = useParams();
    const { setState, state } = useSubscriptionModelState();
    const { getSubscriptionModelByIdApi, deleteSubscriptionModelApi, getAllModulesApi, getAllFeaturesApi } = useSubscriptionModelsApi();

    useEffect(() => {
        if (!id) return;
        setState(prev => ({ ...prev, projectId: `${id}` }));
    }, [id]);

    const actionButtons = [
        {
            label: 'Create Subscription Model',
            action: () => {
                setState(prev => ({ ...prev, showCreateDialog: true }));
            }
        }
    ];

    const customFunctions = {
        rowClickHandler: (row: any) => {
            setState(prev => ({ ...prev, showViewDialog: true, id: row._id }));
            getSubscriptionModelByIdApi(row._id);
            getAllModulesApi();
            getAllFeaturesApi();
        },
        editClickHandler: (row: any) => {
            setState(prev => ({ ...prev, showCreateDialog: true, subscriptionModel: row, id: row._id }));
        },
        deleteClickHandler: (row: any) => {
            deleteSubscriptionModelApi(row._id);
        }
    };

    const customUI = {
        status: StatusCustomUI
    };

    return (
        <UseTablebuilder
            name="List Subscription Model Table"
            fluidHeight
            refresh={state.refresh}
            customFunctions={customFunctions}
            customUI={customUI}
            actionButtons={actionButtons}
            deletePermission="delete:subscriptionModel"
            updatePermission="update:subscriptionModel"
        />
    );
};
