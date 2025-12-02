"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const Navigation: React.FC = () => {
    const pathname = usePathname();

    const navItems = [
        { label: "Dashboard", href: "/" },
        { label: "Command Center", href: "/command-center" },
        { label: "AI Coach", href: "/ai-coach" },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-6 pointer-events-none">
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-full px-6 py-3 shadow-2xl pointer-events-auto flex items-center gap-8 transition-all hover:bg-black/50 hover:border-white/20">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`text-sm font-medium transition-all duration-300 relative ${isActive
                                    ? "text-white text-shadow-glow"
                                    : "text-gray-400 hover:text-white"
                                }`}
                        >
                            {item.label}
                            {isActive && (
                                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]"></span>
                            )}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
};

export default Navigation;
