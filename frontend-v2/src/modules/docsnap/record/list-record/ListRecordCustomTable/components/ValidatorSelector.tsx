import { SingleSelect } from '../../../../../../components/SingleSelect';
import { useListRecordCustomTableState } from '../hooks/listRecordCustomTableStateContext';
import useTablepersistance from '../../../../../../hooks/useTablepersistance';
interface ValidatorSelectorIF {
    test?: string;
}

const ValidatorSelector: React.FC<ValidatorSelectorIF> = () => {
    const { state, setState } = useListRecordCustomTableState();
    const { setFiltersParam, getFiltersFromQuery } = useTablepersistance();

    const handleChange = (value: string) => {
        setState(prev => ({ ...prev, selectedValidator: value, page: 1 }));
        const filters = getFiltersFromQuery() || {};
        filters.selectedValidator = value;
        setFiltersParam(filters);
    };

    return (
        <SingleSelect
            value={state.selectedValidator}
            options={[
                { label: 'All Validators', value: '' },
                { label: 'Validator 1', value: 'validator1' },
                { label: 'Validator 2', value: 'validator2' }
            ]}
            onValueChange={handleChange}
            placeholder="Validator"
            className="w-36"
        />
    );
};

export default ValidatorSelector;
