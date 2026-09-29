import DateTimePicker, { DateRangeIF } from '../../../../../../components/DateTimePicker';
import { useListRecordCustomTableState } from '../hooks/listRecordCustomTableStateContext';
import useTablepersistance from '../../../../../../hooks/useTablepersistance';

interface DateRangePickerIF {
    test?: string;
}


const DateRangePicker: React.FC<DateRangePickerIF> = () => {
    const { state, setState } = useListRecordCustomTableState();
    const { setDateRangeParam } = useTablepersistance();

    const onDateChange = ({ startDate, endDate }: DateRangeIF) => {
        setState(prev => ({ ...prev, startDate, endDate }));
        setDateRangeParam(startDate ? new Date(startDate) : null, endDate ? new Date(endDate) : null);
    };
    return <DateTimePicker onChange={onDateChange} />;
};

export default DateRangePicker;
