import { ReactNode, useEffect } from 'react';
import React from 'react';
import { useParams } from 'react-router-dom';
import { TabNavComponent } from '../../../record/components/TabNav/TabNav';
import { useViewTemplateState } from '../hooks/viewTemplateContext';
import { useViewTemplateApi } from '../hooks/useViewTemplateApi';
interface DataPreviewComponentIF {
    children: ReactNode;
}

export const TabViewContainer: React.FC<DataPreviewComponentIF> = ({ children }) => {
    const { state, setState } = useViewTemplateState();

    const { id } = useParams();
    const { getTemplateByIdApi } = useViewTemplateApi();
    useEffect(() => {
        if (!id) return;
        getTemplateByIdApi(id);
    }, [id]);
    const tabs = [
        { id: 'recordList', title: 'Record List' },
        { id: 'templateFields', title: 'Template Fields' },
        { id: 'analytics', title: 'Analytics' },
        { id: 'training', title: 'Training' },
        { id: 'configuration', title: 'Configuration' }
    ];

    return (
        <div className={`flex h-full w-full flex-col bg-white`}>
            <TabNavComponent
                tabs={tabs}
                className="relative z-20 border border-b-gray-100 bg-white !pt-2 !pl-6"
                onChange={tabIndex => setState(prev => ({ ...prev, tabIndex }))}
            />
            <div className="flex flex-1 flex-col overflow-hidden px-6">
                {state.tabIndex === 0
                    ? React.Children.toArray(children)[0]
                    : state.tabIndex === 1
                      ? React.Children.toArray(children)[1]
                      : state.tabIndex === 2
                        ? React.Children.toArray(children)[2]
                        : state.tabIndex === 3
                          ? React.Children.toArray(children)[3]
                          : React.Children.toArray(children)[4]}
            </div>
        </div>
    );
};
