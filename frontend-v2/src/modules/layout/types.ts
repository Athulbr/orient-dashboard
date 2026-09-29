export {};

// import React from 'react';

// import { FileText, Dock, Settings, LogOut } from 'lucide-react';
// import { ReactNode } from 'react';

// export interface NavItemType {
//     name: string;
//     icon: ReactNode;
//     path: string;
//     key: string;
//     onClick?: () => void;
// }

// export interface SidebarComponentIF {
//     showSidebar?: boolean;
//     setShowSidebar: (state: boolean) => void;
// }

// export const navItems: NavItemType[] = [
//     {
//         name: 'DocSnap',
//         icon: React.createElement(Dock, { strokeWidth: 1.5, size: 32, color: '#f3f4f6' }),
//         path: '/',
//         key: 'docsnap'
//     }

// ];

// export const configMenuItem: NavItemType = {
//     name: 'Config',
//     icon: React.createElement(Settings, { strokeWidth: 1.5, size: 30, color: '#f3f4f6' }),
//     path: '/config/user/list',
//     key: 'config'
// };

// export const logoutMenuItem: NavItemType = {
//     name: 'Logout',
//     icon: React.createElement(LogOut, { strokeWidth: 1.5, size: 32, color: '#f3f4f6' }),
//     path: '/config',
//     key: 'logout'
// };

// ============================================================================================

import { FC } from 'react';
// import { Dock, Menu, X } from 'lucide-react';
// import { useNavigate } from 'react-router-dom';
// import { MakezLogoHeader } from '../../assets/svg-icons/MakezLogoHeader';
// import useToggle from '../../hooks/useToggleHook';
// import { useToastStore } from '../../components/toast/ToastStore';
// import { NavItem } from './components/NavItem';
// import { SidebarComponentIF, configMenuItem, logoutMenuItem, navItems } from './types';
// import React from 'react';
// import { usePermissionStore } from '../../zustand-store/PermissionStore';

// // Desktop sidebar component
// const DesktopSidebar = () => {
//     const navigate = useNavigate();
//     const [expandedSidebar, toggleExpandedSidebar] = useToggle();
//     const { settings, checkPermission } = usePermissionStore();

//     const handleNavigation = (path: string) => {
//         navigate(path);
//     };

//     return (
//         <div className={`hidden h-full w-16 flex-col bg-[#012D56] transition-all duration-300 ease-in-out md:flex`}>
//             <section
//                 className={`flex flex-col items-center gap-5 pt-6 transition-all duration-800 ease-out ${
//                     expandedSidebar ? 'absolute top-16 left-0 z-2 h-[calc(100vh-64px)] w-45 bg-[#001529e3]' : 'h-full'
//                 }`}
//             >
//                 <div
//                     tabIndex={0}
//                     onClick={() => navigate('/')}
//                     className="flex h-16 w-12 cursor-pointer flex-col items-center justify-center gap-1 rounded-md transition-all duration-200 hover:bg-blue-900"
//                 >
//                     {<div className="text-[40px] font-bold text-white">D</div>}
//                 </div>
//                 {settings.length > 0 && checkPermission('read:settings') && (
//                     <div className={`flex flex-1 flex-col justify-end gap-4 pb-2 text-gray-400 ${expandedSidebar ? 'w-full' : 'items-center text-[10px]'}`}>
//                         <NavItem
//                             key={configMenuItem.key}
//                             item={configMenuItem}
//                             onClick={() => handleNavigation(configMenuItem.path)}
//                             expandedSidebar={expandedSidebar}
//                         />
//                         <span className="flex justify-center text-xs transition-opacity duration-300">{expandedSidebar ? '© 2025 makez.ai' : 'V 1.0.0'}</span>
//                     </div>
//                 )}
//             </section>
//         </div>
//     );
// };

// // Mobile sidebar overlay component
// const MobileSidebar: FC<SidebarComponentIF> = ({ showSidebar, setShowSidebar }) => {
//     const toast = useToastStore();
//     const navigate = useNavigate();

//     const logOut = () => {
//         toast.success('Logged out successfully');
//         setTimeout(() => {
//             window.sessionStorage.clear();
//             window?.location?.replace('/');
//         }, 500);
//     };

//     const handleNavigation = (path: string) => {
//         navigate(path);
//     };

//     const item = {
//         name: 'DocSnap',
//         icon: React.createElement(Dock, { strokeWidth: 1.5, size: 32, color: '#f3f4f6' }),
//         path: '/',
//         key: 'docsnap'
//     };

//     return (
//         <>
//             {showSidebar && (
//                 <div className="absolute top-0 left-0 z-20 flex h-screen w-screen bg-[#00000080] md:hidden">
//                     <div className="h-screen w-1/2 translate-x-0 transform bg-black">
//                         <div className="flex h-17 w-full items-center justify-between pl-6">
//                             <MakezLogoHeader />
//                         </div>
//                         <div className="flex flex-col gap-4 p-2 pt-6">
//                             <NavItem
//                                 item={item}
//                                 onClick={() => {
//                                     setShowSidebar(false);
//                                     handleNavigation(item.path);
//                                 }}
//                                 isMobile
//                             />
//                             <NavItem
//                                 key={logoutMenuItem.key}
//                                 item={logoutMenuItem}
//                                 onClick={() => {
//                                     setShowSidebar(false);
//                                     logOut();
//                                 }}
//                                 isMobile
//                             />
//                             <NavItem
//                                 key={configMenuItem.key}
//                                 item={configMenuItem}
//                                 onClick={() => {
//                                     setShowSidebar(false);
//                                     logOut();
//                                 }}
//                                 isMobile
//                             />
//                         </div>
//                     </div>
//                     <div onClick={() => setShowSidebar(false)} className="flex h-full flex-1 justify-end">
//                         <div className="flex h-16 w-16 items-center justify-center">
//                             <X className="cursor-pointer" color="white" size={20} />
//                         </div>
//                     </div>
//                 </div>
//             )}
//         </>
//     );
// };

// // Main sidebar component that renders both desktop and mobile sidebars
// const SidebarComponent: FC<SidebarComponentIF> = ({ showSidebar = false, setShowSidebar }) => {
//     return (
//         <>
//             <DesktopSidebar />
//             <MobileSidebar showSidebar={showSidebar} setShowSidebar={setShowSidebar} />
//         </>
//     );
// };

// export default SidebarComponent;
