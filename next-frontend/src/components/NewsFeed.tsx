'use client';

import { useState, useEffect } from 'react';
import { getMarketNews, type NewsItem } from '@/lib/api/market';

interface NewsFeedProps {
    tickers: string;
    limit?: number;
}

export default function NewsFeed({ tickers, limit = 5 }: NewsFeedProps) {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const ITEMS_PER_PAGE = 3;

    useEffect(() => {
        const fetchNews = async () => {
            try {
                setLoading(true);
                const data = await getMarketNews(tickers, limit);
                setNews(data);
                setPage(1); // Reset to first page on new search
                setError(null);
            } catch (err) {
                console.error('Failed to fetch news:', err);
                setError('Failed to load news');
            } finally {
                setLoading(false);
            }
        };

        fetchNews();
        // Refresh every 5 minutes
        const interval = setInterval(fetchNews, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [tickers, limit]);

    if (loading && news.length === 0) {
        return (
            <div className="animate-pulse space-y-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-24 bg-gray-800 rounded-lg"></div>
                ))}
            </div>
        );
    }

    if (error) {
        return <div className="text-red-400 text-sm">{error}</div>;
    }

    if (news.length === 0) {
        return <div className="text-gray-500 text-sm">No news found for {tickers}</div>;
    }

    const totalPages = Math.ceil(news.length / ITEMS_PER_PAGE);
    const paginatedNews = news.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <span>📰</span> Market News ({tickers})
                </h3>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>Page {page} of {totalPages}</span>
                    <div className="flex gap-1">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-1 hover:bg-gray-700 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                        >
                            ◀
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="p-1 hover:bg-gray-700 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                        >
                            ▶
                        </button>
                    </div>
                </div>
            </div>

            <div className="space-y-3 min-h-[300px]">
                {paginatedNews.map((item, idx) => (
                    <a
                        key={idx}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg p-4 transition-colors"
                    >
                        <div className="flex justify-between items-start gap-4">
                            <div>
                                <h4 className="font-medium text-blue-400 mb-1 line-clamp-2">
                                    {item.title}
                                </h4>
                                <p className="text-xs text-gray-400 mb-2">
                                    {item.source} • {new Date(item.time_published.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')).toLocaleString()}
                                </p>
                                <p className="text-sm text-gray-300 line-clamp-2">
                                    {item.summary}
                                </p>
                            </div>
                            <div className={`flex-shrink-0 px-2 py-1 rounded text-xs font-bold ${item.overall_sentiment_label === 'Bullish' ? 'bg-green-900/50 text-green-400' :
                                item.overall_sentiment_label === 'Bearish' ? 'bg-red-900/50 text-red-400' :
                                    'bg-gray-700 text-gray-400'
                                }`}>
                                {item.overall_sentiment_label}
                            </div>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}
