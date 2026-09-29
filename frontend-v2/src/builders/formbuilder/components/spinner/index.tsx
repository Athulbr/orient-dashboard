import React from 'react';
import styles from './spinner.module.css';

interface PropsIF {
    large?: boolean;
}

const Spinner: React.FC<PropsIF> = ({ large }) => {
    return (
        <div className={styles.spinner}>
            <div className={`${styles.inner} ${large ? styles.largeInner : ''}`}></div>
        </div>
    );
};

export default Spinner;
