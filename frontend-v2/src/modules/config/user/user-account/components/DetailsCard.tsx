import { useUserAccountState } from '../hooks/userAccountContext';

export const DetailsCard = ({ children }: { children: React.ReactNode }) => {
    return <div className="relative flex w-full flex-wrap items-center gap-8 rounded-lg border p-6">{children}</div>;
};
export const DetailsCardItem = ({ label, value }: { label: string; value: string }) => {
    const { state } = useUserAccountState();
    return (
        <div className="flex w-[46%] flex-col gap-2">
            <span className="text-sm font-semibold text-gray-500">{label}</span>
            <span className={`relative text-gray-600 ${label === 'Email' ? '' : 'capitalize'}`}>
                {state.loadingUser ? <span className="absolute top-0 left-0 h-6 w-30 animate-pulse rounded-sm bg-gray-200"></span> : value}
                &nbsp;
            </span>
        </div>
    );
};
