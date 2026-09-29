import React, { useState, useCallback, useEffect } from 'react';
import { Button } from './Button';
import { DialogComponent } from './DialogComponent';

// Define the shape of the data sent back to the parent
export interface DateRangeIF {
    startDate: string;
    endDate: string;
}

interface DateTimePickerProps {
    onChange: (range: DateRangeIF) => void;
    initialStartDate?: string;
    initialEndDate?: string;
    minDate?: string;
    maxDate?: string;
    disabled?: boolean;
    showTime?: boolean;
}

const DateTimePicker: React.FC<DateTimePickerProps> = ({ onChange, initialStartDate, initialEndDate, minDate, maxDate, disabled = false, showTime = true }) => {
    const [showDialog, setShowDialog] = useState(false);
    const formatDateForInput = useCallback((isoString?: string): string => {
        if (!isoString) return '';

        try {
            const date = new Date(isoString);

            // Check if date is valid
            if (isNaN(date.getTime())) {
                console.error('Invalid date string:', isoString);
                return '';
            }

            // Extract local date components
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');

            return `${year}-${month}-${day}T${hours}:${minutes}`;
        } catch (e) {
            console.error('Error formatting date:', isoString, e);
            return '';
        }
    }, []);

    /**
     * Converts datetime-local input value to ISO string with local timezone offset
     * @param datetimeLocalValue - Value from datetime-local input (e.g., "2025-12-14T15:19")
     * @returns ISO string with timezone offset (e.g., "2025-12-14T15:19:00.000+05:30")
     */
    const toLocalISOStringWithOffset = useCallback((datetimeLocalValue: string): string => {
        if (!datetimeLocalValue) return '';

        try {
            const date = new Date(datetimeLocalValue);

            // Check if date is valid
            if (isNaN(date.getTime())) {
                return '';
            }

            const pad = (num: number): string => String(num).padStart(2, '0');

            const year = date.getFullYear();
            const month = pad(date.getMonth() + 1);
            const day = pad(date.getDate());
            const hours = pad(date.getHours());
            const minutes = pad(date.getMinutes());
            const seconds = pad(date.getSeconds());
            const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

            // Calculate timezone offset (e.g., "+05:30" or "-08:00")
            const tzOffset = -date.getTimezoneOffset(); // in minutes
            const sign = tzOffset >= 0 ? '+' : '-';
            const tzHours = pad(Math.floor(Math.abs(tzOffset) / 60));
            const tzMinutes = pad(Math.abs(tzOffset) % 60);
            const offsetString = `${sign}${tzHours}:${tzMinutes}`;

            return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${offsetString}`;
        } catch (e) {
            console.error('Error converting to ISO string:', datetimeLocalValue, e);
            return '';
        }
    }, []);

    const [startValue, setStartValue] = useState<string>(formatDateForInput(initialStartDate));
    const [endValue, setEndValue] = useState<string>(formatDateForInput(initialEndDate));
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setStartValue(formatDateForInput(initialStartDate));
    }, [initialStartDate, formatDateForInput]);

    useEffect(() => {
        setEndValue(formatDateForInput(initialEndDate));
    }, [initialEndDate, formatDateForInput]);

    const handleStartDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (!val) {
            setStartValue('');
            return;
        }
        const datePart = val.split('T')[0];
        if (datePart) {
            setStartValue(`${datePart}T00:00`);
        } else {
            setStartValue(val);
        }
    }, []);

    const handleEndDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (!val) {
            setEndValue('');
            return;
        }
        const datePart = val.split('T')[0];
        if (datePart) {
            setEndValue(`${datePart}T23:59`);
        } else {
            setEndValue(val);
        }
    }, []);

    const handleClear = useCallback(() => {
        setStartValue('');
        setEndValue('');
        setError(null);
        onChange({ startDate: '', endDate: '' });
    }, [onChange]);

    const handleApply = useCallback(() => {
        setError(null);

        if (!startValue || !endValue) {
            setError('Please select both start and end dates.');
            return;
        }

        const startDate = new Date(startValue);
        const endDate = new Date(endValue);

        // Validation: Check for invalid dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            setError('Invalid date format. Please select valid dates.');
            return;
        }

        // Validation: Start date cannot be after end date
        if (startDate > endDate) {
            setError('Start date cannot be later than end date.');
            return;
        }

        // Validation: Check min/max constraints if provided
        if (minDate) {
            const min = new Date(minDate);
            if (startDate < min || endDate < min) {
                setError(`Dates cannot be earlier than ${formatDateForInput(minDate)}`);
                return;
            }
        }

        if (maxDate) {
            const max = new Date(maxDate);
            if (startDate > max || endDate > max) {
                setError(`Dates cannot be later than ${formatDateForInput(maxDate)}`);
                return;
            }
        }

        const payload: DateRangeIF = {
            startDate: toLocalISOStringWithOffset(startValue),
            endDate: toLocalISOStringWithOffset(endValue)
        };

        onChange(payload);
        setShowDialog(false);
    }, [startValue, endValue, minDate, maxDate, onChange, toLocalISOStringWithOffset, formatDateForInput]);

    // Handle Enter key press
    const handleKeyPress = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !disabled) {
                handleApply();
            }
        },
        [handleApply, disabled]
    );

    const handleCloseDialog = useCallback(() => {
        setStartValue(formatDateForInput(initialStartDate));
        setEndValue(formatDateForInput(initialEndDate));
        setError(null);
        setShowDialog(false);
    }, [initialStartDate, initialEndDate, formatDateForInput]);

    const getButtonText = () => {
        if (startValue && endValue) {
            const startStr = showTime ? startValue.replace('T', ' ') : startValue.split('T')[0];
            const endStr = showTime ? endValue.replace('T', ' ') : endValue.split('T')[0];
            return `${startStr} to ${endStr}`;
        }
        if (startValue) {
            const startStr = showTime ? startValue.replace('T', ' ') : startValue.split('T')[0];
            return `From ${startStr}`;
        }
        if (endValue) {
            const endStr = showTime ? endValue.replace('T', ' ') : endValue.split('T')[0];
            return `Until ${endStr}`;
        }
        return 'Select Date Range';
    };

    return (
        <>
            <Button outlined onClick={() => setShowDialog(true)}>
                {getButtonText()}
            </Button>
            <DialogComponent name="Select Date Range" isOpen={showDialog} className="w-120" closeDialog={handleCloseDialog}>
                <div className="w-full p-4 bg-white transition-shadow duration-200">
                    <div className="space-y-5" onKeyDown={handleKeyPress} tabIndex={0}>
                        {/* Start Date Input */}
                        <div className="group">
                            <label htmlFor="start-date" className="block text-sm text-gray-700 mb-1 pl-2">
                                {showTime ? 'Start Date & Time' : 'Start Date'}
                            </label>
                            <input
                                id="start-date"
                                type={showTime ? 'datetime-local' : 'date'}
                                value={showTime ? startValue : (startValue ? startValue.split('T')[0] : '')}
                                onChange={handleStartDateChange}
                                onClick={() => {
                                    if (!startValue) {
                                        const today = new Date();
                                        const year = today.getFullYear();
                                        const month = String(today.getMonth() + 1).padStart(2, '0');
                                        const day = String(today.getDate()).padStart(2, '0');
                                        setStartValue(`${year}-${month}-${day}T00:00`);
                                    }
                                }}
                                min={minDate ? (showTime ? formatDateForInput(minDate) : formatDateForInput(minDate).split('T')[0]) : undefined}
                                max={maxDate ? (showTime ? formatDateForInput(maxDate) : formatDateForInput(maxDate).split('T')[0]) : undefined}
                                disabled={disabled}
                                aria-describedby={error ? 'date-error' : undefined}
                                aria-invalid={error ? 'true' : 'false'}
                                className="w-full px-4 py-2 text-gray-800 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500  transition-all duration-200 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                        </div>

                        {/* End Date Input */}
                        <div className="group">
                            <label htmlFor="end-date" className="block text-sm text-gray-700 mb-1 pl-2">
                                {showTime ? 'End Date & Time' : 'End Date'}
                            </label>
                            <input
                                id="end-date"
                                type={showTime ? 'datetime-local' : 'date'}
                                value={showTime ? endValue : (endValue ? endValue.split('T')[0] : '')}
                                onChange={handleEndDateChange}
                                onClick={() => {
                                    if (!endValue) {
                                        const today = new Date();
                                        const year = today.getFullYear();
                                        const month = String(today.getMonth() + 1).padStart(2, '0');
                                        const day = String(today.getDate()).padStart(2, '0');
                                        setEndValue(`${year}-${month}-${day}T23:59`);
                                    }
                                }}
                                min={minDate ? (showTime ? formatDateForInput(minDate) : formatDateForInput(minDate).split('T')[0]) : undefined}
                                max={maxDate ? (showTime ? formatDateForInput(maxDate) : formatDateForInput(maxDate).split('T')[0]) : undefined}
                                disabled={disabled}
                                aria-describedby={error ? 'date-error' : undefined}
                                aria-invalid={error ? 'true' : 'false'}
                                className="w-full px-4 py-2 text-gray-800 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all duration-200 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div id="date-error" role="alert" aria-live="polite" className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <p className="font-medium">{error}</p>
                            </div>
                        )}

                        <div className="pt-2 flex justify-end gap-3">
                            <Button onClick={handleClear} disabled={disabled} type="button" aria-label="Clear date selection" outlined>
                                Clear Dates
                            </Button>
                            <Button onClick={handleApply} disabled={disabled} type="button" aria-label="Apply date filter">
                                Apply Filter
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogComponent>
        </>
    );
};

export default DateTimePicker;
