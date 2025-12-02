"use client";

import React, { useState, useEffect } from "react";
import TradingCalendar from "@/components/CalendarView";

interface Trade {
    symbol: string;
    type: string;
    strike_price: number | null;
    expiration_date: string | null;
    quantity: number;
    open_date: string;
    close_date: string;
    buy_price: number;
    sell_price: number;
    holding_period: number;
    pnl: number;
    status: "Win" | "Loss" | "Breakeven";
}

export default function CalendarPage() {
    const [trades, setTrades] = useState<Trade[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchTrades = async () => {
            try {
                const response = await fetch("/api/trades");
                if (response.ok) {
                    const data = await response.json();
                    // The API returns { trades: [], metadata: {}, stats: {} }
                    // We need to access data.trades
                    const tradesData = data.trades || [];

                    const processedTrades = tradesData.map((t: any) => ({
                        ...t,
                        symbol: t.symbol || 'Unknown',
                        open_date: t.open_date,
                        close_date: t.close_date,
                    }));
                    setTrades(processedTrades);
                }
            } catch (error) {
                console.error("Error fetching trades:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchTrades();
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-8 text-white">Trading Calendar</h1>
            <TradingCalendar trades={trades} />
        </div>
    );
}
