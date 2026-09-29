import React from 'react';
import styles from '../styles/ResultsTabs.module.css';
import { cx } from '../utils/cx';

interface Tab {
  id: string;
  label: string;
  count?: number;
  alert?: boolean;
}

interface ResultsTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  children: React.ReactNode;
}

const ResultsTabs: React.FC<ResultsTabsProps> = ({ tabs, activeTab, onTabChange, children }) => {
  return (
    <div className={styles['results-tabs-container']}>
      <div className={styles['tabs-header']}>
        <div className={styles['tabs-list']}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={cx(
                styles['tab-button'],
                activeTab === tab.id && styles['active'],
                tab.alert && styles['alert'],
              )}
              onClick={() => onTabChange(tab.id)}
            >
              <span className={styles['tab-label']}>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={cx(styles['tab-count'], tab.alert && styles['alert'])}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className={styles['tab-content']}>{children}</div>
    </div>
  );
};

export default ResultsTabs;
