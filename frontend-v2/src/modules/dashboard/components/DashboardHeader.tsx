import { Plus } from 'lucide-react';
import { FC, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { useDashboardState } from '../hooks/dashboardContext';
import { usePermissionStore } from '../../../zustand-store/PermissionStore';
import { SingleSelect } from '../../../components/SingleSelect';
import { useToastStore } from '../../../components/toast/ToastStore';
import httpUploadRequest from '../../../global-utils/httpUploadRequest';
import httpFileRequest from '../../../global-utils/httpFileRequest';
import { config } from '../../../config/default';

export const DashboardHeaderComponent: FC = () => {
    const { state, setState } = useDashboardState();
    const { user, checkPermission } = usePermissionStore();
    const toast = useToastStore();
    const navigate = useNavigate();
    const [isUserGuideDownloading, setIsUserGuideDownloading] = useState(false);
    const [isUserGuideUploading, setIsUserGuideUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const isContentCreationModule = sessionStorage.getItem('module') === 'content-creation';

    const getSessionUserRoleName = (): string | undefined => {
        try {
            const sessionUser = sessionStorage.getItem('user');
            return sessionUser ? JSON.parse(sessionUser)?.role?.name : undefined;
        } catch {
            return undefined;
        }
    };

    const sessionUserRoleName = getSessionUserRoleName();

    const handleUserGuideClick = async () => {
        if (isUserGuideDownloading) {
            return;
        }
        const newTab = window.open('', '_blank');
        if (!newTab) {
            toast.error('Unable to open new tab. Please check your browser settings.');
            return;
        }
        newTab.document.body.style.cssText = 'margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#555';
        newTab.document.body.innerText = 'Loading user guide...';

        setIsUserGuideDownloading(true);
        try {
            const blob = await httpFileRequest('GET', `${config.nodeApiUrl}/idp/user-guide/download`);
            const blobUrl = URL.createObjectURL(blob);
            newTab.location.href = blobUrl;
        } catch (error) {
            newTab.close();
            console.error('Failed to open user guide', error);
            toast.error('Unable to open user guide');
        } finally {
            setIsUserGuideDownloading(false);
        }
    };

    const handleCreateTemplateClick = () => {
        if (user?.role?.name === 'superadmin') {
            const selectedTenant = sessionStorage.getItem('selectedTenant');
            if (!selectedTenant) {
                toast.error('Please select a tenant');
                return;
            }
            setState({ ...state, showCreateTemplateDialog: true });
        } else {
            setState({ ...state, showCreateTemplateDialog: true });
        }
    };

    const handleEditClick = () => {
        console.log('Clicked edit button');
        fileInputRef.current?.click();
    };

    const handleUserGuideFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0];
        event.target.value = '';
        if (!selectedFile) {
            return;
        }

        if (selectedFile.type !== 'application/pdf') {
            toast.error('Please select a PDF file');
            return;
        }

        try {
            setIsUserGuideUploading(true);
            await httpUploadRequest(`${config.nodeApiUrl}/idp/user-guide/upload`, selectedFile);
        } catch (error) {
            console.error('Failed to upload user guide', error);
            toast.error('Unable to upload user guide');
        } finally {
            setIsUserGuideUploading(false);
        }
    };

    return (
        <section className="flex w-full items-center justify-between gap-y-4 px-2">
            <div className="flex-1 text-xl lg:text-2xl">
                Welcome to makez.ai, <span className="capitalize">{user?.firstName}</span>
            </div>
            <div className="flex items-center gap-2">
                {isContentCreationModule && (
                    <>
                        {checkPermission('viewEdit:userGuide') && (
                            <>
                                <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleUserGuideFileChange} />
                                <SingleSelect
                                    placeholder="User Guide"
                                    value=""
                                    options={[
                                        { value: 'view', label: 'View' },
                                        { value: 'edit', label: 'Edit' }
                                    ]}
                                    onValueChange={value => {
                                        if (value === 'view') handleUserGuideClick();
                                        else if (value === 'edit') handleEditClick();
                                    }}
                                    disabled={isUserGuideDownloading || isUserGuideUploading}
                                />
                            </>
                        )}
                        {sessionUserRoleName !== 'superadmin' && (
                            <Button permission="view:userGuide" outlined onClick={handleUserGuideClick} disabled={isUserGuideDownloading}>
                                User Guide
                                {isUserGuideDownloading && <Spinner className="text-gray-500" size={16} />}
                            </Button>
                        )}
                    </>
                )}
                <Button permission="read:reconsile" outlined onClick={() => navigate('/reconcilation/list')}>
                    Reconcilation
                </Button>
                <Button permission="read:agents" outlined onClick={() => navigate('/agent/list')}>
                    Makez Agents
                </Button>
                <Button outlined onClick={() => navigate('/docsnap/template/list')}>
                    View Template
                </Button>
                <Button permission="create:template" startIcon={<Plus strokeWidth={1.5} size={18} />} onClick={handleCreateTemplateClick} data-tour-id="create-template">
                    Create Template
                </Button>
            </div>
        </section>
    );
};
