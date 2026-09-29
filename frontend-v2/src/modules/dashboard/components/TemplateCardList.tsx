import { ChevronRight } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboardState } from '../hooks/dashboardContext';
import { useDashboardApi } from '../hooks/useDashboardApi';
import { TemplateCardComponent } from '../../docsnap/template/list-template/components/TemplateCard';

interface TemplateCardsComponentIF {
    module: string;
}

export const TemplateCardListComponent: React.FC<TemplateCardsComponentIF> = ({ module }) => {
    const { state, setState } = useDashboardState();
    const [cardsPerRow, setCardsPerRow] = useState(4);
    const { getTemplatesApi, getPredefinedTemplatesApi } = useDashboardApi();

    // Calculate how many cards can fit based on screen width
    const calculateCardsPerRow = useCallback(() => {
        const screenWidth = window.innerWidth;
        const cardMinWidth = 340; // min-w-85 = 340px
        const containerPadding = 48; // accounting for container padding
        const gapBetweenCards = 24; // gap-6 = 24px

        // Calculate maximum cards that can fit
        const availableWidth = screenWidth - containerPadding;
        const maxCards = Math.floor((availableWidth + gapBetweenCards) / (cardMinWidth + gapBetweenCards));

        // Ensure at least 2 cards (1 template + 1 "View All") and max 6 cards
        return Math.max(2, Math.min(maxCards, 6));
    }, []);

    useEffect(() => {
        const handleResize = () => {
            setCardsPerRow(calculateCardsPerRow());
        };

        // Set initial value
        handleResize();

        // Add resize listener
        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => window.removeEventListener('resize', handleResize);
    }, [calculateCardsPerRow]);

    useEffect(() => {
        getTemplatesApi(module);
        getPredefinedTemplatesApi();
    }, [module]);

    // Calculate how many template cards to show (reserve 1 slot for "View All")
    const templatesToShow = Math.max(0, cardsPerRow - 1);

    const onClickUploadButton = (template: any) => {
        const recentlyUsedTemplates = JSON.parse(localStorage.getItem('recentlyUsedTemplates') || '[]');
        const filteredTemplates = recentlyUsedTemplates.filter((item: any) => item !== template._id);
        const finalTemplates = [template._id, ...filteredTemplates];
        localStorage.setItem('recentlyUsedTemplates', JSON.stringify(finalTemplates));
        setState({ ...state, showUploadDocumentDialog: true, selectedTemplate: template, refresh: state.refresh + 1 });
        getTemplatesApi(module);
    };

    const onClickManualButton = (template: any) => {
        setState({ ...state, showUploadDocumentDialog: true, selectedTemplate: template, showManualInputForm: true });
    };
    const visibleTemplates = state.templates.slice(0, templatesToShow);

    return (
        <div className="relative">
            {state.loadingTemplates ? (
                <div className="flex min-h-40 gap-6">
                    {Array.from({ length: cardsPerRow }).map((_, idx) => (
                        <TemplateCardComponent key={idx} isLoading flexBasis={`${100 / cardsPerRow}%`} />
                    ))}
                </div>
            ) : visibleTemplates.length > 0 ? (
                <div className="flex min-h-40 gap-6">
                    {visibleTemplates.map((template, idx) => (
                        <TemplateCardComponent
                            key={idx}
                            template={template}
                            flexBasis={`${100 / cardsPerRow}%`}
                            onClickUpload={() => onClickUploadButton(template)}
                            refreshPage={() => getTemplatesApi(module)}
                            onClickManualButton={() => onClickManualButton(template)}
                        />
                    ))}
                    {state.totalTemplates > templatesToShow && <ViewAllCard totalTemplates={state.totalTemplates} flexBasis={`${100 / cardsPerRow}%`} />}
                </div>
            ) : (
                <div className="flex h-40 w-full items-center justify-center rounded-2xl bg-white text-gray-400">
                    Your recently created template will appear here
                </div>
            )}
        </div>
    );
};

interface ViewAllCardProps {
    flexBasis: string;
    totalTemplates: number;
}

const ViewAllCard: React.FC<ViewAllCardProps> = ({ flexBasis, totalTemplates }) => {
    const navigate = useNavigate();

    return (
        <div
            onClick={() => navigate('/docsnap/template/list')}
            className="cursor-pointer rounded-2xl border border-sky-200 bg-white transition hover:bg-gray-50"
            style={{ flexBasis, minWidth: 0 }}
        >
            <div className="flex h-40 items-center justify-center">
                <div className="flex items-center gap-2 text-sky-600">
                    <span className="text-sm font-medium">View All {totalTemplates} Templates</span>
                    <ChevronRight size={16} />
                </div>
            </div>
        </div>
    );
};
