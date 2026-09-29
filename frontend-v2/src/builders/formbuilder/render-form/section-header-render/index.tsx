import React from 'react';
import style from './section.module.css';
import { FieldConfigIF, InputFieldRenderPropsIF } from '../../interface';
import { cn } from '../../../../global-utils/twMerge';
import { AppWindow, Section } from 'lucide-react';

export const SectionHeaderRender: React.FC<InputFieldRenderPropsIF> = ({ index, fields }) => {
    const sectionHeader = fields.find((field, i) => field.type === 'section_header' && i < index);
    return (
        <div className={cn(style.container, sectionHeader ? 'mt-6' : '', 'flex items-center gap-2')}>
            <AppWindow size={20} /> {fields[index].label}
        </div>
    );
};

export const validateSectionHeader = (value: number, config: FieldConfigIF): string => {
    return '';
};
