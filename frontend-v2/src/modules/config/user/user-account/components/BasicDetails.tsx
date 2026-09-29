import { Edit } from 'lucide-react';
import { useState } from 'react';
import { UseFormbuilder } from '../../../../../builders/formbuilder/use-formbuilder';
import { useUserAccountState } from '../hooks/userAccountContext';
import { useUserAccountApi } from '../hooks/useUserAccountApi';
import { DetailsCard, DetailsCardItem } from './DetailsCard';

export const BasicDetailsComponent = () => {
    const { state, setState } = useUserAccountState();
    const { updateUserName } = useUserAccountApi();
    const onSubmit = (data: any) => {
        updateUserName(data.firstName, data.lastName);
    };
    return (
        <>
            <DetailsCard>
                <DetailsCardItem label="First Name" value={state.user?.firstName} />
                <DetailsCardItem label="Last Name" value={state.user?.lastName} />
                <Edit
                    onClick={() => setState(prev => ({ ...prev, updateNameDialog: true }))}
                    className="absolute top-4 right-4 cursor-pointer hover:text-sky-500"
                    size={18}
                />
            </DetailsCard>
            <DetailsCard>
                <DetailsCardItem label="Email" value={state.user?.email} />
                <DetailsCardItem label="Role" value={state.user?.role.name} />
                <DetailsCardItem label="Account Status" value={state.user?.active ? 'Active' : 'Inactive'} />
                <DetailsCardItem label="Email Verification" value={state.user?.verified ? 'Verified' : 'Not Verified'} />
                <DetailsCardItem label="Member Since" value={formatDateString(state.user?.createdAt)} />
                <DetailsCardItem label="Last Login" value={state.user?.lastLogin} />
            </DetailsCard>
            <UseFormbuilder
                title="Edit Name"
                existingData={state.user || {}}
                className="w-100"
                name="Update User Name Form"
                isOpen={state.updateNameDialog}
                closeDialog={() => setState(prev => ({ ...prev, updateNameDialog: false }))}
                onSubmit={onSubmit}
                loadingPrimaryButton={state.loadingUser}
            />
        </>
    );
};

const formatDateString = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};
