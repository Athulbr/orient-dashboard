import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

import { ReactNode } from 'react';

export interface AccordionItem {
    id: number;
    component: ReactNode;
    title?: string;
}

export interface AccordionListComponent {
    items: AccordionItem[];
    className?: string;
}

export interface AccordionItemProps {
    item: AccordionItem;
    index: number;
}

export const AccordionListTB: React.FC<AccordionListComponent> = ({ items, className = '' }) => {
    return (
        <div className={`flex w-full flex-col gap-4 overflow-y-auto border p-2 ${className}`}>
            {items.map((item, index) => (
                <AccordionItem key={item.id} item={item} index={index} />
            ))}
        </div>
    );
};

const AccordionItem: React.FC<AccordionItemProps> = ({ item, index }) => {
    const [isOpen, setIsOpen] = useState<boolean>(true);
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [item.component]);

    const toggleAccordion = () => {
        setIsOpen(!isOpen);
    };

    return (
        <div className="rounded-md border border-gray-200 bg-white shadow-sm">
            <button
                className="focus:ring-opacity-50 flex w-full items-center justify-between bg-gray-50 p-4 transition-colors duration-200 hover:bg-gray-100 focus:ring-2 focus:ring-blue-50 focus:outline-none"
                onClick={toggleAccordion}
                aria-expanded={isOpen}
                aria-controls={`accordion-content-${item.id}`}
                id={`accordion-header-${item.id}`}
            >
                <span className="font-medium text-gray-800">{item.title ? item.title : `Item ${index + 1}`}</span>
                <ChevronDown
                    className={`h-5 w-5 transform text-gray-600 transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
                    aria-hidden="true"
                />
            </button>

            <div
                id={`accordion-content-${item.id}`}
                role="region"
                aria-labelledby={`accordion-header-${item.id}`}
                className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-auto' : 'max-h-0'}`}
            >
                <div ref={contentRef} className="p-4 text-gray-700">
                    {item.component}
                </div>
            </div>
        </div>
    );
};
