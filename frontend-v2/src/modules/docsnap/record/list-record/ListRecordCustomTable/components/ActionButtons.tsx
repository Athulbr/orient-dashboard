import { Edit, Trash2 } from 'lucide-react';
import Tooltip from '../../../../../../components/Tooltip';
import { useAlertStore } from '../../../../../../components/alert/AlertStore';
import { useListRecordCustomTableApi } from '../hooks/useListRecordCustomTableApi';
import { usePermissionStore } from '../../../../../../zustand-store/PermissionStore';

export const ActionButtons: React.FC<{ row: any }> = ({ row }) => {
    const { checkPermission } = usePermissionStore();
    const alert = useAlertStore();
    const { deleteRecordApi } = useListRecordCustomTableApi();

    // const handleEdit = async (e: React.MouseEvent) => {
    //     e.stopPropagation();
    //     const newName = window.prompt('Edit record name', row?.name || '');
    //     if (newName === null) return; // user cancelled
    //     try {
    //         await updateRecordApi({ name: newName }, row._id);
    //         await getRecordsApi();
    //     } catch (err) {
    //         console.error('Failed to update record', err);
    //     }
    // };
    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();

        alert.showAlert({
            alertText: 'Are you sure you want to delete this?',
            primaryButtonText: 'Delete',
            onPrimaryAction: async () => {
                try {
                    await deleteRecordApi(row._id);
                } catch (err) {
                    // deleteRecordApi shows toast on failure; still catch to avoid unhandled rejection
                    console.error('Delete failed', err);
                } finally {
                    alert.closeAlert();
                }
            }
        });
    };

    return (
        <div className={`flex gap-4`}>
            {/* {checkPermission('update:record') && (
                <Tooltip text="Edit" position="bottom">
                    <Edit onClick={handleEdit} className="cursor-pointer hover:text-blue-500" size={18} />
                </Tooltip>
            )} */}
            {checkPermission('delete:record') && (
                <Tooltip text="Delete" position="bottom">
                    <Trash2 onClick={handleDelete} className="cursor-pointer hover:text-red-500" size={18} />
                </Tooltip>
            )}
        </div>
    );
};
