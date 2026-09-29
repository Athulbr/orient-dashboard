import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../../../../components/Button';
import { SingleSelect } from '../../../../../components/SingleSelect';
import { Order } from './types';

interface CreateOrderDialogProps {
    initialOrder?: Order;
    onClose: () => void;
    onCreate: (order: Order) => void | Promise<void>;
    onUpdate?: (order: Order) => void | Promise<void>;
}

const CreateOrderDialog: React.FC<CreateOrderDialogProps> = ({ initialOrder, onClose, onCreate, onUpdate }) => {
    const isEdit = !!initialOrder;
    const [orderType, setOrderType] = useState(initialOrder?.orderDetails.orderType || 'sell');
    const [productType, setProductType] = useState<string[]>(
        initialOrder?.orderDetails.productType
            ? Array.isArray(initialOrder.orderDetails.productType)
                ? initialOrder.orderDetails.productType
                : [initialOrder.orderDetails.productType as string]
            : ['currency']
    );
    const [purpose, setPurpose] = useState(initialOrder?.orderDetails.purpose || '');
    const [isLoanOrder, setIsLoanOrder] = useState<boolean | undefined>(initialOrder?.orderDetails.isLoanOrder || false);
    const [sourceOfFund, setSourceOfFund] = useState<'parent' | 'self'>(initialOrder?.orderDetails.sourceOfFund || 'parent');
    const [residentialStatus, setResidentialStatus] = useState(initialOrder?.orderDetails.residentialStatus || 'resident');
    const [userName, setUserName] = useState(initialOrder?.userDetails.name || '');
    const [userEmail, setUserEmail] = useState(initialOrder?.userDetails.email || '');
    const [userPhone, setUserPhone] = useState(initialOrder?.userDetails.phone || '');
    const [errors, setErrors] = useState<{ [key: string]: string }>({});
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const newErrors: { [key: string]: string } = {};

        if (!userName.trim()) {
            newErrors.userName = 'Full Name is required';
        }
        if (userEmail.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(userEmail)) {
                newErrors.userEmail = 'Invalid email format';
            }
        }
        if (userPhone.trim()) {
            if (userPhone.length < 10) newErrors.userPhone = 'Phone number must be at least 10 digits';
            if (userPhone.length > 15) newErrors.userPhone = 'Phone number is too long';
        }
        if (orderType === 'sell' && !purpose.trim()) {
            newErrors.purpose = 'Purpose is required';
        }
        if (orderType === 'sell' && (purpose === 'Education' || purpose?.toLowerCase() === 'education') && isLoanOrder === undefined) {
            newErrors.isLoanOrder = 'Please specify if it is a loan';
        }
        if (orderType === 'buy' && !residentialStatus.trim()) {
            newErrors.residentialStatus = 'Residential Status is required';
        }
        if (productType.length === 0) {
            newErrors.productType = 'At least one product type must be selected';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        setErrors({});
        setIsLoading(true);

        try {
            const isEducation = orderType === 'sell' && (purpose === 'Education' || purpose?.toLowerCase() === 'education');
            if (isEdit && initialOrder && onUpdate) {
                const updatedOrder: Order = {
                    ...initialOrder,
                    orderDetails: {
                        ...initialOrder.orderDetails,
                        orderType,
                        productType: productType as ('currency' | 'card' | 'tt')[],
                        purpose,
                        residentialStatus,
                        ...(isEducation ? { isLoanOrder, sourceOfFund } : { isLoanOrder: undefined, sourceOfFund: undefined })
                    },
                    userDetails: {
                        ...initialOrder.userDetails,
                        name: userName,
                        email: userEmail,
                        phone: userPhone
                    }
                };
                await onUpdate(updatedOrder);
                return;
            }

            // generate random 8 digit ID
            const orderId = Math.floor(10000000 + Math.random() * 90000000);
            // generate random 6 digit user ID
            const userId = Math.floor(100000 + Math.random() * 900000);

            // generate orderNumber
            const generateRandomOrderNumber = () => {
                const timestamp = Math.floor(Date.now() / 1000);
                const random4Digits = Math.floor(Math.random() * 10000)
                    .toString()
                    .padStart(4, '0');

                return Number(`${timestamp}${random4Digits}`);
            };

            const getBranchName = () => {
                const user = JSON.parse(window?.sessionStorage?.getItem('user') || '{}');

                return user.firstName || 'NA';
            };

            const newOrder: Order = {
                orderDetails: {
                    orderId,
                    orderNumber: generateRandomOrderNumber(),
                    orderType,
                    productType: productType as ('currency' | 'card' | 'tt')[],
                    purpose,
                    residentialStatus,
                    ...(isEducation ? { isLoanOrder, sourceOfFund } : {}),
                    branch: getBranchName(),
                    branchId: Number(sessionStorage.getItem('branch_id')),
                    branchCode: sessionStorage.getItem('branch_code') || '',
                    totalAmount: 0,
                    actualAmount: 0,
                    orderStatus: 'pending',
                    documentSubmitStatus: 'offline'
                },
                userDetails: {
                    userId,
                    name: userName,
                    email: userEmail,
                    phone: userPhone
                },
                currencyDetails: [],
                webDocuments: [],
                manualDocuments: [],
                emailDocuments: [],
                extractionDetails: {
                    recordId: '',
                    extractedData: {}
                },
                maraekatDetails: {}
            };

            await onCreate(newOrder);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="p-8">
            <div className="grid grid-cols-2 gap-8 mb-6 mt-2">
                <div className="flex flex-col gap-5">
                    <h3 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-2">User Details</h3>
                    <div>
                        <label className="pl-1 block text-sm font-medium text-gray-700 mb-1">
                            Full Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={userName}
                            onChange={e => {
                                setUserName(e.target.value);
                                if (errors.userName) setErrors(prev => ({ ...prev, userName: '' }));
                            }}
                            className={`w-full border ${errors.userName ? 'border-red-500' : 'border-gray-300'} rounded-md bg-white  px-3 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500`}
                            placeholder="Ritesh Singh"
                        />
                        {errors.userName && <p className="text-red-500 text-xs mt-1">{errors.userName}</p>}
                    </div>
                    <div>
                        <label className="pl-1 block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                        <input
                            type="email"
                            value={userEmail}
                            onChange={e => {
                                setUserEmail(e.target.value);
                                if (errors.userEmail) setErrors(prev => ({ ...prev, userEmail: '' }));
                            }}
                            className={`w-full border ${errors.userEmail ? 'border-red-500' : 'border-gray-300'} rounded-md bg-white  px-3 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500`}
                            placeholder="ritesh@example.com"
                        />
                        {errors.userEmail && <p className="text-red-500 text-xs mt-1">{errors.userEmail}</p>}
                    </div>
                    <div>
                        <label className="pl-1 block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                        <input
                            type="number"
                            value={userPhone}
                            onChange={e => {
                                setUserPhone(e.target.value);
                                if (errors.userPhone) setErrors(prev => ({ ...prev, userPhone: '' }));
                            }}
                            className={`w-full border ${errors.userPhone ? 'border-red-500' : 'border-gray-300'} rounded-md bg-white  px-3 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500`}
                            placeholder="9876543210"
                        />
                        {errors.userPhone && <p className="text-red-500 text-xs mt-1">{errors.userPhone}</p>}
                    </div>
                </div>
                <div className="flex flex-col gap-5">
                    <h3 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-2">Order Details</h3>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Order Type <span className="text-red-500">*</span>
                        </label>
                        <div className="pt-2 flex gap-4 mt-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="orderType"
                                    value="sell"
                                    checked={orderType === 'sell'}
                                    onChange={e => setOrderType(e.target.value as 'sell' | 'buy')}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                                />
                                <span className="text-sm text-gray-700">Sell</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="orderType"
                                    value="buy"
                                    checked={orderType === 'buy'}
                                    onChange={e => setOrderType(e.target.value as 'sell' | 'buy')}
                                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                                />
                                <span className="text-sm text-gray-700">Buy</span>
                            </label>
                        </div>
                    </div>
                    <div className="pt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Product Type <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-4 mt-3">
                            {[
                                { label: 'Currency', value: 'currency', disabled: false },
                                { label: 'Card', value: 'card', disabled: false },
                                { label: 'TT', value: 'tt', disabled: true },
                                { label: 'TP', value: 'tp', disabled: true }
                            ].map(type => {
                                if (orderType === 'sell' && type.value === 'tp') return null;
                                if (orderType === 'buy' && type.value === 'tt') return null;
                                return (
                                    <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            disabled={type.disabled}
                                            type="checkbox"
                                            name="productType"
                                            value={type.value}
                                            checked={productType.includes(type.value)}
                                            onChange={e => {
                                                const newTypes = e.target.checked ? [...productType, type.value] : productType.filter(t => t !== type.value);

                                                if (orderType === 'buy' && newTypes.includes('card')) {
                                                    if (residentialStatus !== 'resident') {
                                                        setResidentialStatus('resident');
                                                    }
                                                }

                                                setProductType(newTypes);
                                                if (errors.productType && newTypes.length > 0) {
                                                    setErrors(prev => ({ ...prev, productType: '' }));
                                                }
                                            }}
                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                                        />
                                        <span className="text-sm text-gray-700 capitalize">{type.label}</span>
                                    </label>
                                );
                            })}
                        </div>
                        {errors.productType && <p className="text-red-500 text-xs mt-1">{errors.productType}</p>}
                    </div>

                    {orderType === 'sell' && (
                        <div className="pt-3">
                            <label className="pl-1 pt-0.5 block text-sm font-medium text-gray-700 mb-1">
                                Purpose <span className="text-red-500">*</span>
                            </label>
                            <SingleSelect
                                size="lg"
                                value={purpose}
                                onValueChange={val => {
                                    setPurpose(val);
                                    if (errors.purpose) setErrors(prev => ({ ...prev, purpose: '' }));
                                }}
                                options={[
                                    { value: 'Education', label: 'Education' },
                                    { value: 'Medical', label: 'Medical Treatment' },
                                    { value: 'Leisure/Holiday', label: 'Private Visit / Leisure / Holiday' },
                                    { value: 'Business Trip', label: 'Business Trip' },
                                    { value: 'Emigration', label: 'Emigration' },
                                    { value: 'Employment', label: 'Employment' }
                                ]}
                                className={`w-full ${errors.purpose ? '[&>button]:border-red-500' : ''}`}
                                placeholder="Select Purpose"
                                position="top"
                            />
                            {errors.purpose && <p className="text-red-500 text-xs mt-1">{errors.purpose}</p>}
                        </div>
                    )}

                    {orderType === 'buy' && (
                        <div className="pt-3">
                            <label className="pl-1 pt-0.5 block text-sm font-medium text-gray-700 mb-1">
                                Residential Status <span className="text-red-500">*</span>
                            </label>
                            <SingleSelect
                                size="lg"
                                value={residentialStatus}
                                onValueChange={val => {
                                    setResidentialStatus(val);
                                    if (errors.residentialStatus) setErrors(prev => ({ ...prev, residentialStatus: '' }));
                                }}
                                options={[
                                    { value: 'resident', label: 'Resident' },
                                    { value: 'non-resident', label: 'Non-Resident' }
                                ].filter(opt => {
                                    if (productType.includes('card')) return opt.value === 'resident';
                                    if (productType.includes('currency')) return true;
                                    return true;
                                })}
                                className={`w-full ${errors.residentialStatus ? '[&>button]:border-red-500' : ''}`}
                                placeholder="Select Residential Status"
                                position="top"
                            />
                            {errors.residentialStatus && <p className="text-red-500 text-xs mt-1">{errors.residentialStatus}</p>}
                        </div>
                    )}

                    {orderType === 'sell' && (purpose === 'Education' || purpose?.toLowerCase() === 'education') && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">
                                    With Loan? <span className="text-red-500">*</span>
                                </label>
                                <div className="pt-2 flex gap-4 mt-2 ml-1">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="isLoanOrder"
                                            value="yes"
                                            checked={isLoanOrder === true}
                                            onChange={() => {
                                                setIsLoanOrder(true);
                                                if (errors.isLoanOrder) setErrors(prev => ({ ...prev, isLoanOrder: '' }));
                                            }}
                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                                        />
                                        <span className="text-sm text-gray-700">Yes</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="isLoanOrder"
                                            value="no"
                                            checked={isLoanOrder === false}
                                            onChange={() => {
                                                setIsLoanOrder(false);
                                                if (errors.isLoanOrder) setErrors(prev => ({ ...prev, isLoanOrder: '' }));
                                            }}
                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                                        />
                                        <span className="text-sm text-gray-700">No</span>
                                    </label>
                                </div>
                                {errors.isLoanOrder && <p className="text-red-500 text-xs mt-1">{errors.isLoanOrder}</p>}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 ml-1">
                                    Source of fund <span className="text-red-500">*</span>
                                </label>
                                <div className="pt-2 flex gap-4 mt-2 ml-1">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="sourceOfFund"
                                            value="parent"
                                            checked={sourceOfFund === 'parent'}
                                            onChange={() => setSourceOfFund('parent')}
                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                                        />
                                        <span className="text-sm text-gray-700">Parent</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="sourceOfFund"
                                            value="self"
                                            checked={sourceOfFund === 'self'}
                                            onChange={() => setSourceOfFund('self')}
                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                                        />
                                        <span className="text-sm text-gray-700">Self</span>
                                    </label>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Button outlined onClick={onClose} type="button" disabled={isLoading}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} type="submit" disabled={isLoading} startIcon={isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : undefined}>
                    {isLoading ? (isEdit ? 'Updating...' : 'Creating...') : isEdit ? 'Update Order' : 'Create Order'}
                </Button>
            </div>
        </form>
    );
};

export default CreateOrderDialog;

{
    /* Education,Medical,Leisure/Holiday,Business Trip,Emigration,Employment,Immigration */
}
