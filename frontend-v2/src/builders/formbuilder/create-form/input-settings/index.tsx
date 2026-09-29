import React from 'react';
import style from './settings.module.css';
import { useFormBuilder } from '../formbuilder-context/useFormBuilder';
import { FieldConfigIF } from '../../interface';
import settingTypes from './SettingTypes';

interface PropsIF {
    index: number;
}

const FieldSettingsComponent: React.FC<PropsIF> = ({ index }) => {
    const { fields } = useFormBuilder();
    const config = fields[index].config;

    return (
        <div className={style.settingsContainer}>
            <div className={style.settingsInnerContainer}>
                {(Object.keys(config) as (keyof FieldConfigIF)[]).map(keyName => {
                    if (keyName === 'dynamicKey') return null;
                    if (keyName === 'apiEndpoint') return null;
                    const Component = settingTypes.get(keyName as string);
                    return (
                        <div className={style.settingsBox} key={keyName}>
                            {Component ? <Component index={index} keyName={keyName} /> : <div className={style.invalidSetting}>Invalid setting: {keyName}</div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default FieldSettingsComponent;
