import { DeleteIcon, Trash2 } from 'lucide-react';
import { Button } from '../../../../../../components/Button';
import { useListRecordCustomTableState } from '../hooks/listRecordCustomTableStateContext';
import { useListRecordCustomTableApi } from '../hooks/useListRecordCustomTableApi';

interface DeleteSelectedButtonIF {
    test?: string;
}

const DeleteSelectedButton: React.FC<DeleteSelectedButtonIF> = () => {
    const { state, setState } = useListRecordCustomTableState();
    const { deleteRecordApi } = useListRecordCustomTableApi();
    const deleteSelectedRecords = () => {
        state.selectedRows.forEach((id: string) => deleteRecordApi(id));
        setState(prev => ({ ...prev, selectedRows: [] }));
    };
    if (state.selectedRows.length === 0) return null;
    return (
        <Button startIcon={<Trash2 className="text-gray-500" size={14} />} onClick={deleteSelectedRecords} outlined>
            Delete Selected
        </Button>
    );
};

export default DeleteSelectedButton;
