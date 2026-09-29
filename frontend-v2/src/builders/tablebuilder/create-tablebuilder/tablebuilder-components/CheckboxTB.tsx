import { LucideIcon } from 'lucide-react';

interface CheckboxTBProps {
    id: string;
    label: string;
    className?: string;
    checked: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    icon?: LucideIcon;
}

export const CheckboxTB: React.FC<CheckboxTBProps> = ({ id, label, checked, onChange, icon: Icon, className }) => {
    return (
        <div className={`flex items-center gap-1.5 ${className}`}>
            <input type="checkbox" id={id} className="h-3 w-3 cursor-pointer" checked={checked} onChange={onChange} />
            <label htmlFor={id} className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-700 select-none">
                {Icon && <Icon size={16} />} {label}
            </label>
        </div>
    );
};
