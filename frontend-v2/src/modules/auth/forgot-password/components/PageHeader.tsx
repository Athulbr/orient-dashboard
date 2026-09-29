import { FC } from 'react';

interface PageHeaderProps {
    title: string;
    subtitle: string;
}

export const PageHeader: FC<PageHeaderProps> = ({ title, subtitle }) => {
    return (
        <section className="mt-8 flex flex-col gap-1">
            <h1 className="text-[32px] font-semibold">{title}</h1>
            <p className="text-sm text-gray-500">{subtitle}</p>
        </section>
    );
};
