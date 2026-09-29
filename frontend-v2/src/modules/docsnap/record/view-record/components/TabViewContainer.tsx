import React, { ReactNode, useEffect, useMemo } from 'react';
import { TabNavComponent } from '../../components/TabNav/TabNav';
import { useViewRecordState } from '../hooks/viewRecordContext';
import { useParams } from 'react-router-dom';
import { useViewRecordApi } from '../hooks/useViewRecordApi';
import { useRecordViewTour } from '../../../../inApp-Tour/hooks/useRecordViewTour';

interface DataPreviewComponentIF {
    tabContents: {
        [key: string]: ReactNode;
    };
}

export const TabViewContainer: React.FC<DataPreviewComponentIF> = ({ tabContents }) => {
    const { state, setState } = useViewRecordState();
    const { id } = useParams();
    const { getRecordApiById } = useViewRecordApi();

    // Get tour function
    const startRecordViewTour = useRecordViewTour();

    useEffect(() => {
        if (!id) return;
        getRecordApiById(id).then(() => {
            setTimeout(() => {
                startRecordViewTour();
            }, 800);
        });
    }, [id]);

    // console.log('state.templateSettings:===========', state.templateSettings);

    // ✅ useMemo returns an array, not a function
    const tabs = useMemo(() => {
        const baseTabs = [
            { id: 'extractedData', title: 'Extracted Data', templateSettingKey: 'enableExtractedData' },
            { id: 'chatWithDocument', title: 'Chat with Document', templateSettingKey: 'enableChatWithDocument' },
            { id: 'contentCreation', title: 'Content Creation', templateSettingKey: 'enableContentCreation' },
            { id: 'invoiceGenerator', title: 'Invoice Generator', templateSettingKey: 'enableInvoiceGenerator' }
        ];
        return baseTabs.filter(tab => state.templateSettings?.[tab.templateSettingKey] || tab.id === 'extractedData');
    }, [state.templateSettings]);

    // ✅ safe fallback for tabIndex
    const currentTab = tabs[state.tabIndex ?? 0];
    const tabContent = currentTab ? tabContents[currentTab.id] : null;

    return (
        <div className="flex h-full w-full flex-col border-l bg-gray-50">
            <TabNavComponent tabs={tabs} className="relative z-20 border-b" onChange={tabIndex => setState(prev => ({ ...prev, tabIndex }))} />
            <div className="flex flex-1 flex-col overflow-hidden">{tabContent}</div>
        </div>
    );
};
