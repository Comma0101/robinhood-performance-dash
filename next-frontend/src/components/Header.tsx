"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Calendar,
    Zap,
    LineChart,
    Bot,
    Search,
    Upload,
    CheckCircle2,
    Trophy,
    Download,
    Settings,
    Command,
    TrendingUp,
} from "lucide-react";
import { useGlobalUI } from "@/context/GlobalUIContext";

interface HeaderProps {
    onSearch?: () => void;
    onUpload?: () => void;
    onVerify?: () => void;
    onAchievements?: () => void;
    onExport?: () => void;
    onSettings?: () => void;
}

const Header: React.FC<HeaderProps> = ({
    onSearch: propsOnSearch,
    onUpload: propsOnUpload,
    onVerify: propsOnVerify,
    onAchievements: propsOnAchievements,
    onExport: propsOnExport,
    onSettings: propsOnSettings,
}) => {
    const pathname = usePathname();
    // Try to use global UI context, but fallback gracefully if not available (e.g. during initial render or tests)
    let globalUI;
    try {
        globalUI = useGlobalUI();
    } catch (e) {
        // Ignore error if context is missing
    }

    const handleSearch = propsOnSearch || globalUI?.openCommandPalette;
    const handleUpload = propsOnUpload || globalUI?.openUploader;
    const handleVerify = propsOnVerify || globalUI?.openVerification;
    const handleAchievements = propsOnAchievements || globalUI?.openAchievements;
    const handleSettings = propsOnSettings || globalUI?.openSettings;

    const navItems = [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { label: "Calendar", href: "/calendar", icon: Calendar },
        { label: "AI Coach", href: "/ai-coach", icon: Bot },
        { label: "Command Center", href: "/command-center", icon: Zap, badge: "AI" },
        { label: "Chart Workspace", href: "/chart-view", icon: LineChart },
    ];

    // Hide header on landing page
    if (pathname === "/") {
        return null;
    }

    return (
        <header className="fixed top-0 left-0 right-0 z-50 flex flex-col items-center">
            {/* Top Row: Navigation */}
            <div className="w-full max-w-5xl mx-auto mt-6 pointer-events-auto">
                <div className="flex items-center justify-between px-2">
                    {/* Logo / Title */}
                    <div className="flex items-center gap-3 group cursor-pointer">
                        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-all duration-300">
                            <TrendingUp className="text-white w-6 h-6" />
                            <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-lg font-bold tracking-tight text-white leading-none group-hover:text-blue-400 transition-colors">
                                QUANT<span className="text-blue-500">DASH</span>
                            </h1>
                            <span className="text-[10px] font-medium text-gray-500 tracking-widest uppercase group-hover:text-gray-400 transition-colors">
                                Performance Analytics
                            </span>
                        </div>
                    </div>

                    {/* Navigation Pills */}
                    <nav className="bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-2 py-1.5 shadow-2xl flex items-center gap-1">
                        {navItems.map((item) => {
                            const isActive = pathname === item.href;
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`
                    flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                    ${isActive
                                            ? "bg-white/10 text-white shadow-[0_0_10px_rgba(255,255,255,0.1)]"
                                            : "text-gray-400 hover:text-white hover:bg-white/5"
                                        }
                  `}
                                >
                                    <Icon size={16} className={isActive ? "text-blue-400" : ""} />
                                    <span>{item.label}</span>
                                    {item.badge && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30">
                                            {item.badge}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Right Side Placeholder (Profile/User) */}
                    <div className="w-[140px] flex justify-end">
                        {/* Could add user profile here later */}
                    </div>
                </div>
            </div>

            {/* Bottom Row: Toolbar (Only visible on Dashboard) */}
            {pathname === '/dashboard' && (
                <div className="mt-4 pointer-events-auto">
                    <div className="bg-[#0A0A0A]/80 backdrop-blur-xl border border-white/5 rounded-xl px-3 py-2 shadow-2xl flex items-center gap-2">
                        <button
                            onClick={handleSearch}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-sm text-gray-300 transition-colors group"
                        >
                            <Search size={14} className="text-gray-500 group-hover:text-white" />
                            <span>Search</span>
                            <div className="flex items-center gap-0.5 ml-2 px-1.5 py-0.5 bg-black/40 rounded text-[10px] text-gray-500 font-mono">
                                <Command size={10} />
                                <span>K</span>
                            </div>
                        </button>

                        <div className="w-px h-6 bg-white/10 mx-1" />

                        <ActionButton icon={Upload} label="Upload" onClick={handleUpload} primary />
                        <ActionButton icon={CheckCircle2} label="Verify" onClick={handleVerify} />
                        <ActionButton icon={Trophy} label="Achievements" onClick={handleAchievements} />
                        <ActionButton icon={Download} label="Export" onClick={propsOnExport} />
                        <ActionButton icon={Settings} label="Settings" onClick={handleSettings} />
                    </div>
                </div>
            )}
        </header>
    );
};

const ActionButton = ({
    icon: Icon,
    label,
    onClick,
    primary = false,
}: {
    icon: any;
    label: string;
    onClick?: () => void;
    primary?: boolean;
}) => (
    <button
        onClick={onClick}
        className={`
      flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200
      ${primary
                ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }
    `}
    >
        <Icon size={16} className={primary ? "text-white" : "text-gray-500"} />
        <span>{label}</span>
    </button>
);

export default Header;
