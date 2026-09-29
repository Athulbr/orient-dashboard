import { ReactNode } from 'react';

interface CheckboxGroupIF {
    name?: ReactNode;
    children: ReactNode;
    row?: boolean;
}

export const CheckboxGroupTB: React.FC<CheckboxGroupIF> = ({ name, children, row }) => {
    return (
        <div className={`flex ${row ? 'flex-row' : 'flex-col'} gap-2`}>
            {name && <label className="">{name}</label>}
            {children}
        </div>
    );
};
