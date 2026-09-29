import style from './create-form.module.css';
import FieldListComponent from './field-list';
import { FormBuilderProvider } from './formbuilder-context/FormbuilderContext';
import InputTypeSelectComponent from './input-type-select';
import PageActionComponent from './page-action';

interface PropsIF {
    update?: boolean;
}

export const CreateFormbuilder: React.FC<PropsIF> = () => {
    return (
        <div className={style.container}>
            <FormBuilderProvider>
                <PageActionComponent />
                <InputTypeSelectComponent />
                <FieldListComponent />
            </FormBuilderProvider>
        </div>
    );
};
