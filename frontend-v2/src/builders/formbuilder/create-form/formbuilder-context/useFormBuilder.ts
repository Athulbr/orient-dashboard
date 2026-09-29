// useFormBuilder.ts
import { useContext } from 'react';
import { FormBuilderContextType } from '../../interface';
import { FormBuilderContext } from './FormbuilderContext';

export const useFormBuilder = (): FormBuilderContextType => {
    const context = useContext(FormBuilderContext);
    if (!context) {
        throw new Error('useFormBuilder must be used within a FormBuilderProvider');
    }
    return context;
};
