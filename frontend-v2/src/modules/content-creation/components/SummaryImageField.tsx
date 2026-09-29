import { useState } from 'react';
import { Check, X, Pencil } from 'lucide-react';

interface SummaryImageFieldProps {
    imageUrl: string;
    onSave: (url: string) => void;
}

export default function SummaryImageField({ imageUrl, onSave }: SummaryImageFieldProps) {
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState('');

    const handleStartEdit = () => {
        setEditing(true);
        setEditValue(imageUrl);
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
                <p className="text-lg font-semibold">Summary Image</p>
                {!editing && (
                    <button
                        onClick={handleStartEdit}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                        title="Edit Summary Image URL"
                    >
                        <Pencil size={14} />
                    </button>
                )}
            </div>
            {editing ? (
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            className="flex-1 px-3 py-1.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            placeholder="Enter image URL"
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
                    {editValue && <img src={editValue} alt="Preview" className="max-h-100 rounded-md object-contain" />}
                </div>
            ) : (
                <>
                    {imageUrl ? (
                        <img src={imageUrl} alt="Primary Image" className="max-h-100 rounded-md object-contain" />
                    ) : (
                        <p className="text-sm text-gray-500">No image URL</p>
                    )}
                    {imageUrl && <p className="text-xs text-gray-400 mt-1 break-all">{imageUrl}</p>}
                </>
            )}
        </div>
    );
}
