import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trading Dashboard | Performance Analytics",
  description:
    "Professional trading performance dashboard with detailed P/L analytics, trade history, and calendar visualization.",
  keywords: [
    "trading",
    "dashboard",
    "analytics",
    "stocks",
    "options",
    "performance",
  ],
  authors: [{ name: "Trading Dashboard" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

import Header from "@/components/Header";
import { GlobalUIProvider } from "@/context/GlobalUIContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GlobalUIProvider>
          <Header />
          <main className="pt-40 min-h-screen">
            {children}
          </main>
        </GlobalUIProvider>
      </body>
    </html>
  );
}
