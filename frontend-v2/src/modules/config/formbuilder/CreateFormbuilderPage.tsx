import { CreateFormbuilder } from '../../../builders/formbuilder/create-form';

interface CreateFormbuilderPageIF {
    test?: string;
}

const CreateFormbuilderPage: React.FC<CreateFormbuilderPageIF> = () => {
    return (
        <div className="absolute top-0 left-0 h-[100vh] w-[100vw]">
            <CreateFormbuilder />
        </div>
    );
};

export default CreateFormbuilderPage;
