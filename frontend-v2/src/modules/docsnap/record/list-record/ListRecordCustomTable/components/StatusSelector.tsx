import { useEffect, useState } from 'react';
import { MultiSelect } from '../../../../../../components/MultiSelect';
import { useListRecordCustomTableState } from '../hooks/listRecordCustomTableStateContext';
import useTablepersistance from '../../../../../../hooks/useTablepersistance';
import httpRequest from '../../../../../../global-utils/httpRequest';
import { config } from '../../../../../../config/default';

interface StatusSelectorIF {
    test?: string;
}

const StatusSelector: React.FC<StatusSelectorIF> = () => {
    const { state, setState } = useListRecordCustomTableState();
    const { setFiltersParam, getFiltersFromQuery } = useTablepersistance();
    const [statusList, setStatusList] = useState<{ label: string; value: string }[]>([]);

    useEffect(() => {
        httpRequest<{ key: string; value: string }[]>('GET', `${config.nodeApiUrl}/idp/history/statuses`)
            .then((res: any) => {
                if (Array.isArray(res?.data)) {
                    setStatusList(res.data.map((s: any) => ({
                        label: s?.label || s?.key || (typeof s === 'string' ? s : ''),
                        value: s?.key || s?.value || (typeof s === 'string' ? s : '')
                    })));
                }
            })
            .catch(() => {});
    }, []);

    const handleChange = (values: string[]) => {
        setState(prev => ({ ...prev, selectedStatuses: values, page: 1 }));
        const filters = getFiltersFromQuery() || {};
        filters.selectedStatuses = values;
        setFiltersParam(filters);
    };

    return <MultiSelect className="w-fit" placeholder="All Status" options={statusList} values={state.selectedStatuses} onValuesChange={handleChange} />;
};

export default StatusSelector;
