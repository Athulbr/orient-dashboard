import { useParams } from 'react-router-dom';
import { useToastStore } from '../../../../components/toast/ToastStore';
import { useEffect } from 'react';
import httpRequest from '../../../../global-utils/httpRequest';
import { config } from '../../../../config/default';
import { useMakezAgentState } from './tablebuilderContext';

export const useMakezAgentApi = () => {
    const { state, setState } = useMakezAgentState();
    const { id } = useParams();
    const toast = useToastStore();

    useEffect(() => {
        if (!id) return;
        setState(prev => ({ ...prev, id }));
    }, [id]);

 



    // ============================= DELETE ==================================
    const deleteMakezAgentApi = async (id: string) => {
        try {
            const res = await httpRequest('DELETE', `${config.nodeApiUrl}/builder/MakezAgent/delete/${id}`);
            setState(prev => ({ ...prev, id: '', refresh: (prev.refresh || 0) + 1 }));
            toast.success('MakezAgent deleted successfully');
            return true;
        } catch (error) {
            console.error('error:===========', error);
            toast.error('Failed to delete MakezAgent');
        }
    };
    // ============================= Refresh Cache ==================================
  

    return { deleteMakezAgentApi };
};
