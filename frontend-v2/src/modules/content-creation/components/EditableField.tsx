import { useState } from 'react';
import { Check, X, Pencil } from 'lucide-react';

interface EditableFieldProps {
    label: string;
    value: string;
    onSave: (value: string) => void;
}

export default function EditableField({ label, value, onSave }: EditableFieldProps) {
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState('');

    const handleStartEdit = () => {
        setEditing(true);
        setEditValue(value);
    };

    const handleSave = () => {
        onSave(editValue);
        setEditing(false);
        setEditValue('');
    };

    const handleCancel = () => {
        setEditing(false);
        setEditValue('');
    };

    return (
        <div className="pt-4">
            <div className="flex items-center justify-between mb-2">
                <p className="text-lg font-semibold">{label}</p>
                {!editing && (
                    <button
                        onClick={handleStartEdit}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                        title={`Edit ${label}`}
                    >
                        <Pencil size={14} />
                    </button>
                )}
            </div>
            {editing ? (
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        className="flex-1 px-3 py-1.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        autoFocus
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleSave();
                            if (e.key === 'Escape') handleCancel();
                        }}
                    />
                    <button
                        onClick={handleSave}
                        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors cursor-pointer"
                        title="Save"
                    >
                        <Check size={16} />
                    </button>
                    <button
                        onClick={handleCancel}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors cursor-pointer"
                        title="Cancel"
                    >
                        <X size={16} />
                    </button>
                </div>
            ) : (
                <p className="text-sm text-gray-700">{value || 'N/A'}</p>
            )}
        </div>
    );
}
