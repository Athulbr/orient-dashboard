import { Bell, Edit, LogOut, ShieldCheck } from 'lucide-react';
import { Button } from '../../../../components/Button';
import { cn } from '../../../../global-utils/twMerge';
import { useEffect, useState } from 'react';
import { useUserAccountApi } from './hooks/useUserAccountApi';
import { useParams } from 'react-router-dom';
import { useUserAccountState } from './hooks/userAccountContext';
import { DialogComponent } from '../../../../components/DialogComponent';
import DragAndDropFileInput from '../../../../components/DragAndDropFileInput';
import { BasicDetailsComponent } from './components/BasicDetails';
import { SecurityDetails } from './components/SecurityDetails';
import { SubscriptionDetails } from './components/SubscriptionDetails';
import { NotificationsDetails } from './components/NotificationDetails';
import { useS3Storage } from '../../../../zustand-store/S3Storage';
interface UserDetailsComponentIF {
    test?: string;
}

export const UserDetailsComponent: React.FC<UserDetailsComponentIF> = () => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [openDialog, setOpenDialog] = useState(false);
    const { id } = useParams();
    const { uploadS3File, getS3File } = useS3Storage();
    const { logout, getUserApi, updateProfilePicture } = useUserAccountApi();
    const { state } = useUserAccountState();
    const [profilePicture, setProfilePicture] = useState('');

    useEffect(() => {
        if (!id) return;
        getUserApi(id);
    }, [id]);
    const onClickNavItem = (name: string, index: number) => {
        setActiveIndex(index);
        if (name === 'Logout') logout();
    };

    useEffect(() => {
        const getFile = async () => {
            if (!state?.user?.profilePicture) {
                setProfilePicture(''); // Clear previous value when no profile picture
                return;
            }

            try {
                const awsS3Response: any = await getS3File(state?.user?.profilePicture);

                // Convert Buffer to Uint8Array
                const bufferData = new Uint8Array(awsS3Response.Body.data);

                // Create blob from buffer
                const blob = new Blob([bufferData], {
                    type: awsS3Response.ContentType || 'image/jpeg'
                });

                // Create object URL for the blob
                const imageUrl = URL.createObjectURL(blob);
                setProfilePicture(imageUrl);
            } catch (error) {
                console.error('Failed to fetch profile picture:', error);
                setProfilePicture(''); // Reset on error
            }
        };

        getFile();
    }, [state?.user?.profilePicture]);

    const handleUpload = async (files: File[]) => {
        const s3Response = await uploadS3File(files[0]);
        await updateProfilePicture(s3Response.fileName);
        setOpenDialog(false);
    };
    return (
        <div className="h-full w-full p-6 pt-0">
            <div className="flex h-full w-full gap-4">
                {/* Left */}
                <div className="flex w-full max-w-100 flex-col items-center gap-4 overflow-hidden px-4">
                    <div className="h-40 w-40  overflow-hidden rounded-full bg-slate-200 flex flex-col items-center ">
                        {/* <CircleUserRound strokeWidth={1.4} className="h-full w-full text-gray-400" /> */}
                        {profilePicture && <img src={profilePicture} alt="profile" className="w-full relative bottom-2 rounded-full" />}
                    </div>
                    <Button onClick={() => setOpenDialog(true)}>Update Profile Picture</Button>
                    <nav className="flex w-full flex-1 flex-col overflow-hidden">
                        <ul className="flex flex-col items-center overflow-y-auto border">
                            {navItems.map((item, index) => (
                                <li
                                    key={index}
                                    className={cn(
                                        'flex w-full cursor-pointer items-center gap-2 border-b p-5 hover:bg-sky-50',
                                        activeIndex === index && 'bg-sky-50 text-sky-500'
                                    )}
                                    onClick={() => onClickNavItem(item.name, index)}
                                >
                                    <item.icon size={16} /> {item.name}
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>
                {/* Right */}
                <div className="flex w-full flex-col gap-4 rounded-lg p-4 shadow-lg">{navItems[activeIndex].component}</div>
            </div>
            <DialogComponent isOpen={openDialog} closeDialog={() => setOpenDialog(false)}>
                <div className="flex h-[50vh] w-[50vw] flex-col gap-4 rounded-lg p-4 shadow-lg">
                    <DragAndDropFileInput accept="image/*" onFilesChange={handleUpload} />
                </div>
            </DialogComponent>
        </div>
    );
};

const navItems = [
    {
        name: 'Basic Details',
        icon: Edit,
        component: <BasicDetailsComponent />
    },
    {
        name: 'Security',
        icon: ShieldCheck,
        component: <SecurityDetails />
    },
    {
        name: 'Subscription',
        icon: ShieldCheck,
        component: <SubscriptionDetails />
    },
    {
        name: 'Notifications',
        icon: Bell,
        component: <NotificationsDetails />
    },
    {
        name: 'Logout',
        icon: LogOut,
        component: <BasicDetailsComponent />
    }
];
