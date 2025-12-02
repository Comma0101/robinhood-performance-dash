'use client';

import { useState, useEffect } from 'react';
import { getMarketNews, type NewsItem } from '@/lib/api/market';

interface NewsFeedProps {
    tickers: string;
    limit?: number;
}

export default function NewsFeedMinimal({ tickers, limit = 5 }: NewsFeedProps) {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;

    useEffect(() => {
        const fetchNews = async () => {
            try {
                setLoading(true);
                // Fetch more items to allow local pagination
                const data = await getMarketNews(tickers, 20);
                setNews(data);
                setError(null);
            } catch (err) {
                console.error('Failed to fetch news:', err);
                setError('Failed to load news');
            } finally {
                setLoading(false);
            }
        };

        fetchNews();
        const interval = setInterval(fetchNews, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [tickers]); // Removed limit from dependency as we hardcode fetch size

    const totalPages = Math.ceil(news.length / itemsPerPage);
    const paginatedNews = news.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handlePrev = () => setCurrentPage(p => Math.max(1, p - 1));
    const handleNext = () => setCurrentPage(p => Math.min(totalPages, p + 1));

    if (loading && news.length === 0) {
        return (
            <div className="space-y-4">
                {[...Array(itemsPerPage)].map((_, i) => (
                    <div key={i} className="h-16 bg-gray-900/50 rounded animate-pulse"></div>
                ))}
            </div>
        );
    }

    if (error) {
        return <div className="text-red-400 text-xs">{error}</div>;
    }

    if (news.length === 0) {
        return <div className="text-gray-600 text-xs italic">No news found for {tickers}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="space-y-6 min-h-[400px]">
                {paginatedNews.map((item, idx) => (
                    <a
                        key={idx}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group"
                    >
                        <div className="flex flex-col gap-1">
                            <h4 className="text-sm text-gray-300 group-hover:text-blue-400 transition-colors leading-snug">
                                {item.title}
                            </h4>
                            <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-wider">
                                <span>{item.source}</span>
                                <span>•</span>
                                <span>{new Date(item.time_published.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                {item.overall_sentiment_label && (
                                    <>
                                        <span>•</span>
                                        <span className={`${item.overall_sentiment_label === 'Bullish' ? 'text-green-500' :
                                            item.overall_sentiment_label === 'Bearish' ? 'text-red-500' :
                                                'text-gray-500'
                                            }`}>
                                            {item.overall_sentiment_label}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </a>
                ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-gray-800/50">
                    <button
                        onClick={handlePrev}
                        disabled={currentPage === 1}
                        className="text-xs text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
                    >
                        ← Previous
                    </button>
                    <span className="text-[10px] text-gray-600 font-mono">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        onClick={handleNext}
                        disabled={currentPage === totalPages}
                        className="text-xs text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1"
                    >
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
}
