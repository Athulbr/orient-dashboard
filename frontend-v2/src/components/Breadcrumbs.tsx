import { useNavigate } from 'react-router-dom';
import { cn } from '../global-utils/twMerge';

interface BreadcrumbsIF {
    page: string;
    className?: string;
    pageName?: string;
}

const Breadcrumbs: React.FC<BreadcrumbsIF> = ({ page, className, pageName }) => {
    const navigate = useNavigate();
    const breadcrumbs = {
        listTranscripts: [{ text: 'Mediacl', path: '/' }, { text: '/' }, { text: 'Transcripts' }],
        listRecord: [{ text: 'Docsnap', path: '/' }, { text: '/' }, { text: 'Records' }],
        UserAccount: [{ text: 'Home', path: '/' }, { text: '/' }, { text: 'Account Details' }],
        // Checked ^
        listProject: [{ text: 'Settings' }, { text: '/' }, { text: 'Projects' }],
        updateTemplate: [
            { text: 'Docsnap', path: '/' },
            { text: '/' },
            { text: 'Templates', path: '/docsnap/template/list' },
            { text: '/' },
            { text: 'Update Template' }
        ],
        viewTemplate: [
            { text: 'Docsnap', path: '/' },
            { text: '/' },
            { text: 'Templates', path: '/docsnap/template/list' },
            { text: '/' },
            { text: pageName || '' }
        ],
        listUpdatedField: [{ text: 'Settings' }, { text: '/' }, { text: 'Updated Fields' }],
        listTemplate: [{ text: 'Docsnap', path: '/' }, { text: '/' }, { text: 'Templates', path: '/docsnap/template/list' }],
        viewRecord: [{ text: 'Docsnap', path: '/' }, { text: '/' }, { text: 'View Record' }]
    };

    const getBreadcrumb = () => {
        try {
            return breadcrumbs[page as keyof typeof breadcrumbs];
        } catch (error) {
            console.error('error:===========', error);
            return [{ text: 'Error' }];
        }
    };

    return (
        <div className={cn('flex gap-2 pl-1 text-xs font-light text-gray-500', className)}>
            {getBreadcrumb()?.map((item: any, i: number) => {
                return (
                    <div
                        onClick={item.path ? () => navigate(item.path) : () => {}}
                        key={i}
                        className={cn(
                            item.path ? 'cursor-pointer hover:text-blue-400' : 'cursor-default',
                            i === getBreadcrumb()?.length - 1 ? 'text-gray-900' : ''
                        )}
                    >
                        {item.text}
                    </div>
                );
            })}
        </div>
    );
};

export default Breadcrumbs;
