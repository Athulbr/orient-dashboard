import { useEffect, useState } from 'react';
import { Button } from '../../../../../components/Button';
import { useToastStore } from '../../../../../components/toast/ToastStore';
import { X } from 'lucide-react';
import httpRequest from '../../../../../global-utils/httpRequest';
import { DatePicker } from '../../../../../builders/tablebuilder/render-tablebuilder/components/DatePicker';
import { config } from '../../../../../config/default';

interface SubDealer {
    name: string;
    location: string;
    selected: boolean;
}

interface Dealer {
    name: string;
    subDealers: SubDealer[];
}

interface DealerListComponentProps {
    isOpen: boolean;
    closeDialog: () => void;
    onSubmit: (dealers: Dealer[], startDate: null | Date, endDate: null | Date) => void;
}

const DealerListComponent = ({ isOpen, closeDialog, onSubmit }: DealerListComponentProps) => {
    const [dealersData, setDealersData] = useState<Dealer[]>([]);
    const toast = useToastStore();
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [selectAll, setSelectAll] = useState(false);

    // useEffect(() => {
    //     const getDealerList = async () => {
    //         try {
    //             const res = await httpRequest('POST', `${config.nodeApiUrl}/idp/history/list/dealers`);
    //             setDealersData(res.data?.dealers);
    //         } catch (error) {
    //             toast.error('Failed to fetch dealer list');
    //         }
    //     };
    //     getDealerList();
    // }, []);

    const [expandedDealer, setExpandedDealer] = useState<string | null>(null);

    const toggleDealerExpansion = (dealerName: string) => {
        setExpandedDealer(expandedDealer === dealerName ? null : dealerName);
    };

    const handleDealerChange = (dealerName: string, isSelected: boolean) => {
        setDealersData(prevData =>
            prevData.map(dealer =>
                dealer.name === dealerName
                    ? {
                          ...dealer,
                          subDealers: dealer.subDealers.map(subDealer => ({
                              ...subDealer,
                              selected: isSelected
                          }))
                      }
                    : dealer
            )
        );
    };

    const handleSubDealerChange = (dealerName: string, subDealerName: string, isSelected: boolean) => {
        setDealersData(prevData =>
            prevData.map(dealer =>
                dealer.name === dealerName
                    ? {
                          ...dealer,
                          subDealers: dealer.subDealers.map(subDealer =>
                              subDealer.name === subDealerName ? { ...subDealer, selected: isSelected } : subDealer
                          )
                      }
                    : dealer
            )
        );
    };

    const handleSubmit = () => {
        const selectedDealers = dealersData
            .map(dealer => ({
                ...dealer,
                subDealers: dealer.subDealers.filter(subDealer => subDealer.selected)
            }))
            .filter(dealer => dealer.subDealers.length > 0);

        if (!selectAll && (!startDate || !endDate)) {
            toast.error('Please select date range');
            return;
        }
        onSubmit(selectedDealers, startDate, endDate);
    };

    const selectedDealers = dealersData
        .map(dealer => ({
            ...dealer,
            subDealers: dealer.subDealers.filter(subDealer => subDealer.selected)
        }))
        .filter(dealer => dealer.subDealers.length > 0);

    // Check if all subdealers are selected
    const allSubdealers = dealersData.flatMap(dealer => dealer.subDealers);
    const allSelected = allSubdealers.length > 0 && allSubdealers.every(sd => sd.selected);
    const someSelected = allSubdealers.some(sd => sd.selected) && !allSelected;

    const handleSelectAll = (isSelected: boolean) => {
        setDealersData(prevData =>
            prevData.map(dealer => ({
                ...dealer,
                subDealers: dealer.subDealers.map(subDealer => ({
                    ...subDealer,
                    selected: isSelected
                }))
            }))
        );
    };

    return (
        <div className={`fixed inset-0 z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="absolute inset-0 bg-gray-600 opacity-50" onClick={closeDialog}></div>
            {/* h-screen (temporarly removed this from next line) replaced with  h-[calc(100vh-71vh)] */}
            <div className="fixed right-0 top-0 h-[calc(100vh-40vh)] w-1/3 min-w-120  bg-white shadow-lg  overflow-y-auto">
                <div className="sticky top-0 z-10 bg-white">
                    <div className="flex bg-white top-0 z-10 justify-between items-center p-6">
                        <h1 className="text-xl font-bold">Choose Date Range</h1>
                        <button onClick={closeDialog} className="text-gray-500 hover:text-gray-700 cursor-pointer p-2 hover:bg-gray-100 rounded-full ">
                            <X className="text-gray-500 hover:text-gray-700" onClick={closeDialog} />
                        </button>
                    </div>
                    <div className="px-8 pb-4 font-semibold flex flex-col">
                        <div className="pb-4 flex">
                            <DatePicker
                                from={startDate}
                                to={endDate}
                                onSubmit={(from, to) => {
                                    setStartDate(from);
                                    setEndDate(to);
                                }}
                                disableFutureDates={true}
                                disabled={selectAll}
                            />
                        </div>
                        <h4 className="flex items-center pl-13">or</h4>

                        <div className="flex items-center pl-2 mt-3">
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                checked={selectAll}
                                ref={input => {
                                    if (input) input.indeterminate = someSelected;
                                }}
                                onChange={e => {
                                    setSelectAll(e.target.checked);
                                    // handleSelectAll(e.target.checked);
                                }}
                                id="selectAll"
                                disabled={startDate && endDate ? true : false}
                            />
                            <label htmlFor="selectAll" className="ml-2 cursor-pointer">
                                Select All
                            </label>
                        </div>
                    </div>

                    <div className="p-4 sticky bottom-0 bg-white flex justify-end mt-75">
                        <Button onClick={handleSubmit}>Export Records</Button>
                    </div>
                </div>
                {/* <ul className="grid gap-4 p-4 pt-0">
                    {dealersData.map((dealer, index) => (
                        <li key={index} className="py-4 px-6 bg-gray-50 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300">
                            <div className="flex items-center space-x-4 cursor-pointer" onClick={() => toggleDealerExpansion(dealer.name)}>
                                <input
                                    type="checkbox"
                                    checked={dealer.subDealers.some(sub => sub.selected)}
                                    onChange={e => {
                                        e.stopPropagation();
                                        handleDealerChange(dealer.name, e.target.checked);
                                    }}
                                    className="form-checkbox h-4 w-4 text-blue-600 rounded cursor-pointer"
                                />
                                <div className="flex-grow">
                                    <h3 className="text-md ">{dealer.name}</h3>
                                </div>
                                <div>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        className={`h-6 w-6 transform transition-transform duration-300 ${expandedDealer === dealer.name ? 'rotate-180' : ''}`}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>

                            {expandedDealer === dealer.name && (
                                <ul className="mt-4 space-y-4 p-4 pl-6 border-l-2 border-gray-200">
                                    {dealer.subDealers.map((subDealer, subIndex) => (
                                        <li
                                            onClick={e => {
                                                e.stopPropagation();
                                                handleSubDealerChange(dealer.name, subDealer.name, !subDealer.selected);
                                            }}
                                            key={subIndex}
                                            className="flex items-center space-x-4 py-2 px-2 pl-4 bg-white rounded-lg shadow-sm cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={subDealer.selected}
                                                onChange={e => {
                                                    e.stopPropagation();
                                                    handleSubDealerChange(dealer.name, subDealer.name, e.target.checked);
                                                }}
                                                className="form-checkbox h-4 w-4 text-green-600 rounded"
                                            />
                                            <div>
                                                <p className="text-sm">{subDealer.name}</p>
                                                <p className="text-xs text-gray-500">{subDealer.location}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    ))}
                </ul> */}

                {/* <div className="mt-8 py-6 px-6 bg-gray-100 rounded-lg shadow-sm">
                    <h2 className="text-lg font-semibold mb-4">Selected Dealers and Sub Dealers</h2>
                    <div className="px-4 py-2 font-semibold">Dealer Name</div>
                    <div className="px-4 py-2 font-semibold">Location</div>

                    {selectedDealers.length > 0 ? (
                        <ul className="space-y-4">
                            {selectedDealers.map((dealer, index) => (
                                <li key={index} className="p-4 bg-white rounded-lg shadow-sm">
                                    <h3 className="text-md font-semibold mb-2">{dealer.name}</h3>
                                    <ul className="space-y-2 pl-4 border-l-2 border-gray-200">
                                        {dealer.subDealers.map((subDealer, subIndex) => (
                                            <li key={subIndex} className="text-sm text-gray-700">
                                                - {subDealer.name} ({subDealer.location})
                                            </li>
                                        ))}
                                    </ul>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-gray-500">No dealers or sub dealers selected yet.</p>
                    )}
                </div> */}

                {/* <div className="p-4 sticky bottom-0 bg-white flex justify-end">
                    <Button onClick={handleSubmit}>Export Records</Button>
                </div> */}
            </div>
        </div>
    );
};

export default DealerListComponent;

const dealerList = [
    {
        name: 'Ritham Traders',
        subDealers: [
            { name: 'Moouryans Enterprise', location: 'AHMEDABAD', selected: false },
            { name: 'Sanskar Traders', location: 'AHMEDABAD', selected: false }
        ]
    },
    {
        name: 'Shree Gautam Traders',
        subDealers: [{ name: 'Bath Galleria', location: 'AHMEDABAD', selected: false }]
    },
    {
        name: 'A + Enterprise',
        subDealers: [
            { name: 'Maitri Ceramic', location: 'SURAT', selected: false },
            { name: 'Tiles Ahead', location: 'SURAT', selected: false },
            { name: 'Shaswat Ceramic And Tiles', location: 'SURAT', selected: false },
            { name: 'Arihant Corporation', location: 'SURAT', selected: false }
        ]
    },
    {
        name: 'Shree Maruti Sales and Services',
        subDealers: [
            { name: 'Maruti Traders', location: 'VADODARA', selected: false },
            { name: 'Vasupujya Marketing', location: 'VADODARA', selected: false },
            { name: 'Kushboo Sales & Service', location: 'VADODARA', selected: false },
            { name: 'Shree Ram Sales Corporation', location: 'VADODARA', selected: false },
            { name: 'Shree Ram Chemical', location: 'VADODARA', selected: false },
            { name: 'Deniso Foods Pvt Ltd', location: 'VADODARA', selected: false },
            { name: 'Rishikesh Enterprise', location: 'VADODARA', selected: false }
        ]
    },
    {
        name: 'Dhara Enterprise',
        subDealers: [
            { name: 'Akshar Hardware', location: 'AHMEDABAD', selected: false },
            { name: 'Design Unit Interiors', location: 'AHMEDABAD', selected: false },
            { name: 'Sh. Ambica Traders', location: 'AHMEDABAD', selected: false },
            { name: 'Aalishan Construction', location: 'AHMEDABAD', selected: false },
            { name: 'Shree Mahakali Enterprise', location: 'AHMEDABAD', selected: false },
            { name: 'Shreeji Hardware', location: 'AHMEDABAD', selected: false },
            { name: 'Umiya H/W & B.M.S.', location: 'AHMEDABAD', selected: false },
            { name: 'Vama Hardware', location: 'AHMEDABAD', selected: false },
            { name: 'D.A. Buildcon Ltd', location: 'AHMEDABAD', selected: false }
        ]
    }
];
