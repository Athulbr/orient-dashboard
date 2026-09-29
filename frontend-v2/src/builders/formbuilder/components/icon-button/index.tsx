import { ReactNode } from 'react';
import style from './icon-button.module.css';

interface PropsIF {
    icon: ReactNode;
    onClick?: () => void;
}

const IconButton: React.FC<PropsIF> = ({ icon, onClick }) => {
    return (
        <div className={style.iconButton} onClick={onClick && onClick}>
            {icon}
        </div>
    );
};

export default IconButton;
