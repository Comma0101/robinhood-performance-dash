"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface GlobalUIContextType {
    isCommandPaletteOpen: boolean;
    openCommandPalette: () => void;
    closeCommandPalette: () => void;

    isUploaderOpen: boolean;
    openUploader: () => void;
    closeUploader: () => void;

    isVerificationOpen: boolean;
    openVerification: () => void;
    closeVerification: () => void;

    isAchievementsOpen: boolean;
    openAchievements: () => void;
    closeAchievements: () => void;

    isSettingsOpen: boolean;
    openSettings: () => void;
    closeSettings: () => void;
}

const GlobalUIContext = createContext<GlobalUIContextType | undefined>(undefined);

export const GlobalUIProvider = ({ children }: { children: ReactNode }) => {
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
    const [isUploaderOpen, setIsUploaderOpen] = useState(false);
    const [isVerificationOpen, setIsVerificationOpen] = useState(false);
    const [isAchievementsOpen, setIsAchievementsOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    return (
        <GlobalUIContext.Provider
            value={{
                isCommandPaletteOpen,
                openCommandPalette: () => setIsCommandPaletteOpen(true),
                closeCommandPalette: () => setIsCommandPaletteOpen(false),

                isUploaderOpen,
                openUploader: () => setIsUploaderOpen(true),
                closeUploader: () => setIsUploaderOpen(false),

                isVerificationOpen,
                openVerification: () => setIsVerificationOpen(true),
                closeVerification: () => setIsVerificationOpen(false),

                isAchievementsOpen,
                openAchievements: () => setIsAchievementsOpen(true),
                closeAchievements: () => setIsAchievementsOpen(false),

                isSettingsOpen,
                openSettings: () => setIsSettingsOpen(true),
                closeSettings: () => setIsSettingsOpen(false),
            }}
        >
            {children}
        </GlobalUIContext.Provider>
    );
};

export const useGlobalUI = () => {
    const context = useContext(GlobalUIContext);
    if (context === undefined) {
        throw new Error("useGlobalUI must be used within a GlobalUIProvider");
    }
    return context;
};
