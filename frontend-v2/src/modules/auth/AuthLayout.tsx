import { ReactNode, useEffect, useState } from 'react';
import { MakezLogoAuth } from '../../assets/svg-icons/MakezLogoAuth';

const BANNER_CONTENT = {
    title: {
        line1: 'We Make',
        line2: 'it Easy'
    },
    description: 'Enterprise Agentic AI for autonomous business operations. Build and orchestrate autonomous AI agents that execute enterprise workflows end-to-end.​',
    copyright: '@ 2026 makez.ai. All rights reserved'
} as const;

interface AuthLayoutProps {
    children: ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
    const [isTallScreen, setIsTallScreen] = useState(true);

    useEffect(() => {
        const checkScreenHeight = () => {
            setIsTallScreen(window.innerHeight > 800);
        };

        checkScreenHeight();
        window.addEventListener('resize', checkScreenHeight);

        return () => window.removeEventListener('resize', checkScreenHeight);
    }, []);

    return (
        <div className="flex h-full w-full">
            {/* Banner Section */}
            <div className="hidden h-full flex-1 flex-col bg-[url(/auth-banner.svg)] bg-cover bg-center md:flex">
                <div className="flex flex-1 flex-col justify-center gap-5 pl-5 lg:pl-15 xl:pl-20">
                    <h1 className="text-6xl font-bold text-gray-100 lg:text-7xl">{BANNER_CONTENT.title.line1}</h1>
                    <h1 className="text-6xl font-bold text-gray-300 lg:text-7xl">{BANNER_CONTENT.title.line2}</h1>
                    <h4 className="max-w-90 text-sm text-gray-100">{BANNER_CONTENT.description}</h4>
                </div>
                <div className="flex w-full justify-center pb-5 text-sm text-gray-500">{BANNER_CONTENT.copyright}</div>
            </div>

            {/* Content Section */}
            <div
                className={`flex h-full w-screen flex-col items-center md:w-1/2 lg:w-2/5 ${isTallScreen ? 'justify-center p-0' : 'justify-start overflow-y-auto py-8'} `}
            >
                <div className="flex w-full justify-center">
                    <MakezLogoAuth />
                </div>
                {children}
            </div>
        </div>
    );
};

export default AuthLayout;
