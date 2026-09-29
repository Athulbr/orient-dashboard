import { useState } from 'react';
import { Check, X, Plus } from 'lucide-react';
import { useToastStore } from '../../../components/toast/ToastStore';
import type { Keyword } from '../types';

interface KeywordsSectionProps {
    keywords: Keyword[];
    onToggle: (index: number) => void;
    onAdd: (keyword: Keyword) => void;
    onSelectAll: (selected: boolean) => void;
}

export default function KeywordsSection({ keywords, onToggle, onAdd, onSelectAll }: KeywordsSectionProps) {
    const toast = useToastStore();
    const [showAddKeyword, setShowAddKeyword] = useState(false);
    const [newKeyword, setNewKeyword] = useState('');
    
    const allSelected = keywords.length > 0 && keywords.every(k => k.selected !== false);

    const handleAddKeyword = () => {
        const trimmed = newKeyword.trim();
        if (!trimmed) return;
        const duplicate = keywords.some(k => k.keyword.toLowerCase() === trimmed.toLowerCase());
        if (duplicate) {
            toast.error('Keyword already exists');
            return;
        }
        onAdd({ keyword: trimmed, source: 'Manual', selected: true });
        setNewKeyword('');
        setShowAddKeyword(false);
    };

    return (
        <div className="mt-4 border-t pt-4">
            <div className="flex items-center justify-between mb-3">
                <p className="text-lg font-semibold">SEO friendly Keywords ( DataForSEO )</p>
                <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-500">
                        {keywords.filter(k => k.selected !== false).length} / {keywords.length} selected
                    </p>
                    <button
                        onClick={() => setShowAddKeyword(true)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                        title="Add keyword"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>
            {showAddKeyword && (
                <div className="flex items-center gap-2 mb-2">
                    <input
                        type="text"
                        value={newKeyword}
                        onChange={e => setNewKeyword(e.target.value)}
                        className="flex-1 px-3 py-1.5 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="Enter keyword"
                        autoFocus
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleAddKeyword();
                            if (e.key === 'Escape') {
                                setShowAddKeyword(false);
                                setNewKeyword('');
                            }
                        }}
                    />
                    <button
                        onClick={handleAddKeyword}
                        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors cursor-pointer"
                        title="Add"
                    >
                        <Check size={16} />
                    </button>
                    <button
                        onClick={() => {
                            setShowAddKeyword(false);
                            setNewKeyword('');
                        }}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors cursor-pointer"
                        title="Cancel"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}
            <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
                {/* Select All Checkbox */}
                <label className="flex items-center gap-3 p-2 w-40  rounded  cursor-pointer transition-colors ">
                    <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => onSelectAll(!allSelected)}
                        disabled={keywords.length === 0}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                            {allSelected ? 'Deselect All' : 'Select All'}
                        </p>
                        {/* <p className="text-xs text-gray-500">
                            {keywords.filter(k => k.selected !== false).length} of {keywords.length} keywords selected
                        </p> */}
                    </div>
                </label>
                
                {/* Individual Keywords */}
                {keywords.map((keyword, index) => (
                    <label key={index} className="flex items-center gap-3 p-2 border rounded hover:bg-gray-50 cursor-pointer transition-colors">
                        <input
                            type="checkbox"
                            checked={keyword.selected !== false}
                            onChange={() => onToggle(index)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm ${keyword.selected === false ? 'text-gray-400 line-through' : ''}`}>{keyword.keyword}</p>
                            <p className="text-xs text-gray-500">Source: {keyword.source}</p>
                        </div>
                    </label>
                ))}
            </div>
        </div>
    );
}
