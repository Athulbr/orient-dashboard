import { ClearButton } from './components/ClearButton';
import DateRangePicker from './components/DateRangePicker';
import DeleteSelectedButton from './components/DeleteSelectedButton';
import { PageSizeSelector } from './components/PageSizeSelector';
import { SearchInput } from './components/SearchInput';
import StatusSelector from './components/StatusSelector';
import TemplateSelector from './components/TemplateSelector';
import ValidatorSelector from './components/ValidatorSelector';

interface TableToolbarIF {
    test?: string;
}

const TableToolbar: React.FC<TableToolbarIF> = () => {
    return (
        <div className="p-2 flex flex-1 flex-row-reverse flex-wrap-reverse justify-start gap-4">
            <DeleteSelectedButton />
            <ClearButton />
            <SearchInput />
            <DateRangePicker />
            <StatusSelector />
            <PageSizeSelector />
            <TemplateSelector />
            <ValidatorSelector />
        </div>
    );
};

export default TableToolbar;
