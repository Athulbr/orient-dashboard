import React, { useState, useRef, useEffect } from 'react';
import { Calendar, X } from 'lucide-react';
import { format, isSameDay, isAfter, isBefore, startOfDay, isWithinInterval, setHours } from 'date-fns';
import { Button } from '../../../../components/Button';
import { cn } from '../../../../global-utils/twMerge';

interface DatePickerProps {
    from: Date | null;
    to: Date | null;
    onSubmit: (from: Date | null, to: Date | null) => void;
    className?: string;
    disabled?: boolean;
    disableFutureDates?: boolean;
}

export const DatePicker: React.FC<DatePickerProps> = ({ from, to, onSubmit, className = '', disabled = false, disableFutureDates = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [hoverDate, setHoverDate] = useState<Date | null>(null);
    const [tempFrom, setTempFrom] = useState<Date | null>(from);
    const [tempTo, setTempTo] = useState<Date | null>(to);
    const pickerRef = useRef<HTMLDivElement>(null);
    const today = startOfDay(new Date());

    // Update temporary dates when props change
    useEffect(() => {
        setTempFrom(from);
        setTempTo(to);
    }, [from, to]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDayClick = (date: Date) => {
        if (disableFutureDates && isAfter(date, today)) return;
        // Set selected date to 12:00 (noon)
        const normalizedDate = setHours(startOfDay(date), 23);

        if (!tempFrom) {
            setTempFrom(date);
        } else if (!tempTo && isAfter(normalizedDate, tempFrom)) {
            setTempTo(normalizedDate);
        } else {
            setTempFrom(date);
            setTempTo(null);
        }
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        setTempFrom(null);
        setTempTo(null);
        onSubmit(null, null);
        setIsOpen(false);
    };

    const handleSubmit = () => {
        onSubmit(tempFrom, tempTo);
        setIsOpen(false);
    };

    const getMonthDays = (year: number, month: number) => {
        // Month is 0-indexed in JavaScript Date
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();

        // Get day of week of first day (0 = Sunday, 6 = Saturday)
        const firstDayOfWeek = firstDay.getDay();

        const days: Date[] = [];

        // Add previous month days to fill the first week
        for (let i = 0; i < firstDayOfWeek; i++) {
            const day = new Date(year, month, -firstDayOfWeek + i + 1);
            days.push(day);
        }

        // Add current month days
        for (let i = 1; i <= daysInMonth; i++) {
            const day = new Date(year, month, i);
            days.push(day);
        }

        // Add next month days to fill the last week (ensure 6 rows = 42 days)
        while (days.length < 42) {
            const day = new Date(year, month, daysInMonth + (days.length - (firstDayOfWeek + daysInMonth)) + 1);
            days.push(day);
        }

        return days;
    };

    const days = getMonthDays(currentMonth.getFullYear(), currentMonth.getMonth());
    const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const isDaySelected = (day: Date) => (tempFrom && isSameDay(tempFrom, day)) || (tempTo && isSameDay(tempTo, day));

    const isDayInRange = (day: Date) => {
        if (!tempFrom) return false;
        if (tempTo) {
            return isWithinInterval(day, { start: tempFrom, end: tempTo });
        }
        if (hoverDate && isAfter(hoverDate, tempFrom)) {
            return isWithinInterval(day, { start: tempFrom, end: hoverDate });
        }
        return false;
    };

    const isCurrentMonth = (day: Date) => day.getMonth() === currentMonth.getMonth();

    const previousMonth = () => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
    };

    const nextMonth = () => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));
    };

    return (
        <div ref={pickerRef} className={cn(`relative inline-block`, className)}>
            <Button onClick={() => !disabled && setIsOpen(!isOpen)} outlined>
                <Calendar className="h-3.5 w-3.5" />
                <span>{from && to ? `${format(from, 'MMM d')} - ${format(to, 'MMM d')}` : from ? `From ${format(from, 'MMM d')}` : 'Date Range'}</span>
            </Button>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-[300px] overflow-hidden rounded-md border border-gray-300 bg-white shadow-lg">
                    <div className="border-b border-gray-300 p-3">
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-sm font-medium">Date Range</h3>
                            <button
                                type="button"
                                onClick={handleClear}
                                className="cursor-pointer border border-gray-300 px-2 py-1 text-xs text-gray-400 hover:text-gray-500"
                            >
                                Clear
                            </button>
                        </div>
                        <div className="text-xs text-gray-400">
                            {!tempFrom && !tempTo
                                ? 'Select start date first'
                                : !tempTo
                                  ? 'Now select end date'
                                  : tempFrom && tempTo
                                    ? `${format(tempFrom, 'PPP')} - ${format(tempTo, 'PPP')}`
                                    : ''}
                        </div>
                    </div>

                    <div className="border-b border-gray-300 p-3">
                        <div className="mb-4 flex items-center justify-between">
                            <button type="button" onClick={previousMonth} className="rounded-full p-1 hover:bg-gray-200">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                            <div className="font-medium">
                                {months[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                            </div>
                            <button type="button" onClick={nextMonth} className="rounded-full p-1 hover:bg-blue-600 hover:text-white">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                        </div>

                        <div className="mb-1 grid grid-cols-7 gap-1">
                            {weekdays.map(day => (
                                <div key={day} className="py-1 text-center text-xs font-medium text-gray-400">
                                    {day}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                            {days.map((day, i) => {
                                const isFuture = isAfter(day, today);
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        disabled={disableFutureDates && isFuture}
                                        onClick={() => handleDayClick(day)}
                                        onMouseEnter={() => !isFuture && tempFrom && !tempTo && setHoverDate(day)}
                                        onMouseLeave={() => setHoverDate(null)}
                                        className={cn(
                                            'flex h-8 w-8 items-center justify-center rounded-full text-sm',
                                            isCurrentMonth(day) ? 'text-gray-600' : 'text-gray-400 opacity-50',
                                            isDaySelected(day) && 'bg-blue-600 text-white',
                                            isDayInRange(day) && 'bg-blue-100',
                                            disableFutureDates && isFuture ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100 cursor-pointer'
                                        )}
                                        // disabled={isAfter(day, new Date())}
                                        // className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-sm transition-colors ${isCurrentMonth(day) ? 'text-gray-600' : 'text-gray-400 opacity-50'} ${isDaySelected(day) ? 'bg-blue-600 text-white hover:bg-blue-700' : ''} ${isDayInRange(day) ? 'bg-blue-100 hover:bg-blue-200' : 'hover:bg-gray-100'}`}
                                    >
                                        {day.getDate()}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="style={{ borderTop: '1px solid #d1d5db' }} p-3">
                        <Button onClick={handleSubmit} className="w-full" disabled={!tempFrom || !tempTo}>
                            Apply
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
