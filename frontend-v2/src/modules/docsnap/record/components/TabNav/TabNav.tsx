import React, { useState, useCallback, useRef, useEffect, FC } from 'react';
import styles from './TabNav.module.css';

interface TabIF {
    id?: string;
    title?: string;
}
export interface TabNavProps {
    defaultActiveTab?: number;
    className?: string;
    onChange?: (index: number) => void;
    tabs: TabIF[];
    exportData?: (index: number) => Promise<void>;
    enableFlag?: any;
}

export const TabNavComponent: React.FC<TabNavProps> = ({ defaultActiveTab = 0, className = '', onChange, tabs, exportData, enableFlag }) => {
    // State for tracking active tab
    const [activeTab, setActiveTab] = useState(defaultActiveTab);

    // Refs for DOM elements
    const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
    const tabListRef = useRef<HTMLDivElement>(null);

    // Update the indicator position
    const updateTabIndicator = useCallback(() => {
        const activeTabElement = tabsRef.current[activeTab];
        const tabList = tabListRef.current;

        if (activeTabElement && tabList) {
            const tabLeft = activeTabElement.offsetLeft;
            const tabWidth = activeTabElement.offsetWidth;

            requestAnimationFrame(() => {
                tabList.style.setProperty('--tab-left', `${tabLeft}px`);
                tabList.style.setProperty('--tab-width', `${tabWidth}px`);
            });
        }
    }, [activeTab]);

    // Handle tab selection
    const handleTabClick = useCallback(
        (index: number) => {
            setActiveTab(index);
            onChange?.(index);
        },
        [onChange]
    );

    // Update indicator on mount, active tab change, and resize
    useEffect(() => {
        updateTabIndicator();
        window.addEventListener('resize', updateTabIndicator);
        return () => window.removeEventListener('resize', updateTabIndicator);
    }, [updateTabIndicator]);

    return (
        <nav className={`${styles.tabNav} ${className} `}>
            <div ref={tabListRef} role="tablist" className={styles.tabList}>
                {tabs.map((item, index) => (
                    <button
                        key={item.id}
                        // @ts-ignore
                        ref={el => (tabsRef.current[index] = el)}
                        role="tab"
                        aria-selected={activeTab === index}
                        id={`tab-${item.id}`}
                        className={styles.tab}
                        onClick={() => handleTabClick(index)}
                        tabIndex={activeTab === index ? 0 : -1}
                    >
                        {item.title}
                    </button>
                ))}
            </div>
        </nav>
    );
};
