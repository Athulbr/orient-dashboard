import { useEffect, useState } from 'react';
import { AccordionListTB } from '../tablebuilder-components/AccordionListTB';
import { ApiConfigSection } from './ApiConfig';
import { ColumnConfigSection } from './ColumsConfig';
import { DateRangeSection } from './DateRange';
import { FilterConfigSection } from './FilterConfig';
import { GeneralSettingsSection } from './GeneralSettings';
import { JsonPreviewSection } from './JsonPreview';
import { PageSizeSection } from './PageSizeSettings';
import { SearchSection } from './SearchSettings';
import { TablebuilderBot } from './TablebuilderBot';
import { useFetchCreateTB } from '../hooks/useFetchCreateTB';
import { useNavigate } from 'react-router-dom';
import BackButton from '../../../../components/BackButton';
import Spinner from '../../../../components/Spinner';
import { useTablebuilderSettings } from '../hooks/useTablebuilderSettingsContext';
import { useTablebuilderState } from '../../../../modules/config/tablebuilder/hooks/tablebuilderContext';
interface PropsIF {
    id?: string;
}
export const TableSettings: React.FC<PropsIF> = ({ id }) => {
    const navigate = useNavigate();
    const { setState } = useTablebuilderState();

    const { getTablebuilderByIdApi, createTablebuilderApi, updateTablebuilderApi } = useFetchCreateTB();
    const [showBot, setShowBot] = useState(false);
    const { builder } = useTablebuilderSettings();

    useEffect(() => {
        if (!id) return;
        getTablebuilderByIdApi(id);
    }, [id]);

    return (
        <div className="flex w-120 resize-x flex-col overflow-y-auto [&::-webkit-scrollbar]:w-1">
            <div className="sticky top-0 left-0 z-1 flex items-center justify-between bg-white pb-2">
                <div className="flex items-start gap-2 text-xl text-gray-800">
                    <BackButton onClick={() => setState(prev => ({ ...prev, createDialog: false }))} />
                    Table Builder
                </div>
                <div className="flex gap-2">
                    {!id && (
                        <div
                            onClick={() => setShowBot(!showBot)}
                            className="flex h-10 cursor-pointer items-center rounded-md border px-4 text-sm text-gray-800 hover:border hover:bg-gray-100"
                        >
                            Build With AI
                        </div>
                    )}
                    <div
                        onClick={() => (id ? updateTablebuilderApi(id) : createTablebuilderApi())}
                        className="flex h-10 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm text-gray-800 hover:border hover:bg-gray-100"
                    >
                        {builder.loading && <Spinner size={20} />}
                        {id ? 'Update' : 'Create'}
                    </div>
                </div>
            </div>

            {/* General Settings Section */}
            {showBot && (
                <div className="rounded-lg bg-white px-5 pt-3 pb-5 shadow-sm">
                    <TablebuilderBot />
                </div>
            )}
            <AccordionListTB items={accordionItems} />
        </div>
    );
};

const accordionItems = [
    {
        id: 1,
        title: 'General Settings',
        component: <GeneralSettingsSection />
    },
    {
        id: 2,
        title: 'API Configuration',
        component: <ApiConfigSection />
    },
    {
        id: 3,
        title: 'Search Settings',
        component: <SearchSection />
    },
    {
        id: 4,
        title: 'Date Range Settings',
        component: <DateRangeSection />
    },
    {
        id: 5,
        title: 'Page Size Settings',
        component: <PageSizeSection />
    },

    {
        id: 6,
        title: 'Filter Configuration',
        component: <FilterConfigSection />
    },
    {
        id: 7,
        title: 'Column Configuration',
        component: <ColumnConfigSection />
    },
    {
        id: 8,
        title: 'JSON Preview',
        component: <JsonPreviewSection />
    }
];
