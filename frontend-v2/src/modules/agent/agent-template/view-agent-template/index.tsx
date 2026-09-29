import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import httpRequest from '../../../../global-utils/httpRequest';
import { config } from '../../../../config/default';
import Editor from '@monaco-editor/react';
import {
    Settings,
    Plus,
    Trash2,
    GripVertical,
    ChevronDown,
    ChevronRight,
    Layers,
    Table2,
    FileText,
    Save,
    Check,
    Zap,
    MousePointerClick,
    Type,
    AlignLeft,
    Code2,
    ToggleLeft,
    Hash,
    List,
    X,
    ArrowLeft,
    Copy
} from 'lucide-react';
import { useToastStore } from '../../../../components/toast/ToastStore';

// ── Types ──────────────────────────────────────────────────────────────────

type LLMProvider = 'openai' | 'anthropic' | 'azure' | 'gemini';

const LLM_MODELS: Record<LLMProvider, string[]> = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-5'],
    anthropic: ['claude-sonnet-4-20250514', 'claude-sonnet-4-5-20250929', 'claude-3-7-sonnet-20250219'],
    azure: ['gpt-4o-docsnap', 'gpt-4o-mini-docsnap'],
    gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite']
};

interface TemplateSettings {
    llmProvider: LLMProvider;
    llmModel: string;
    extractionLimit: number;
    disableBoundingBox: boolean;
    alignmentCorrection: boolean;
    includeOcrTextForExtraction: boolean;
    webhookKey?: string;
}

interface Field {
    id: string;
    key: string;
    instruction: string;
    label: string;
    enums: string[];
    validationScript: string;
    excludeExtraction: boolean;
    hidden: boolean;
    isTextarea: boolean;
    required: boolean;
    regularExpression: string;
}

type SectionType = 'group' | 'table';

interface Section {
    id: string;
    type: SectionType;
    key: string;
    label: string;
    instruction?: string;
    fields: Field[];
}

interface SelectedField {
    field: Field;
    sectionId: string;
}

type DragType = 'field' | 'section';

interface DragPayload {
    type?: DragType;
    sectionId?: string;
    fieldId?: string;
}

interface DragState {
    draggingFieldId?: string;
    overFieldId?: string;
    draggingSectionId?: string;
    overSectionId?: string;
}

// ── Defaults ───────────────────────────────────────────────────────────────

const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const DEFAULT_SETTINGS: TemplateSettings = {
    llmProvider: 'gemini',
    llmModel: 'gemini-2.5-flash',
    extractionLimit: 10,
    disableBoundingBox: false,
    alignmentCorrection: false,
    includeOcrTextForExtraction: false,
    webhookKey: ''
};

const DEFAULT_FIELD = (): Field => ({
    id: generateId(),
    key: 'new_field',
    instruction: '',
    label: 'New Field',
    enums: [],
    validationScript: '',
    excludeExtraction: false,
    hidden: false,
    isTextarea: false,
    required: false,
    regularExpression: ''
});

const DEFAULT_GROUP = (): Section => ({
    id: generateId(),
    type: 'group',
    key: 'new_group',
    label: 'New Group',
    instruction: '',
    fields: [DEFAULT_FIELD()]
});

const DEFAULT_TABLE = (): Section => ({
    id: generateId(),
    type: 'table',
    key: 'new_table',
    label: 'New Table',
    instruction: '',
    fields: [DEFAULT_FIELD()]
});

// ── Sub-components ─────────────────────────────────────────────────────────

interface ToggleProps {
    checked: boolean;
    onChange: (value: boolean) => void;
}

function Toggle({ checked, onChange }: ToggleProps) {
    return (
        <div onClick={() => onChange(!checked)} className={`relative flex-shrink-0 w-9 h-5 rounded-full cursor-pointer transition-colors duration-200 ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
            <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200" style={{ left: checked ? '18px' : '2px' }} />
        </div>
    );
}

interface FieldLabelProps {
    children: React.ReactNode;
}

function FieldLabel({ children }: FieldLabelProps) {
    return <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">{children}</div>;
}

interface PanelSectionProps {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
}

function PanelSection({ title, icon: Icon, children }: PanelSectionProps) {
    return (
        <div className="mb-5">
            <div className="flex items-center gap-1.5 mb-2.5">
                <Icon size={13} className="text-gray-400" />
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{title}</span>
            </div>
            {children}
        </div>
    );
}

function Divider() {
    return <div className="border-t border-gray-100 mb-5" />;
}

interface ToggleRowProps {
    label: string;
    desc: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    index: number;
    total: number;
}

function ToggleRow({ label, desc, checked, onChange, index, total }: ToggleRowProps) {
    const isFirst = index === 0;
    const isLast = index === total - 1;
    const radius = isFirst ? 'rounded-t-lg' : isLast ? 'rounded-b-lg' : 'rounded-none';
    const borderTop = isFirst ? 'border' : 'border border-t-0';
    const bg = index % 2 === 0 ? 'bg-gray-50' : 'bg-white';

    return (
        <div className={`flex items-center justify-between px-3 py-2.5 ${bg} ${radius} ${borderTop} border-gray-200`}>
            <div>
                <div className="text-[13px] font-medium text-gray-900">{label}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{desc}</div>
            </div>
            <Toggle checked={checked} onChange={onChange} />
        </div>
    );
}

interface SelectProps {
    value: string;
    onChange: React.ChangeEventHandler<HTMLSelectElement>;
    children: React.ReactNode;
}

function Select({ value, onChange, children }: SelectProps) {
    return (
        <select
            value={value}
            onChange={onChange}
            className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
        >
            {children}
        </select>
    );
}

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    className?: string;
}

function TextInput({ className = '', ...rest }: TextInputProps) {
    return (
        <input
            className={`w-full px-2.5 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors ${className}`}
            {...rest}
        />
    );
}

// ── Template Settings Panel ────────────────────────────────────────────────

interface TemplateSettingsPanelProps {
    settings: TemplateSettings;
    onChange: (settings: TemplateSettings) => void;
}

function TemplateSettingsPanel({ settings, onChange }: TemplateSettingsPanelProps) {
    const set = <K extends keyof TemplateSettings>(k: K, v: TemplateSettings[K]) => onChange({ ...settings, [k]: v });

    const toggles: Array<{ key: keyof Pick<TemplateSettings, 'disableBoundingBox' | 'alignmentCorrection' | 'includeOcrTextForExtraction'>; label: string; desc: string }> = [
        { key: 'disableBoundingBox', label: 'Disable Bounding Box', desc: 'Skip bounding box detection' },
        { key: 'alignmentCorrection', label: 'Alignment Correction', desc: 'Auto-correct document alignment' },
        { key: 'includeOcrTextForExtraction', label: 'Include OCR Text', desc: 'Use OCR text layer for extraction' }
    ];

    return (
        <div className="p-5 overflow-y-auto h-full">
            <PanelSection title="Model" icon={Zap}>
                <div className="mb-2.5">
                    <FieldLabel>Provider</FieldLabel>
                    <Select
                        value={settings.llmProvider}
                        onChange={e =>
                            onChange({
                                ...settings,
                                llmProvider: e.target.value as LLMProvider,
                                llmModel: LLM_MODELS[e.target.value as LLMProvider][0]
                            })
                        }
                    >
                        {(Object.keys(LLM_MODELS) as LLMProvider[]).map(p => (
                            <option key={p} value={p}>
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                            </option>
                        ))}
                    </Select>
                </div>
                <div>
                    <FieldLabel>Model</FieldLabel>
                    <Select value={settings.llmModel} onChange={e => set('llmModel', e.target.value)}>
                        {(LLM_MODELS[settings.llmProvider] ?? []).map(m => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </Select>
                </div>
            </PanelSection>

            <Divider />

            <PanelSection title="Extraction" icon={Hash}>
                <FieldLabel>Extraction Limit</FieldLabel>
                <TextInput type="number" value={settings.extractionLimit} onChange={e => set('extractionLimit', Number(e.target.value))} min={1} max={100} />
            </PanelSection>
            <PanelSection title="Webhook" icon={Zap}>
                <FieldLabel>Webhook Key</FieldLabel>
                <TextInput type="text" value={settings.webhookKey || ''} onChange={e => set('webhookKey', e.target.value)} />
            </PanelSection>

            <Divider />

            <PanelSection title="Options" icon={ToggleLeft}>
                <div className="flex flex-col">
                    {toggles.map(({ key, label, desc }, i) => (
                        <ToggleRow key={key} label={label} desc={desc} checked={settings[key]} onChange={v => set(key, v)} index={i} total={toggles.length} />
                    ))}
                </div>
            </PanelSection>
        </div>
    );
}

// ── Field Settings Panel ───────────────────────────────────────────────────

interface FieldSettingsPanelProps {
    field: Field;
    sectionId: string;
    onUpdate: (sectionId: string, fieldId: string, patch: Partial<Field>) => void;
    onClose: () => void;
}

function FieldSettingsPanel({ field, sectionId, onUpdate, onClose }: FieldSettingsPanelProps) {
    const set = <K extends keyof Field>(k: K, v: Field[K]) => onUpdate(sectionId, field.id, { [k]: v });
    const [newEnum, setNewEnum] = useState('');

    const toggles: Array<{ key: keyof Pick<Field, 'required' | 'isTextarea' | 'excludeExtraction' | 'hidden'>; label: string; desc: string }> = [
        { key: 'required', label: 'Required', desc: 'Field must be present in extraction' },
        { key: 'isTextarea', label: 'Textarea', desc: 'Render as multi-line text input' },
        { key: 'excludeExtraction', label: 'Exclude from Extraction', desc: 'Skip this field during extraction' },
        { key: 'hidden', label: 'Hidden', desc: 'Hide this field from output' }
    ];

    const handleAddEnum = () => {
        if (newEnum.trim() !== '') {
            const values = newEnum
                .split(',')
                .map(v => v.trim())
                .filter(v => v !== '');
            const currentEnums = field.enums || [];
            const newValues = values.filter(v => !currentEnums.includes(v));
            if (newValues.length > 0) {
                set('enums', [...currentEnums, ...newValues]);
            }
            setNewEnum('');
        }
    };

    const handleRemoveEnum = (val: string) => {
        set(
            'enums',
            (field.enums || []).filter(e => e !== val)
        );
    };

    const handleRemoveAllEnums = () => {
        set('enums', []);
    };

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <div>
                    <div className="text-[13px] font-bold text-gray-900">{field.label}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Field configuration</div>
                </div>
                <button
                    onClick={onClose}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 border border-gray-200 rounded-md bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
                >
                    <ChevronRight size={12} /> Deselect
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <PanelSection title="Identity" icon={Type}>
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <FieldLabel>Label</FieldLabel>
                            <TextInput
                                value={field.label}
                                onChange={e => {
                                    const val = e.target.value;
                                    const newKey = val
                                        .trim()
                                        .toLowerCase()
                                        .replace(/[^a-z0-9]+/g, '_')
                                        .replace(/^_|_$/g, '');
                                    onUpdate(sectionId, field.id, { label: val, key: newKey });
                                }}
                            />
                        </div>
                        <div className="flex-1">
                            <FieldLabel>Key</FieldLabel>
                            <TextInput value={field.key || ''} onChange={e => set('key', e.target.value)} />
                        </div>
                    </div>
                </PanelSection>
                <Divider />
                <PanelSection title="Instruction" icon={AlignLeft}>
                    <textarea
                        value={field.instruction}
                        onChange={e => set('instruction', e.target.value)}
                        rows={8}
                        placeholder="Describe what to extract for this field..."
                        className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors resize-y leading-relaxed font-sans"
                    />
                </PanelSection>
                <Divider />
                <PanelSection title="Enums" icon={List}>
                    <div className="flex items-center justify-between">
                        <FieldLabel>Allowed Values</FieldLabel>
                        {field.enums && field.enums.length > 0 && (
                            <button
                                onClick={handleRemoveAllEnums}
                                className="text-[11px] text-red-500 hover:text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-100 mb-1.5 transition-colors font-medium"
                            >
                                Remove All
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <TextInput
                            value={newEnum}
                            onChange={e => setNewEnum(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddEnum();
                                }
                            }}
                            placeholder="Add enum value..."
                            className="flex-1"
                        />
                        <button onClick={handleAddEnum} className="px-3 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-[13px] font-medium hover:bg-blue-100 transition-colors">
                            Add
                        </button>
                    </div>
                    {field.enums && field.enums.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {field.enums.map(enumVal => (
                                <span key={enumVal} className="flex items-center gap-1 pl-2 pr-1 py-1 bg-gray-100 border border-gray-200 rounded-md text-[11px] text-gray-700">
                                    {enumVal}
                                    <button
                                        onClick={() => handleRemoveEnum(enumVal)}
                                        className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-red-500 rounded hover:bg-gray-200 transition-colors"
                                    >
                                        <X size={10} />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </PanelSection>
                <Divider />
                <PanelSection title="Options" icon={ToggleLeft}>
                    <div className="flex flex-col">
                        {toggles.map(({ key, label, desc }, i) => (
                            <ToggleRow key={key} label={label} desc={desc} checked={field[key]} onChange={v => set(key, v)} index={i} total={toggles.length} />
                        ))}
                    </div>
                </PanelSection>
                <PanelSection title="Validation" icon={Code2}>
                    <FieldLabel>Regular Expression</FieldLabel>
                    <input
                        value={field.regularExpression}
                        onChange={e => set('regularExpression', e.target.value)}
                        placeholder="e.g. ^\d{4}-\d{2}-\d{2}$"
                        className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-[12px] text-gray-700 font-mono outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
                    />
                    {field.regularExpression && (
                        <div className="mt-1.5 px-2.5 py-1.5 bg-green-50 border border-green-200 rounded-md text-[11px] text-green-700 font-mono break-all">{field.regularExpression}</div>
                    )}

                    <div className="mt-4">
                        <FieldLabel>Script</FieldLabel>
                        <div className="border border-gray-200 rounded-lg overflow-hidden bg-[#1e1e1e]">
                            <Editor
                                height="250px"
                                defaultLanguage="javascript"
                                theme="vs-light"
                                value={field.validationScript}
                                onChange={value => set('validationScript', value || '')}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    fontFamily: 'sans-serif', // Set font family here
                                    lineNumbers: 'on',
                                    lineHeight: 24,
                                    scrollBeyondLastLine: false,
                                    wordWrap: 'on',
                                    folding: false,
                                    lineDecorationsWidth: 16,
                                    lineNumbersMinChars: 3,
                                    tabSize: 2,
                                    padding: { top: 12, bottom: 12 }
                                }}
                            />
                        </div>
                    </div>
                </PanelSection>
                <Divider />
            </div>
        </div>
    );
}

// ── Field Row ──────────────────────────────────────────────────────────────

interface FieldRowProps {
    field: Field;
    sectionId: string;
    onDelete: (sectionId: string, fieldId: string) => void;
    onDragStart: (e: React.DragEvent, sectionId: string, fieldId: string) => void;
    onDragOver: (e: React.DragEvent, sectionId: string, fieldId: string) => void;
    onDrop: (e: React.DragEvent, sectionId: string, fieldId: string) => void;
    isDragging: boolean;
    isOver: boolean;
    isSelected: boolean;
    onSelect: (field: Field, sectionId: string) => void;
}

function FieldRow({ field, sectionId, onDelete, onDragStart, onDragOver, onDrop, isDragging, isOver, isSelected, onSelect }: FieldRowProps) {
    interface Badge {
        label: string;
        cls: string;
    }

    const badges: Badge[] = [
        field.required ? { label: 'Required', cls: 'text-red-600 bg-red-50' } : null,
        field.hidden ? { label: 'Hidden', cls: 'text-gray-500 bg-gray-100' } : null,
        field.isTextarea ? { label: 'Textarea', cls: 'text-violet-600 bg-violet-50' } : null,
        field.excludeExtraction ? { label: 'Excluded', cls: 'text-amber-600 bg-amber-50' } : null
    ].filter((b): b is Badge => b !== null);

    return (
        <div
            draggable
            onDragStart={e => {
                onDragStart(e, sectionId, field.id);
                e.stopPropagation();
            }}
            onDragOver={e => {
                onDragOver(e, sectionId, field.id);
            }}
            onDrop={e => {
                onDrop(e, sectionId, field.id);
            }}
            onClick={() => onSelect(field, sectionId)}
            className={`flex items-center gap-2 px-2.5 py-3 rounded-lg mb-3 cursor-pointer transition-all duration-100 border
        ${
            isSelected
                ? 'border-blue-400 bg-blue-50 shadow-[0_0_0_3px_rgba(191,219,254,0.4)]'
                : isOver
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
        }
        ${isDragging ? 'opacity-40' : 'opacity-100'}
      `}
        >
            <GripVertical size={14} className={`flex-shrink-0 cursor-grab ${isSelected ? 'text-blue-300' : 'text-gray-300'}`} />

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[13px] font-medium ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>{field.label}</span>
                    {badges.map(b => (
                        <span key={b.label} className={`text-[10px] font px-1.5 py-px rounded ${b.cls}`}>
                            {b.label}
                        </span>
                    ))}
                </div>
                {field.instruction && <div className="text-[11px] text-gray-400 mt-0.5 truncate">{field.instruction}</div>}
            </div>

            <button
                onClick={e => {
                    e.stopPropagation();
                    onDelete(sectionId, field.id);
                }}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center border border-red-200 rounded-md bg-white text-red-400 hover:text-red-600 hover:border-red-400 transition-colors opacity-60 hover:opacity-100"
            >
                <Trash2 size={11} />
            </button>
        </div>
    );
}

// ── Section Card ───────────────────────────────────────────────────────────

interface SectionCardProps {
    section: Section;
    onUpdate: (id: string, key: keyof Section, val: string) => void;
    onDelete: (id: string) => void;
    onAddField: (sectionId: string) => void;
    onDeleteField: (sectionId: string, fieldId: string) => void;
    onDragStart: (e: React.DragEvent, sectionId: string, fieldId: string) => void;
    onDragOver: (e: React.DragEvent, sectionId: string, fieldId: string) => void;
    onDrop: (e: React.DragEvent, sectionId: string, fieldId: string) => void;
    onSectionDragStart: (e: React.DragEvent, sectionId: string) => void;
    onSectionDragOver: (e: React.DragEvent, sectionId: string) => void;
    onSectionDrop: (e: React.DragEvent, sectionId: string) => void;
    dragState: DragState;
    selectedFieldId?: string;
    onSelectField: (field: Field, sectionId: string) => void;
    isSectionOver: boolean;
    isSectionDragging: boolean;
}

function SectionCard({
    section,
    onUpdate,
    onDelete,
    onAddField,
    onDeleteField,
    onDragStart,
    onDragOver,
    onDrop,
    onSectionDragStart,
    onSectionDragOver,
    onSectionDrop,
    dragState,
    selectedFieldId,
    onSelectField,
    isSectionOver,
    isSectionDragging
}: SectionCardProps) {
    const [collapsed, setCollapsed] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const isTable = section.type === 'table';

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [section['instruction'], collapsed]);

    const accentClasses = isTable
        ? { icon: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', ring: 'border-violet-400' }
        : { icon: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', ring: 'border-blue-400' };

    const hasActiveField = section.fields.some(f => f.id === selectedFieldId);

    return (
        <div
            draggable
            onDragStart={e => onSectionDragStart(e, section.id)}
            onDragOver={e => onSectionDragOver(e, section.id)}
            onDrop={e => onSectionDrop(e, section.id)}
            className={`rounded-xl bg-white mb-2.5 border transition-all duration-150
        ${isSectionOver ? `${accentClasses.ring} shadow-[0_0_0_3px_rgba(191,219,254,0.3)]` : hasActiveField ? accentClasses.ring : 'border-gray-200'}
        ${isSectionDragging ? 'opacity-40 shadow-xl' : 'shadow-sm'}
      `}
        >
            <div className={`flex items-center gap-2 px-3 py-2.5 cursor-grab ${!collapsed ? 'border-b border-gray-100' : ''}`}>
                <GripVertical size={14} className="text-gray-300" />

                <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${accentClasses.bg} border ${accentClasses.border}`}>
                    {isTable ? <Table2 size={12} className={accentClasses.icon} /> : <Layers size={12} className={accentClasses.icon} />}
                </div>

                <div className="flex-1 flex items-center gap-2 min-w-0">
                    <input
                        value={section.label || ''}
                        onChange={e => {
                            const val = e.target.value;
                            const newKey = val
                                .trim()
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, '_')
                                .replace(/^_|_$/g, '');
                            onUpdate(section.id, 'label', val);
                            onUpdate(section.id, 'key', newKey);
                        }}
                        onClick={e => e.stopPropagation()}
                        placeholder="Group Label"
                        className="w-1/2 min-w-0 border-none outline-none text-[12px] font-semibold text-gray-900 bg-transparent"
                    />
                    <input
                        value={section.key || ''}
                        onChange={e => onUpdate(section.id, 'key', e.target.value)}
                        onClick={e => e.stopPropagation()}
                        placeholder="group_key"
                        className="w-1/2 min-w-0 border-none outline-none text-[10px] font-mono text-gray-500 bg-transparent"
                    />
                </div>

                <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200 whitespace-nowrap">
                    {isTable ? 'table' : 'group'} · {section.fields.length}
                </span>

                <button onClick={() => onDelete(section.id)} className="text-gray-200 hover:text-red-500 transition-colors p-0.5">
                    <Trash2 size={13} />
                </button>

                <button onClick={() => setCollapsed(p => !p)} className="text-gray-400 hover:text-gray-600 transition-colors p-0.5">
                    {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
            </div>

            {!collapsed && (
                <div className="px-3 pb-3 pt-3">
                    <div className="mb-3">
                        <label className="pl-2 block text-[12px] font-semibold text-gray-700 mb-1">{isTable ? 'Table' : 'Group'} Instruction</label>
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            value={(section['instruction'] as string) ?? ''}
                            onChange={e => onUpdate(section.id, 'instruction', e.target.value)}
                            placeholder={`${isTable ? 'Table' : 'Group'} instruction...`}
                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-[12px] text-gray-700 bg-gray-50 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-colors resize-none overflow-hidden"
                        />
                    </div>

                    {section.fields.map(f => (
                        <FieldRow
                            key={f.id}
                            field={f}
                            sectionId={section.id}
                            onDelete={onDeleteField}
                            onDragStart={onDragStart}
                            onDragOver={onDragOver}
                            onDrop={onDrop}
                            isDragging={dragState.draggingFieldId === f.id}
                            isOver={dragState.overFieldId === f.id}
                            isSelected={selectedFieldId === f.id}
                            onSelect={onSelectField}
                        />
                    ))}

                    <button
                        onClick={() => onAddField(section.id)}
                        className={`w-full py-1.5 border-2 border-dashed border-gray-200 rounded-lg text-[12px] text-gray-400 flex items-center justify-center gap-1.5 transition-all
              ${isTable ? 'hover:border-violet-400 hover:text-violet-600' : 'hover:border-blue-400 hover:text-blue-600'}
            `}
                    >
                        <Plus size={12} /> Add Field
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function TemplateBuilder({ isCreate }: { isCreate?: boolean }) {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const toast = useToastStore();

    const [templateName, setTemplateName] = useState('New Template');

    const [settings, setSettings] = useState<TemplateSettings>(DEFAULT_SETTINGS);
    const [sections, setSections] = useState<Section[]>([]);
    const [saved, setSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);

    // Load existing template in edit mode
    useEffect(() => {
        if (!isCreate && id) {
            setIsLoadingTemplate(true);
            httpRequest('GET', `${config.workflowService}/workflow/agent-templates/${id}`)
                .then((res: any) => {
                    if (res?.success && res.template) {
                        const t = res.template;
                        setTemplateName(t.name || 'Untitled');
                        if (t.settings) setSettings(t.settings);
                        if (t.sections) setSections(t.sections);
                        if (t.updatedAt) setUpdatedAt(t.updatedAt);
                    }
                })
                .catch((err: any) => console.error('Failed to load template', err))
                .finally(() => setIsLoadingTemplate(false));
        }
    }, [id, isCreate]);
    const [selectedField, setSelectedField] = useState<SelectedField | null>(null);
    const [showTemplateSettings, setShowTemplateSettings] = useState(false);

    const [dragState, setDragState] = useState<DragState>({});
    const dragPayload = useRef<DragPayload>({});

    const [panelPcts, setPanelPcts] = useState({ left: 30, mid: 35 });
    const containerRef = useRef<HTMLDivElement>(null);

    const startResizeLeft = useCallback((e: React.MouseEvent) => {
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMove = (ev: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            let newLeftPct = ((ev.clientX - rect.left) / rect.width) * 100;

            setPanelPcts(prev => {
                const maxLeftPct = 90 - prev.mid;
                newLeftPct = Math.max(5, Math.min(newLeftPct, maxLeftPct));
                return { ...prev, left: newLeftPct };
            });
        };

        const onUp = () => {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, []);

    const startResizeMid = useCallback((e: React.MouseEvent) => {
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMove = (ev: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();

            setPanelPcts(prev => {
                let newMidRightEdge = ((ev.clientX - rect.left) / rect.width) * 100;
                let newMidPct = newMidRightEdge - prev.left;
                newMidPct = Math.max(10, Math.min(newMidPct, 95 - prev.left));
                return { ...prev, mid: newMidPct };
            });
        };

        const onUp = () => {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, []);

    const updateSection = (id: string, key: keyof Section, val: string) => setSections(s => s.map(sec => (sec.id === id ? { ...sec, [key]: val } : sec)));

    const deleteSection = (id: string) => {
        setSections(s => s.filter(sec => sec.id !== id));
        if (selectedField?.sectionId === id) setSelectedField(null);
    };

    const addField = (sectionId: string) => {
        const f = DEFAULT_FIELD();
        setSections(s => s.map(sec => (sec.id === sectionId ? { ...sec, fields: [...sec.fields, f] } : sec)));
        setSelectedField({ field: f, sectionId });
    };

    const deleteField = (sectionId: string, fieldId: string) => {
        setSections(s => s.map(sec => (sec.id === sectionId ? { ...sec, fields: sec.fields.filter(f => f.id !== fieldId) } : sec)));
        if (selectedField?.field.id === fieldId) setSelectedField(null);
    };

    const updateField = (sectionId: string, fieldId: string, patch: Partial<Field>) => {
        setSections(s => s.map(sec => (sec.id === sectionId ? { ...sec, fields: sec.fields.map(f => (f.id === fieldId ? { ...f, ...patch } : f)) } : sec)));
        if (selectedField?.field.id === fieldId) setSelectedField(prev => (prev ? { ...prev, field: { ...prev.field, ...patch } } : null));
    };

    const onSelectField = (field: Field, sectionId: string) => {
        setSelectedField(prev => (prev?.field.id === field.id ? null : { field, sectionId }));
        setShowTemplateSettings(false);
    };

    // Field DnD
    const onFieldDragStart = (e: React.DragEvent, sectionId: string, fieldId: string) => {
        dragPayload.current = { type: 'field', sectionId, fieldId };
        setDragState(p => ({ ...p, draggingFieldId: fieldId }));
        e.stopPropagation();
    };
    const onFieldDragOver = (e: React.DragEvent, sectionId: string, fieldId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDragState(p => ({ ...p, overFieldId: fieldId }));
    };
    const onFieldDrop = (e: React.DragEvent, targetSectionId: string, targetFieldId: string) => {
        e.preventDefault();
        e.stopPropagation();
        const { type, sectionId: srcSec, fieldId: srcField } = dragPayload.current;
        if (type !== 'field' || srcField === targetFieldId) {
            setDragState({});
            return;
        }
        setSections(prev => {
            const next = prev.map(sec => ({ ...sec, fields: [...sec.fields] }));
            const srcSecObj = next.find(s => s.id === srcSec);
            const tgtSecObj = next.find(s => s.id === targetSectionId);
            if (!srcSecObj || !tgtSecObj || !srcField) return prev;
            const field = srcSecObj.fields.find(f => f.id === srcField);
            if (!field) return prev;
            srcSecObj.fields = srcSecObj.fields.filter(f => f.id !== srcField);
            const tgtIdx = tgtSecObj.fields.findIndex(f => f.id === targetFieldId);
            tgtSecObj.fields.splice(tgtIdx, 0, field);
            return next;
        });
        setDragState({});
    };

    // Section DnD
    const onSectionDragStart = (e: React.DragEvent, sectionId: string) => {
        dragPayload.current = { type: 'section', sectionId };
        setDragState(p => ({ ...p, draggingSectionId: sectionId }));
    };
    const onSectionDragOver = (e: React.DragEvent, sectionId: string) => {
        e.preventDefault();
        if (dragPayload.current.type === 'section') setDragState(p => ({ ...p, overSectionId: sectionId }));
    };
    const onSectionDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        const { type, sectionId: srcId } = dragPayload.current;
        if (type !== 'section' || srcId === targetId) {
            setDragState({});
            return;
        }
        setSections(prev => {
            const next = [...prev];
            const srcIdx = next.findIndex(s => s.id === srcId);
            const tgtIdx = next.findIndex(s => s.id === targetId);
            const [item] = next.splice(srcIdx, 1);
            next.splice(tgtIdx, 0, item);
            return next;
        });
        setDragState({});
    };

    const handleSave = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            const payload = { name: templateName, settings, sections };
            let res: any;
            if (isCreate) {
                res = await httpRequest('POST', `${config.workflowService}/workflow/agent-templates`, payload);
            } else if (id) {
                res = await httpRequest('PATCH', `${config.workflowService}/workflow/agent-templates/${id}`, payload);
            }
            if (res?.template?.updatedAt) {
                setUpdatedAt(res.template.updatedAt);
            } else {
                setUpdatedAt(new Date().toISOString());
            }
            setSaved(true);
            setTimeout(() => {
                setSaved(false);
            }, 1000);
        } catch (err) {
            console.error('Failed to save template', err);
            alert('Failed to save template. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const liveField = selectedField ? (sections.find(s => s.id === selectedField.sectionId)?.fields.find(f => f.id === selectedField.field.id) ?? null) : null;
    const showingField = !!liveField;

    const totalFields = sections.reduce((a, s) => a + s.fields.length, 0);

    if (isLoadingTemplate) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center h-full bg-slate-50 gap-3">
                <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <span className="text-sm text-gray-500">Loading template...</span>
            </div>
        );
    }

    return (
        <div className=" flex flex-col bg-slate-50 font-sans w-full">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-5 flex items-center h-16 gap-3 flex-shrink-0">
                <button
                    onClick={() => navigate('/agent/template/list')}
                    className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 hover:bg-gray-200 transition-colors cursor-pointer border border-gray-200"
                    title="Back to templates"
                >
                    <ArrowLeft size={15} className="text-gray-600" />
                </button>
                <div className="w-8 h-8 rounded-lg bg-blue-900 flex items-center justify-center flex-shrink-0">
                    <FileText size={15} className="text-white" />
                </div>

                <input
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    className="flex-1 border-none outline-none text-[15px] font-semibold text-gray-900 bg-transparent max-w-sm"
                />

                <div className="ml-auto flex items-center gap-2">
                    {updatedAt && <div className="text-[12px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-md border border-gray-200">Last updated: {new Date(updatedAt).toLocaleString()}</div>}
                    <div className="text-[12px] text-gray-500 bg-gray-100 px-2.5 py-1 rounded-md border border-gray-200">
                        {settings.llmProvider} · {settings.llmModel}
                    </div>
                    <button
                        onClick={() => {
                            const data = {
                                name: templateName,
                                settings,
                                sections
                            };
                            navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                            toast.success('Template exported to clipboard');
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 bg-white text-[13px] text-gray-700 font-medium cursor-pointer transition-colors duration-200 hover:bg-gray-50"
                    >
                        <Copy size={14} />
                        Export Template
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border-none text-[13px] text-white font-medium cursor-pointer transition-colors duration-200 disabled:opacity-60 ${saved ? 'bg-green-600' : 'bg-blue-900 hover:bg-blue-800'}`}
                    >
                        {saved ? <Check size={14} /> : <Save size={14} />}
                        {isSaving ? 'Saving...' : saved ? 'Saved!' : isCreate ? 'Create Template' : 'Save Template'}
                    </button>
                </div>
            </header>

            {/* Body */}
            <div ref={containerRef} className="flex-1 flex overflow-hidden">
                {/* Left: Empty Panel */}
                <div className="flex-shrink-0 flex flex-col bg-white border-r border-gray-200 overflow-hidden" style={{ width: `${panelPcts.left}%` }}>
                    <div className="p-4 flex-1 overflow-y-auto text-[12px] text-gray-400 flex items-center justify-center font-medium bg-slate-50">Panel 1 (Empty)</div>
                </div>

                {/* Resize Handle 1 */}
                <div
                    onMouseDown={startResizeLeft}
                    className="w-1 flex-shrink-0 cursor-col-resize bg-transparent hover:bg-blue-200 transition-colors duration-150 z-10 relative after:absolute after:inset-y-0 after:-inset-x-1 after:z-10"
                />

                {/* Mid: Field List */}
                <div className="flex-shrink-0 flex flex-col bg-white border-r border-gray-200 overflow-hidden" style={{ width: `${panelPcts.mid}%` }}>
                    <div className="px-3.5 py-2.5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                        <span className="text-[11px] font-bold text-gray-600 uppercase tracking-widest">
                            Fields <span className="font-normal text-gray-400 normal-case tracking-normal">{totalFields} total</span>
                        </span>
                        <div className="flex gap-1.5">
                            <button
                                onClick={() => setSections(p => [...p, DEFAULT_GROUP()])}
                                className="flex items-center gap-1 px-2.5 py-1 border border-blue-200 rounded-md bg-blue-50 text-[11px] text-blue-600 font-semibold hover:bg-blue-100 transition-colors cursor-pointer"
                            >
                                <Plus size={11} />
                                <Layers size={11} /> Group
                            </button>
                            <button
                                onClick={() => setSections(p => [...p, DEFAULT_TABLE()])}
                                className="flex items-center gap-1 px-2.5 py-1 border border-violet-200 rounded-md bg-violet-50 text-[11px] text-violet-600 font-semibold hover:bg-violet-100 transition-colors cursor-pointer"
                            >
                                <Plus size={11} />
                                <Table2 size={11} /> Table
                            </button>
                        </div>
                    </div>

                    <div
                        className="flex-1 overflow-y-auto p-3"
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                            if (dragPayload.current.type === 'section' && sections.length) onSectionDrop(e, sections[sections.length - 1].id);
                        }}
                    >
                        {sections.length === 0 ? (
                            <div className="text-center py-10 px-4">
                                <Layers size={28} className="text-gray-300 mx-auto mb-2" />
                                <div className="text-[13px] font-medium text-gray-500">No sections yet</div>
                                <div className="text-[12px] text-gray-400">Add a group or table above</div>
                            </div>
                        ) : (
                            sections.map(sec => (
                                <SectionCard
                                    key={sec.id}
                                    section={sec}
                                    onUpdate={updateSection}
                                    onDelete={deleteSection}
                                    onAddField={addField}
                                    onDeleteField={deleteField}
                                    onDragStart={onFieldDragStart}
                                    onDragOver={onFieldDragOver}
                                    onDrop={onFieldDrop}
                                    onSectionDragStart={onSectionDragStart}
                                    onSectionDragOver={onSectionDragOver}
                                    onSectionDrop={onSectionDrop}
                                    dragState={dragState}
                                    isSectionOver={dragState.overSectionId === sec.id}
                                    isSectionDragging={dragState.draggingSectionId === sec.id}
                                    selectedFieldId={selectedField?.field.id}
                                    onSelectField={onSelectField}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* Resize Handle 2 */}
                <div
                    onMouseDown={startResizeMid}
                    className="w-1 flex-shrink-0 cursor-col-resize bg-transparent hover:bg-blue-200 transition-colors duration-150 z-10 relative after:absolute after:inset-y-0 after:-inset-x-1 after:z-10"
                />

                {/* Right: Settings Panel */}
                <div className="flex-1 flex flex-col bg-white overflow-hidden">
                    <div className="h-11 flex-shrink-0 border-b border-gray-100 flex items-center px-1">
                        {showingField ? (
                            <div className="flex items-center gap-1.5 px-4 text-[12px] font-bold text-gray-800">
                                <Settings size={13} />
                                <span className="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">{liveField!.label}</span>
                            </div>
                        ) : showTemplateSettings ? (
                            <div className="flex items-center gap-1.5 px-4 text-[12px] font-bold text-gray-800">
                                <Zap size={13} />
                                <span>Template Settings</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-4 text-[12px] font-bold text-gray-500">
                                <span>Settings</span>
                            </div>
                        )}

                        {(!showTemplateSettings || showingField) && (
                            <button
                                onClick={() => {
                                    setSelectedField(null);
                                    setShowTemplateSettings(true);
                                }}
                                className="ml-auto flex items-center gap-1.5 px-4 border-none bg-transparent cursor-pointer text-[12px] transition-all duration-100 font-medium text-gray-500 hover:text-gray-700"
                            >
                                <Zap size={13} /> Template Settings
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-hidden">
                        {showingField && liveField && selectedField ? (
                            <FieldSettingsPanel field={liveField} sectionId={selectedField.sectionId} onUpdate={updateField} onClose={() => setSelectedField(null)} />
                        ) : showTemplateSettings ? (
                            <TemplateSettingsPanel settings={settings} onChange={setSettings} />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                <MousePointerClick size={32} className="mb-3 text-gray-300" />
                                <p className="text-[13px] font-medium text-gray-500">No item selected</p>
                                <p className="text-[12px] mt-1 text-gray-400">Select a field or open template settings</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
