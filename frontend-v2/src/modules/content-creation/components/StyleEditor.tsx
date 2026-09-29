import { useState } from 'react';
import { RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import type { Theme } from '../types';

// Mirrors the SEMANTIC_TAGS in htmlTransformer.ts — layout/interactive elements
// (a, table, td, th) are intentionally excluded to keep AI-generated inline styles.
const CLASS_LABELS: Record<string, string> = {
    'blog-h2': 'Heading 2',
    'blog-h3': 'Heading 3',
    'blog-h4': 'Heading 4',
    'blog-p': 'Paragraph',
    'blog-ul': 'Unordered List',
    'blog-ol': 'Ordered List',
    'blog-li': 'List Item',
    'blog-blockquote': 'Blockquote',
};

const EDITABLE_PROPERTIES = [
    'font-size',
    'font-weight',
    'font-family',
    'color',
    'line-height',
    'margin',
    'padding',
    'padding-left',
    'text-align',
    'font-style',
];

interface StyleEditorProps {
    merged: Theme;
    overrides: Theme;
    updateStyle: (className: string, property: string, value: string) => Promise<void>;
    resetTheme: () => Promise<void>;
}

export default function StyleEditor({ merged, overrides, updateStyle, resetTheme }: StyleEditorProps) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const blogClasses = Object.keys(merged).filter(cls => cls.startsWith('blog-'));

    const toggle = (cls: string) =>
        setExpanded(prev => ({ ...prev, [cls]: !prev[cls] }));

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Style Editor</p>
                <button
                    onClick={resetTheme}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 transition-colors"
                    title="Reset all overrides to base theme"
                >
                    <RotateCcw size={12} />
                    Reset
                </button>
            </div>

            <div className="flex flex-col gap-1 text-sm">
                {blogClasses.map(cls => {
                    const styles = merged[cls] || {};
                    const isOverridden = !!overrides[cls] && Object.keys(overrides[cls]).length > 0;
                    const isOpen = !!expanded[cls];
                    const label = CLASS_LABELS[cls] || cls;

                    return (
                        <div key={cls} className="border border-gray-200 rounded-md overflow-hidden">
                            <button
                                onClick={() => toggle(cls)}
                                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    {isOpen ? (
                                        <ChevronDown size={14} className="text-gray-500" />
                                    ) : (
                                        <ChevronRight size={14} className="text-gray-500" />
                                    )}
                                    <span className="font-medium text-gray-700">{label}</span>
                                    {isOverridden && (
                                        <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                                            modified
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-gray-400 font-mono">.{cls}</span>
                            </button>

                            {isOpen && (
                                <div className="px-3 py-3 bg-white flex flex-col gap-2">
                                    {EDITABLE_PROPERTIES.map(prop => {
                                        const currentVal = overrides[cls]?.[prop] ?? styles[prop] ?? '';
                                        const isModified = overrides[cls]?.[prop] !== undefined;
                                        return (
                                            <div key={prop} className="flex items-center gap-2">
                                                <label
                                                    className={`text-xs w-28 shrink-0 font-mono ${isModified ? 'text-blue-600' : 'text-gray-500'}`}
                                                >
                                                    {prop}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={currentVal}
                                                    placeholder={styles[prop] || '—'}
                                                    onChange={e => updateStyle(cls, prop, e.target.value)}
                                                    className={`flex-1 text-xs px-2 py-1 border rounded focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono ${
                                                        isModified ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                                                    }`}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}

                {blogClasses.length === 0 && (
                    <p className="text-xs text-gray-400 italic py-2">
                        No theme data yet. Generate or regenerate a blog to populate styles.
                    </p>
                )}
            </div>
        </div>
    );
}
