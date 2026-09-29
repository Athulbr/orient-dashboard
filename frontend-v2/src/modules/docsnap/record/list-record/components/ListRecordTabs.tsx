type TabOption = 'Invoice' | 'PO' | 'Sales Order' | 'Sales Invoice';

interface ListRecordTabsProps {
    activeTab: TabOption;
    onChange: (tab: TabOption) => void;
}

export const ListRecordTabs: React.FC<ListRecordTabsProps> = ({ activeTab, onChange }) => {
    return (
        <div className="flex border-b border-gray-200">
            {(['Invoice', 'PO', 'Sales Order', 'Sales Invoice'] as TabOption[]).map((tab) => (
                <button
                    key={tab}
                    onClick={() => {
                        onChange(tab);
                        console.log('Selected tab:', tab);
                    }}
                    className={`px-6 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                        activeTab === tab
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    {tab}
                </button>
            ))}
        </div>
    );
};

export type { TabOption };
