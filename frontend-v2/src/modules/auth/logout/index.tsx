import { FC } from 'react';

const LogoutMessagePage: FC = () => {
    return (
        <div className="mt-8 flex h-auto w-full flex-col items-center justify-center text-center">
            <h2 className="text-[17px] text-gray-600">
                Your session has expired.
                <br />
                Please close this tab and login again to the Orient Web Application.
            </h2>
        </div>
    );
};

export default LogoutMessagePage;
