"use client";

import React, { useMemo } from "react";
import { format } from "date-fns";
import {
    CommandCenterSnapshot,
    DirectionalBias,
} from "@/types/ai";
import NewsFeedMinimal from "./NewsFeedMinimal";
import { getMorningReport, generateReport, type PreMarketReport } from "@/lib/api/reports";

const biasToEmoji: Record<DirectionalBias, string> = {
    Bullish: "↗️",
    Bearish: "↘️",
    Sideways: "➡️",
};

const useMockSnapshot = (): CommandCenterSnapshot =>
    useMemo(() => {
        const now = new Date();
        return {
            sessionDateISO: now.toISOString(),
            session: {
                phase: "Pre-Market",
                focusTickers: ["NVDA"],
                nextEvent: {
                    label: "Market Open",
                    timeISO: new Date(now.setHours(9, 30, 0, 0)).toISOString(),
                },
            },
            directional: {
                instrument: "QQQ",
                bias: "Bullish",
                confidence: 0.5,
                narrative: "Loading market data...",
                keyLevels: [],
                supportingSignals: [],
                lastUpdatedISO: now.toISOString(),
            },
            news: [],
            journal: {
                summary: "No journal data available.",
                highlights: [],
                actionItems: [],
            },
            models: [],
            checklist: [],
        };
    }, []);

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MarkdownRenderer = ({ content }: { content: string }) => {
    return (
        <div className="prose prose-invert max-w-none prose-p:text-gray-300 prose-p:leading-relaxed prose-headings:text-white prose-strong:text-white prose-a:text-blue-400">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
            </ReactMarkdown>
        </div>
    );
};

interface ContentCardProps {
    title: string;
    icon?: string;
    children: React.ReactNode;
    className?: string;
    headerClassName?: string;
}

const ContentCard: React.FC<ContentCardProps> = ({
    title,
    icon,
    children,
    className = "bg-gray-900/20 border-gray-800",
    headerClassName = "text-gray-100"
}) => {
    return (
        <div className={`p-8 border rounded-xl backdrop-blur-sm ${className}`}>
            <div className={`flex items-center gap-3 mb-6 ${headerClassName}`}>
                {icon && <span className="text-2xl">{icon}</span>}
                <h3 className="text-xl font-bold uppercase tracking-wider">{title}</h3>
            </div>
            <div className="max-w-none">
                {children}
            </div>
        </div>
    );
};

const AICommandCenterMinimal: React.FC = () => {
    const snapshot = useMockSnapshot();
    const [newsTickers, setNewsTickers] = React.useState("NVDA");
    const [focusTickers, setFocusTickers] = React.useState<string[]>(["NVDA"]);
    const [isEditingFocus, setIsEditingFocus] = React.useState(false);
    const [tempFocusInput, setTempFocusInput] = React.useState("");
    const [report, setReport] = React.useState<PreMarketReport | null>(null);
    const [loadingReport, setLoadingReport] = React.useState(true);
    const [selectedDate, setSelectedDate] = React.useState(new Date());
    const [activeTab, setActiveTab] = React.useState<"pre-market" | "post-market">("pre-market");

    React.useEffect(() => {
        if (report?.post_market_summary) {
            setActiveTab("post-market");
        } else {
            setActiveTab("pre-market");
        }
    }, [report]);

    React.useEffect(() => {
        const fetchReport = async () => {
            try {
                const dateStr = format(selectedDate, 'yyyy-MM-dd');
                const data = await getMorningReport(dateStr, "QQQ");
                setReport(data);
            } catch (err) {
                console.error("Failed to fetch report:", err);
                setReport(null);
            } finally {
                setLoadingReport(false);
            }
        };
        setLoadingReport(true);
        fetchReport();
    }, [selectedDate]);

    // Initialize focus tickers from snapshot or report if needed
    React.useEffect(() => {
        if (snapshot.session.focusTickers) {
            setFocusTickers(snapshot.session.focusTickers);
        }
    }, [snapshot]);

    const handleGenerateReport = async () => {
        try {
            setLoadingReport(true);
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            await generateReport("QQQ", dateStr);
            setTimeout(async () => {
                const data = await getMorningReport(dateStr, "QQQ");
                setReport(data);
                setLoadingReport(false);
            }, 5000);
        } catch (err) {
            console.error("Failed to generate:", err);
            setLoadingReport(false);
        }
    };

    const handlePreviousDay = () => {
        setSelectedDate(prev => {
            const newDate = new Date(prev);
            newDate.setDate(newDate.getDate() - 1);
            return newDate;
        });
    };

    const handleNextDay = () => {
        setSelectedDate(prev => {
            const newDate = new Date(prev);
            newDate.setDate(newDate.getDate() + 1);
            return newDate;
        });
    };

    const handleToday = () => {
        setSelectedDate(new Date());
    };

    const handleSaveFocus = () => {
        if (tempFocusInput.trim()) {
            setFocusTickers(tempFocusInput.split(',').map(t => t.trim().toUpperCase()).filter(Boolean));
        }
        setIsEditingFocus(false);
    };

    const startEditingFocus = () => {
        setTempFocusInput(focusTickers.join(", "));
        setIsEditingFocus(true);
    };

    const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

    return (
        <div className="max-w-6xl mx-auto p-6 md:p-12 text-gray-200 font-sans">
            {/* Header Section */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 border-b border-gray-800 pb-6">
                <div>
                    <h1 className="text-3xl font-light tracking-tight text-white mb-2">Command Center</h1>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="uppercase tracking-wider font-medium">{format(selectedDate, "EEEE, MMMM do")}</span>
                        <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                        <span>{snapshot.session.phase}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            setLoadingReport(true);
                            const dateStr = format(selectedDate, 'yyyy-MM-dd');
                            getMorningReport(dateStr, "QQQ")
                                .then(data => setReport(data))
                                .catch(err => {
                                    console.error("Failed to refresh report:", err);
                                    setReport(null);
                                })
                                .finally(() => setLoadingReport(false));
                        }}
                        className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white"
                        title="Refresh Data"
                    >
                        ↻
                    </button>
                    <button
                        onClick={handlePreviousDay}
                        className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white"
                    >
                        ←
                    </button>
                    <button
                        onClick={handleToday}
                        disabled={isToday}
                        className={`px-3 py-1 text-xs font-medium uppercase tracking-wide rounded-full border transition-all ${isToday
                            ? "border-blue-500/30 text-blue-400 bg-blue-500/10"
                            : "border-gray-700 text-gray-400 hover:border-gray-500"
                            }`}
                    >
                        Today
                    </button>
                    <button
                        onClick={handleNextDay}
                        disabled={isToday}
                        className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        →
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                {/* Main Content - Left Column */}
                <div className="lg:col-span-8 space-y-12">

                    {/* Market Bias Section */}
                    <section>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="text-4xl">{biasToEmoji[report?.htf_bias as keyof typeof biasToEmoji] || "⏳"}</div>
                            <div>
                                <h2 className="text-xl font-medium text-white">
                                    {report?.htf_bias || "Analyzing Market..."}
                                </h2>
                                <p className="text-gray-500 text-sm">
                                    {report?.symbol || "QQQ"} Directional Bias • {report ? `${Math.round(report.confidence * 100)}% Confidence` : "Waiting for data"}
                                </p>
                            </div>
                        </div>

                        {report ? (
                            <div>
                                {/* Tabs */}
                                <div className="flex items-center gap-6 border-b border-gray-800 mb-8">
                                    <button
                                        onClick={() => setActiveTab("pre-market")}
                                        className={`pb-4 text-sm font-medium uppercase tracking-wider transition-colors relative ${activeTab === "pre-market"
                                            ? "text-blue-400"
                                            : "text-gray-500 hover:text-gray-300"
                                            }`}
                                    >
                                        Pre-Market Plan
                                        {activeTab === "pre-market" && (
                                            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400"></span>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("post-market")}
                                        disabled={!report.post_market_summary}
                                        className={`pb-4 text-sm font-medium uppercase tracking-wider transition-colors relative ${activeTab === "post-market"
                                            ? "text-purple-400"
                                            : !report.post_market_summary
                                                ? "text-gray-700 cursor-not-allowed"
                                                : "text-gray-500 hover:text-gray-300"
                                            }`}
                                    >
                                        Post-Market Review
                                        {activeTab === "post-market" && (
                                            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-purple-400"></span>
                                        )}
                                        {!report.post_market_summary && (
                                            <span className="ml-2 text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">PENDING</span>
                                        )}
                                    </button>
                                </div>

                                {/* Content */}
                                {activeTab === "pre-market" && (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <ContentCard
                                            title="Morning Briefing"
                                            icon="🌅"
                                            className="bg-gradient-to-br from-blue-900/10 to-purple-900/10 border-blue-500/20"
                                            headerClassName="text-blue-400"
                                        >
                                            <MarkdownRenderer content={report.narrative} />
                                        </ContentCard>

                                        {/* Scenarios Grid */}
                                        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {/* Long Scenario */}
                                            {report.long_scenario && (
                                                <div className="group border border-gray-800 hover:border-gray-700 bg-gray-900/20 rounded-lg p-6 transition-all">
                                                    <div className="flex items-center justify-between mb-6">
                                                        <span className="text-xs font-bold text-green-500 uppercase tracking-widest">Long Setup</span>
                                                        <span className="text-xs text-gray-500">{report.long_scenario.entry_type}</span>
                                                    </div>

                                                    <div className="space-y-6">
                                                        <div>
                                                            <span className="block text-xs text-gray-500 mb-1">Entry Zone</span>
                                                            <span className="text-xl text-gray-200 font-mono">
                                                                {report.long_scenario.entry_zone.low.toFixed(2)} — {report.long_scenario.entry_zone.high.toFixed(2)}
                                                            </span>
                                                        </div>

                                                        <div className="flex justify-between">
                                                            <div>
                                                                <span className="block text-xs text-gray-500 mb-1">Stop Loss</span>
                                                                <span className="text-red-400 font-mono">{report.long_scenario.stop_loss.toFixed(2)}</span>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="block text-xs text-gray-500 mb-1">Targets</span>
                                                                <span className="text-green-400 font-mono">
                                                                    {report.long_scenario.targets.map(t => t.toFixed(2)).join(', ')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Short Scenario */}
                                            {report.short_scenario && (
                                                <div className="group border border-gray-800 hover:border-gray-700 bg-gray-900/20 rounded-lg p-6 transition-all">
                                                    <div className="flex items-center justify-between mb-6">
                                                        <span className="text-xs font-bold text-red-500 uppercase tracking-widest">Short Setup</span>
                                                        <span className="text-xs text-gray-500">{report.short_scenario.entry_type}</span>
                                                    </div>

                                                    <div className="space-y-6">
                                                        <div>
                                                            <span className="block text-xs text-gray-500 mb-1">Entry Zone</span>
                                                            <span className="text-xl text-gray-200 font-mono">
                                                                {report.short_scenario.entry_zone.low.toFixed(2)} — {report.short_scenario.entry_zone.high.toFixed(2)}
                                                            </span>
                                                        </div>

                                                        <div className="flex justify-between">
                                                            <div>
                                                                <span className="block text-xs text-gray-500 mb-1">Stop Loss</span>
                                                                <span className="text-red-400 font-mono">{report.short_scenario.stop_loss.toFixed(2)}</span>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="block text-xs text-gray-500 mb-1">Targets</span>
                                                                <span className="text-green-400 font-mono">
                                                                    {/* Reverse targets for short scenarios to show closest first (highest price) if they are ascending */}
                                                                    {[...report.short_scenario.targets].sort((a, b) => b - a).map(t => t.toFixed(2)).join(', ')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </section>
                                    </div>
                                )}

                                {activeTab === "post-market" && report.post_market_summary && (
                                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <ContentCard
                                            title="Daily Report Card"
                                            icon="📝"
                                            className="bg-gradient-to-br from-purple-900/10 to-blue-900/10 border-purple-500/20"
                                            headerClassName="text-purple-400"
                                        >
                                            <MarkdownRenderer content={report.post_market_summary} />
                                        </ContentCard>
                                    </div>
                                )}
                            </div>
                        ) : loadingReport ? (
                            <div className="flex items-center gap-3 text-gray-500 animate-pulse">
                                <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
                                <span>Generating analysis...</span>
                            </div>
                        ) : (
                            <div className="py-8">
                                <button
                                    onClick={handleGenerateReport}
                                    className="text-blue-400 hover:text-blue-300 text-sm font-medium border-b border-blue-400/30 hover:border-blue-300 pb-0.5 transition-colors"
                                >
                                    Generate Report for {format(selectedDate, "MMM d")}
                                </button>
                            </div>
                        )}
                    </section>


                </div>

                {/* Sidebar - Right Column */}
                <div className="lg:col-span-4 space-y-10 border-l border-gray-800/50 lg:pl-10">

                    {/* Session Meta */}
                    <section>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Session Context</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-400">Focus</span>
                                {isEditingFocus ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={tempFocusInput}
                                            onChange={(e) => setTempFocusInput(e.target.value)}
                                            className="w-24 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:border-blue-500 outline-none"
                                            autoFocus
                                            onKeyDown={(e) => e.key === 'Enter' && handleSaveFocus()}
                                        />
                                        <button onClick={handleSaveFocus} className="text-green-400 hover:text-green-300 text-xs">✓</button>
                                        <button onClick={() => setIsEditingFocus(false)} className="text-gray-500 hover:text-gray-400 text-xs">✕</button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={startEditingFocus}
                                        className="text-sm text-white font-mono hover:text-blue-400 transition-colors border-b border-transparent hover:border-blue-400/50 dashed"
                                        title="Click to edit"
                                    >
                                        {focusTickers.join(", ")}
                                    </button>
                                )}
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-400">Next Event</span>
                                <div className="text-right">
                                    <span className="block text-sm text-white">{snapshot.session.nextEvent.label}</span>
                                    <span className="text-xs text-gray-600">{format(new Date(snapshot.session.nextEvent.timeISO), "h:mm a")}</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* News Feed */}
                    <section>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Market Radar</h3>
                        <div className="mb-4">
                            <input
                                type="text"
                                placeholder="Filter news..."
                                className="w-full bg-transparent border-b border-gray-800 py-2 text-sm text-gray-300 focus:border-gray-600 outline-none transition-colors placeholder-gray-700"
                                value={newsTickers}
                                onChange={(e) => setNewsTickers(e.target.value)}
                            />
                        </div>
                        <div className="opacity-80">
                            <NewsFeedMinimal tickers={newsTickers} limit={5} />
                        </div>
                    </section>

                    {/* Quick Stats / Model Health */}
                    <section>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">System Status</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {snapshot.models.map(model => (
                                <div key={model.id} className="bg-gray-900/30 p-3 rounded border border-gray-800/50">
                                    <div className="text-xs text-gray-400 mb-1">{model.name}</div>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-1.5 h-1.5 rounded-full ${model.status === 'Operational' ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                                        <span className="text-xs font-mono text-gray-300">{model.latencyMs}ms</span>
                                    </div>
                                </div>
                            ))}
                            {snapshot.models.length === 0 && (
                                <div className="text-xs text-gray-600 italic">No active models</div>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default AICommandCenterMinimal;
