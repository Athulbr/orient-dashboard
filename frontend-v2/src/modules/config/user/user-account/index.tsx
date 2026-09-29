import { useState } from 'react';
import { UserAccountStateProvider } from './hooks/userAccountContext';
import PageContainer from '../../../../components/PageContainer';
import PageNameComponent from '../../../../components/PageName';
import Breadcrumbs from '../../../../components/Breadcrumbs';
import { useNavigate } from 'react-router-dom';
import { UserDetailsComponent } from './UserDetailsComponent';

export interface UserAccountStateIF {
    user: any | null;
    loadingUser: boolean;
    updateNameDialog: boolean;
    updatePasswordDialog: boolean;
    profilePicture: string;
}
const initialState = {
    user: null,
    loadingUser: false,
    updateNameDialog: false,
    updatePasswordDialog: false,
    profilePicture: ''
};

const UserAccountDetailsPage: React.FC = () => {
    const [state, setState] = useState<UserAccountStateIF>(initialState);
    const navigate = useNavigate();

    return (
        <UserAccountStateProvider value={{ state, setState }}>
            <PageContainer className="gap-4 pt-6">
                <Breadcrumbs page="UserAccount" className="px-7" />
                <PageNameComponent className="border-b px-6 pb-4" name="Account Details" showBackButton customGoBackFunction={() => navigate('/')} />
                <UserDetailsComponent />
            </PageContainer>
        </UserAccountStateProvider>
    );
};

export default UserAccountDetailsPage;
