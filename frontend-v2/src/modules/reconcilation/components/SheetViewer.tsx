import React, { useState } from 'react';
import styles from '../styles/SheetViewer.module.css';
import { cx } from '../utils/cx';

interface SheetMetadata {
  [sheetName: string]: {
    rows: number;
    columns: number;
    column_names: string[];
  };
}

interface SheetViewerProps {
  fileName: string;
  sheets: SheetMetadata;
}

const SheetViewer: React.FC<SheetViewerProps> = ({ fileName, sheets }) => {
  const [selectedSheet, setSelectedSheet] = useState<string | null>(
    Object.keys(sheets)[0] || null
  );

  if (!selectedSheet || !sheets[selectedSheet]) {
    return (
      <div className={styles['sheet-viewer']}>
        <p className={styles['sheet-empty']}>No sheets available</p>
      </div>
    );
  }

  const sheetData = sheets[selectedSheet];
  const sheetNames = Object.keys(sheets);

  return (
    <div className={styles['sheet-viewer']}>
      <div className={styles['sheet-viewer-header']}>
        <span className={styles['sheet-file-name']}>{fileName}</span>
        <div className={styles['sheet-meta']}>
          <span>{sheetData.rows} rows</span>
          <span className={styles['sheet-meta-sep']}>·</span>
          <span>{sheetData.columns} columns</span>
        </div>
      </div>

      <div className={styles['sheet-tabs']}>
        {sheetNames.map((name) => (
          <button
            key={name}
            className={cx(styles['sheet-tab'], selectedSheet === name && styles['active'])}
            onClick={() => setSelectedSheet(name)}
          >
            <span className={styles['sheet-tab-name']}>{name}</span>
            <span className={styles['sheet-tab-count']}>
              {sheets[name].rows} × {sheets[name].columns}
            </span>
          </button>
        ))}
      </div>

      <div className={styles['sheet-columns']}>
        <div className={styles['sheet-columns-title']}>Columns</div>
        <div className={styles['sheet-columns-grid']}>
          {sheetData.column_names.map((col, idx) => (
            <div key={idx} className={styles['sheet-column-item']}>
              <span className={styles['sheet-column-index']}>{idx + 1}</span>
              <span className={styles['sheet-column-name']}>{col}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SheetViewer;
