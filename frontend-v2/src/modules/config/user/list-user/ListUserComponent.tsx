import { UseTablebuilder } from '../../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';
import { useUserState } from './hooks/userContext';
import { useUserApiService } from './hooks/useUserApiService';

export const ListUserComponent: React.FC = () => {
    const { state, setState } = useUserState();
    const { deleteUserApiRequest } = useUserApiService();
    const actionButtons = [
        {
            label: 'Create User',
            action: () => {
                setState(prev => ({ ...prev, showCreateDialog: true }));
            }
        }
    ];
    const customFunctions = {
        editClickHandler: (row: any) => {
            setState(prev => ({ ...prev, showCreateDialog: true, id: row._id, user: row }));
        },
        deleteClickHandler: (row: any) => {
            deleteUserApiRequest(row._id);
        }
    };
    const customUI = {
        name: UserNameCustomUI,
        status: UserStatusCustomUI
    };
    return (
        <UseTablebuilder
            name="list user"
            refresh={state.refresh}
            fluidHeight
            customFunctions={customFunctions}
            customUI={customUI}
            actionButtons={actionButtons}
            deletePermission="delete:user"
            updatePermission="update:user"
        />
    );
};

const UserNameCustomUI = (row: any) => {
    return (
        <div className="">
            {row.data.firstName} {row.data.lastName}
        </div>
    );
};

export const UserStatusCustomUI = ({ data }: { data: any }) => {
    return (
        <div
            className={`inline rounded-md px-2 py-1 text-xs capitalize ${data?.active === true ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-400'}`}
        >
            {data.active ? 'Active' : 'Inactive'}
        </div>
    );
};
