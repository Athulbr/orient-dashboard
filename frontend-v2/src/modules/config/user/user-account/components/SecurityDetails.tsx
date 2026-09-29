import { Edit } from 'lucide-react';
import { UseFormbuilder } from '../../../../../builders/formbuilder/use-formbuilder';
import { useUserAccountState } from '../hooks/userAccountContext';
import { useUserAccountApi } from '../hooks/useUserAccountApi';
import { DetailsCard, DetailsCardItem } from './DetailsCard';
import { useToastStore } from '../../../../../components/toast/ToastStore';

export const SecurityDetails = () => {
    const { state, setState } = useUserAccountState();
    const { updateUserPassword } = useUserAccountApi();
    const toast = useToastStore();

    const onSubmit = (data: any) => {
        if (data.oldPassword === data.newPassword) {
            toast.error('New password cannot be the same as the old password.');
            return;
        }
        updateUserPassword(data);
    };
    return (
        <DetailsCard>
            <DetailsCardItem label="Password" value="********" />
            <Edit
                onClick={() => setState(prev => ({ ...prev, updatePasswordDialog: true }))}
                className="absolute top-4 right-4 cursor-pointer hover:text-sky-500"
                size={18}
            />
            <UseFormbuilder
                title="Update Password"
                existingData={state.user || {}}
                className="w-100"
                name="Update Password Form"
                isOpen={state.updatePasswordDialog}
                closeDialog={() => setState(prev => ({ ...prev, updatePasswordDialog: false }))}
                onSubmit={onSubmit}
                loadingPrimaryButton={state.loadingUser}
            />
        </DetailsCard>
    );
};
