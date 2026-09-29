import { MultiSelect } from '../../../../../../components/MultiSelect';
import { useListRecordCustomTableState } from '../hooks/listRecordCustomTableStateContext';
import useTablepersistance from '../../../../../../hooks/useTablepersistance';
interface TemplateSelectorIF {
    test?: string;
}

const TemplateSelector: React.FC<TemplateSelectorIF> = () => {
    const { state, setState } = useListRecordCustomTableState();
    const { setFiltersParam, getFiltersFromQuery } = useTablepersistance();

    const templateList = JSON.parse(sessionStorage.getItem('templates') || '[]');

    const selectedTenant = sessionStorage.getItem('selectedTenant');
    const module = sessionStorage.getItem('module');
    const options: { label: string; value: string }[] = [];
    templateList.forEach((template: any) => {
        if (selectedTenant == null || selectedTenant === template.tenantId || selectedTenant === 'all') {
            if (module === template.settings?.module) {
                // console.log('template:===========', template);
                options.push({
                    label: template.name,
                    value: template._id
                });
            }
        }
    });

    const handleChange = (values: string[]) => {
        setState(prev => ({ ...prev, selectedTemplates: values, page: 1 }));
        const filters = getFiltersFromQuery() || {};
        filters.selectedTemplates = values;
        setFiltersParam(filters);
    };

    return <MultiSelect className=" w-80" placeholder="All Templates" options={options} values={state.selectedTemplates} onValuesChange={handleChange} />;
};

export default TemplateSelector;
