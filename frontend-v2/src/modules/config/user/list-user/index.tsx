import { useEffect, useState } from 'react';
import CreateUserComponent from './CreateUserComponent';
import { ListUserComponent } from './ListUserComponent';
import PageContainer from '../../../../components/PageContainer';
import PageNameComponent from '../../../../components/PageName';
import { UserStateProvider } from './hooks/userContext';
import { usePermissionStore } from '../../../../zustand-store/PermissionStore';
import { useNavigate } from 'react-router-dom';
export interface UserStateIF {
    showCreateDialog: boolean;
    loading: boolean;
    id: string;
    refresh: number;
    user: any;
}
const initialState = {
    showCreateDialog: false,
    loading: false,
    id: '',
    refresh: 1,
    user: null
};

const ListUserPage: React.FC = () => {
    const [state, setState] = useState<UserStateIF>(initialState);
    const { settings } = usePermissionStore();
    const navigate = useNavigate();
    useEffect(() => {
        if (settings.length == 0) navigate('/');
        navigate(settings[0]?.items[0]?.path);
    }, [settings]);

    return (
        <UserStateProvider value={{ state, setState }}>
            <PageContainer className="gap-4">
                <PageNameComponent name="User List" />
                <ListUserComponent />
                <CreateUserComponent />
            </PageContainer>
        </UserStateProvider>
    );
};

export default ListUserPage;
