import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useViewTemplateState } from './hooks/viewTemplateContext';
import { useViewTemplateApi } from './hooks/useViewTemplateApi';
import { UseTablebuilder } from '../../../../builders/tablebuilder/render-tablebuilder/components/UseTablebuilder';
import { RecordStatusCustomUI } from '../../record/list-record/components/RecordStatusCustomUI';
import { useParams } from 'react-router-dom';
import { useExtractionStore } from '../../../../zustand-store/extractionStore';

export const ListRecordComponent: React.FC = () => {
    const { state, setState } = useViewTemplateState();
    const { id } = useParams();
    const navigate = useNavigate();
    const { deleteTemplateApi } = useViewTemplateApi();

    const { refreshRecord } = useExtractionStore();

    useEffect(() => {
        if (refreshRecord === 10) return;
        setState(prev => ({ ...prev, refresh: refreshRecord }));
    }, [refreshRecord]);

    const customFunctions = {
        rowClickHandler: (row: any, data: any) => {
            navigate(`/docsnap/record/view/${row._id}`);
            window?.sessionStorage?.setItem('recordIdList', JSON.stringify(data.map((item: any) => item._id)));
        },
        deleteClickHandler: (row: any) => {
            deleteTemplateApi(row._id);
        }
    };
    const customUI = {
        recordStatus: RecordStatusCustomUI
    };
    if (!id) return null;
    return (
        <div className="pt-4">
            <UseTablebuilder
                customUI={customUI}
                externalFilters={{ deleted: false, document: id }}
                name="List Record Table"
                fluidHeight
                customFunctions={customFunctions}
                deletePermission="delete:record"
                updatePermission="update:record"
            />
        </div>
    );
};
