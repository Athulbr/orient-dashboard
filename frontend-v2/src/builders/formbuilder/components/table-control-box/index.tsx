import { ReactNode } from 'react';
import style from './tabelControlBox.module.css';
import IconButton from '../icon-button';
import { ArrowLeft } from 'lucide-react';
import BackButton from '../../../../components/BackButton';
import { useNavigate } from 'react-router-dom';

export interface PropsIF {
    children?: ReactNode;
    pageName?: string;
}

const PageActionBox: React.FC<PropsIF> = ({ children, pageName }) => {
    const navigate = useNavigate();
    return (
        <div className={style.tableControlBox}>
            <div className={style.tableName}>
                <BackButton onClick={() => navigate(-1)} />
                {pageName}
            </div>
            <div className={style.tableControl}>{children}</div>
        </div>
    );
};

export default PageActionBox;
