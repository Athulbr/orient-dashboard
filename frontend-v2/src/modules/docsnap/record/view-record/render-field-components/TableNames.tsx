import { FC } from 'react';
import { useViewRecordState } from '../hooks/viewRecordContext';
import { formatFieldLabel } from '../utils';
import { ChevronDown, ChevronRight } from 'lucide-react';

export const TableNames: FC = () => {
    const { state, setState } = useViewRecordState();

    if (!state.tableNames.length) return null;

    return (
        <div className="flex flex-col gap-2 rounded-lg border bg-white p-3 hover:border-blue-400">
            <div className="pl-1 text-lg font-semibold">Tables</div>
            {state.tableNames.map((name, index) => (
                <button
                    key={index}
                    onFocus={() => {
                        setState(prev => ({ ...prev, selectedTableName: name }));
                    }}
                    onClick={() => {
                        setState(prev => ({ ...prev, selectedTableName: name, hoveredFieldId: null, bbox: null }));
                    }}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border py-3 pr-3 pl-6 font-semibold hover:border-blue-300 ${state.selectedTableName === name ? 'border-blue-300 bg-blue-50' : 'bg-white'}`}
                >
                    {formatFieldLabel(name)} {length ? `( ${length} )` : ''}
                    {state.selectedTableName === name ? (
                        <ChevronDown size={20} className="cursor-pointer text-gray-500 hover:text-blue-500" />
                    ) : (
                        <ChevronRight size={20} className="cursor-pointer text-gray-500 hover:text-blue-500" />
                    )}
                </button>
            ))}
        </div>
    );
};
