import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import getDynamicUserInterface from '../dynamic-ui';
import httpRequest from '../../../global-utils/httpRequest';
import { config } from '../../../config/default';
import FullScreenLoader from '../../../components/FullScreenLoader';
import ErrorState from '../../../components/ErrorState';

const RunAgentPage: React.FC = () => {
    const { name } = useParams();
    const [workflow, setWorkflow] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWorkflow = async () => {
            try {
                const data = await httpRequest('GET', `${config.workflowService}/workflow/workflows/name/${name}`);
                setWorkflow(data.data);
            } catch (error) {
                console.error('Error fetching workflow:', error);
            } finally {
                setLoading(false);
            }
        };

        if (name) {
            fetchWorkflow();
        } else {
            setLoading(false);
        }
    }, [name]);

    // console.log('workflow:===========', workflow);

    const DynamicUI = getDynamicUserInterface(workflow?.agentSettings);

    if (loading) {
        return <FullScreenLoader />;
    }

    if (!DynamicUI) {
        return <ErrorState showHomeButton={false} title="Something went wrong" message="User Interface not found for this workflow. Please try again or go back home." />;
    }

    // We can pass the workflow data to the dynamic UI component if needed
    return DynamicUI;
};

export default RunAgentPage;
