import { CreateTablebuilder } from '../../../builders/tablebuilder/create-tablebuilder';

interface CreateTablebuilderPageIF {
    update?: boolean;
    id?: string;
}

const CreateTablebuilderPage: React.FC<CreateTablebuilderPageIF> = ({ update, id }) => {
    return <CreateTablebuilder update={update} id={id} />;
};

export default CreateTablebuilderPage;
