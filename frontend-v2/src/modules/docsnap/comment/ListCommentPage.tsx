import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { UseTablebuilder } from '../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';
import PageContainer from '../../../components/PageContainer';
import PageNameComponent from '../../../components/PageName';
import httpRequest from '../../../global-utils/httpRequest';
import { useToastStore } from '../../../components/toast/ToastStore';
import { config } from '../../../config/default';

interface ListCommentPageIF {
    test?: string;
}

const ListCommentPage: React.FC<ListCommentPageIF> = () => {
    const navigate = useNavigate();
    const [refresh, setRefresh] = useState(1);
    const toast = useToastStore();
    const actionButtons = [
        {
            label: 'Create Comment',
            action: () => {
                navigate('/config/comment/create');
            }
        }
    ];
    const customFunctions = {
        rowClickHandler: (row: Record<string, string>) => {
            navigate(`/config/comment/update/${row._id}`);
        },
        editClickHandler: () => {},
        deleteClickHandler: async (row: Record<string, string>) => {
            try {
                await httpRequest('DELETE', `${config.nodeApiUrl}/idp/comment/delete/${row._id}`);
                toast.success('Comment deleted successfully');
                setRefresh(prev => prev + 1);
                return true;
            } catch (error) {
                console.error(error);
                return false;
            }
        }
    };
    const customUI = {};
    return (
        <PageContainer className="gap-4">
            <PageNameComponent name="Comment List" />
            <UseTablebuilder
                refresh={refresh}
                name="List Comments"
                customFunctions={customFunctions}
                fluidHeight
                customUI={customUI}
                deletePermission="delete:comment"
                updatePermission="update:comment"
            />
        </PageContainer>
    );
};

export default ListCommentPage;
