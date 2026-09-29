import React, { useMemo, useState } from 'react';
import type { ExcelColumnIF } from '.';
import { DialogComponent } from '../../../components/DialogComponent';
import { TextField } from '../../../components/TextField';

interface AutoColumnSelectorDialogProps {
    isOpen: boolean;
    onClose: () => void;
    columns: ExcelColumnIF[];
    onConfirm: (selected: ExcelColumnIF[]) => void;
}

const AutoColumnSelectorDialog: React.FC<AutoColumnSelectorDialogProps> = ({ isOpen, onClose, columns, onConfirm }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(columns.map(c => c.id)));
    const [query, setQuery] = useState('');

    const filtered = useMemo(() => {
        if (!query.trim()) return columns;
        const q = query.toLowerCase();
        return columns.filter(c => c.columnName.toLowerCase().includes(q) || c.jsonPath.toLowerCase().includes(q));
    }, [columns, query]);

    const allVisibleSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));

    const toggleOne = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const toggleAllVisible = () => {
        const next = new Set(selectedIds);
        if (allVisibleSelected) {
            filtered.forEach(c => next.delete(c.id));
        } else {
            filtered.forEach(c => next.add(c.id));
        }
        setSelectedIds(next);
    };

    const handleConfirm = () => {
        const selected = columns.filter(c => selectedIds.has(c.id));
        onConfirm(selected);
    };

    return (
        <DialogComponent
            onPrimaryAction={handleConfirm}
            secondaryButtonText="Cancel"
            primaryButtonText="Add Selected"
            name="Select Columns"
            isOpen={isOpen}
            closeDialog={onClose}
        >
            <div className="relative bg-white w-full max-w-3xl rounded-lg shadow-xl overflow-hidden">
                <div className=" border-b flex items-center justify-between bg-gray-50">
                    <div className="p-2 w-full">
                        <TextField
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search columns or paths..."
                            className="border rounded px-2 py-1 text-sm w-full"
                        />
                    </div>
                </div>

                <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-sm text-gray-600">
                            {selectedIds.size} selected of {columns.length}
                        </div>
                        <button className="text-blue-600 text-sm cursor-pointer" onClick={toggleAllVisible}>
                            {allVisibleSelected ? 'Unselect visible' : 'Select all visible'}
                        </button>
                    </div>

                    <div className="max-h-96 overflow-auto border rounded">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="w-10 p-2 text-left">
                                        <input className="cursor-pointer" type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                                    </th>
                                    <th className="p-2 text-left text-gray-600">Column Name</th>
                                    <th className="p-2 text-left text-gray-600">JSON Path</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(col => (
                                    <tr key={col.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => toggleOne(col.id)}>
                                        <td className="p-2">
                                            <input
                                                className="cursor-pointer"
                                                type="checkbox"
                                                checked={selectedIds.has(col.id)}
                                                onChange={() => toggleOne(col.id)}
                                            />
                                        </td>
                                        <td className="p-2 font-medium text-gray-800">{col.columnName}</td>
                                        <td className="p-2 font-mono text-xs text-gray-600">{col.jsonPath}</td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr>
                                        <td className="p-4 text-center text-gray-400" colSpan={3}>
                                            No matches
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </DialogComponent>
    );
};

export default AutoColumnSelectorDialog;
