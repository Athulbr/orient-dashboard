import React from 'react';
import { RotateCw, Search, X, MoreVertical } from 'lucide-react';
import { Button } from '../../../../../components/Button';
import { Dropdown } from '../../../../../components/Dropdown';
import { SingleSelect } from '../../../../../components/SingleSelect';
import DateTimePicker from '../../../../../components/DateTimePicker';
import { useNavigate } from 'react-router-dom';
import { usePermissionStore } from '../../../../../zustand-store/PermissionStore';

interface OrderFiltersBarProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    statusFilter: string;
    onStatusChange: (value: string) => void;
    orderTypeFilter: string;
    onOrderTypeChange: (value: string) => void;
    branchFilter: string;
    onBranchChange: (value: string) => void;
    dateRange: { startDate: string; endDate: string };
    onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
    onReset: () => void;
    onCreateOrder: () => void;
}

const OrderFiltersBar: React.FC<OrderFiltersBarProps> = ({
    searchQuery,
    onSearchChange,
    statusFilter,
    onStatusChange,
    orderTypeFilter,
    onOrderTypeChange,
    dateRange,
    onDateRangeChange,
    onReset,
    onCreateOrder
}) => {
    const navigate = useNavigate();

    const menuOptions = [
        { label: 'Scanned Documents', value: 'scannedDocuments', path: '/agent/scanned-documents' },
        { label: 'Server Status', value: 'ServerStatus', path: '/agent/health' }
    ];
    const { checkPermission } = usePermissionStore();
    const viewReportAccess = checkPermission('view:report');
    if (viewReportAccess) {
        menuOptions.push({ label: 'Daily Report', value: 'dailyReport', path: '/agent/daily-report' });
        menuOptions.push({ label: 'Field Corrections', value: 'fieldCorrections', path: '/agent/field-corrections' });
    }

    const handleMenuSelect = (label: string) => {
        const option = menuOptions.find(o => o.label === label);
        if (option?.path) {
            navigate(option.path);
        }
    };

    return (
        <div className="px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-10 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">Orient ExchangeOrders</h1>
                    {/* <h1 className="text-xl font-bold text-gray-900">Orient Exchange Orders</h1> */}
                    <p className="text-xs text-gray-500 mt-1">Review documents from all sources and proceed with extraction.</p>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                    <div className="relative w-64">
                        <input
                            type="text"
                            className="w-full h-10 pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-0.5 focus:ring-blue-400 focus:border-blue-400"
                            placeholder="Name, Email, or Order Number"
                            value={searchQuery}
                            onChange={e => onSearchChange(e.target.value)}
                        />
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    </div>
                    <SingleSelect
                        className="min-w-40"
                        value={statusFilter}
                        onValueChange={onStatusChange}
                        options={[
                            { label: 'All Status', value: 'all' },
                            { label: 'Extraction Pending', value: 'pending', color: '#4169E1' },
                            { label: 'Review Pending', value: 'extracted', color: 'orange' },
                            { label: 'Maraekat Submitted', value: 'submitted', color: 'green' },
                            { label: 'Extraction Failed', value: 'failed', color: 'red' }
                        ]}
                    />
                    <SingleSelect
                        className="min-w-32"
                        value={orderTypeFilter}
                        onValueChange={onOrderTypeChange}
                        options={[
                            { label: 'All Orders', value: 'all' },
                            { label: 'Sell Orders', value: 'sell' },
                            { label: 'Buy Orders', value: 'buy' }
                        ]}
                    />
                    <div className="flex flex-col gap-1">
                        <DateTimePicker
                            minDate="2026-01-01"
                            // maxDate={new Date().toISOString()}
                            onChange={onDateRangeChange}
                            initialStartDate={dateRange.startDate}
                            initialEndDate={dateRange.endDate}
                        />
                    </div>
                    <Button title="Reset Filters" startIcon={<X size={16} />} onClick={onReset} outlined></Button>
                    <Button startIcon={<RotateCw size={16} />} onClick={onReset} outlined>
                        Refresh
                    </Button>
                    <Button onClick={onCreateOrder}>Create Order</Button>
                    <Dropdown options={menuOptions.map(opt => opt.label)} onChange={handleMenuSelect}>
                        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-800 hover:bg-gray-100 cursor-pointer">
                            <MoreVertical size={16} />
                        </div>
                    </Dropdown>
                </div>
            </div>
        </div>
    );
};

export default OrderFiltersBar;
