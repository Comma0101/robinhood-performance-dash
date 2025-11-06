import { addDays, formatISO, subDays } from "date-fns";
import { NewsInsight, SocialPost } from "@/types/ai";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

type FinnhubArticle = {
  id?: number;
  category?: string;
  datetime?: number;
  headline?: string;
  summary?: string;
  source?: string;
  related?: string;
  url?: string;
};

const getEnv = (name: string) => process.env[name];

const toISO = (value: number | string | undefined): string => {
  if (!value) return new Date().toISOString();
  if (typeof value === "number") {
    return new Date(value * 1000).toISOString();
  }
  return new Date(value).toISOString();
};

const defaultImpactScore = (category?: string) => {
  if (!category) return 0.5;
  if (/earnings/i.test(category)) return 0.7;
  if (/ipo|m&a/i.test(category)) return 0.8;
  return 0.5;
};

const normalizeTickerList = (tickers: string[]): string[] =>
  tickers
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 5);

export async function fetchFinnhubNews(
  tickers: string[],
  limit = 12
): Promise<NewsInsight[]> {
  const apiKey = getEnv("FINNHUB_API_KEY");
  if (!apiKey) {
    console.warn("FINNHUB_API_KEY is not set; returning empty news feed.");
    return [];
  }

  const normalizedTickers = normalizeTickerList(tickers);
  const results: FinnhubArticle[] = [];

  // Always include top market headlines
  try {
    const generalRes = await fetch(
      `${FINNHUB_BASE_URL}/news?category=general&token=${apiKey}`,
      { next: { revalidate: 60 } }
    );
    if (generalRes.ok) {
      const generalData: FinnhubArticle[] = await generalRes.json();
      results.push(...generalData.slice(0, 10));
    } else {
      console.warn(
        "Finnhub general news request failed",
        generalRes.status,
        generalRes.statusText
      );
    }
  } catch (error) {
    console.warn("Finnhub general news request errored", error);
  }

  // Append company specific news for requested tickers
  if (normalizedTickers.length) {
    const toDate = formatISO(new Date(), { representation: "date" });
    const fromDate = formatISO(subDays(new Date(), 3), {
      representation: "date",
    });

    const companyArticles = await Promise.all(
      normalizedTickers.map(async (symbol) => {
        const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(
          symbol
        )}&from=${fromDate}&to=${toDate}&token=${apiKey}`;
        try {
          const res = await fetch(url, { next: { revalidate: 60 } });
          if (!res.ok) {
            console.warn(
              `Finnhub company news request failed for ${symbol}`,
              res.status,
              res.statusText
            );
            return [];
          }
          const data: FinnhubArticle[] = await res.json();
          return data.slice(0, 5);
        } catch (error) {
          console.warn(
            `Finnhub company news request errored for ${symbol}`,
            error
          );
          return [];
        }
      })
    );

    companyArticles.forEach((articles) => results.push(...articles));
  }

  // Deduplicate by URL
  const uniqueArticles = Array.from(
    new Map(
      results
        .filter((article) => article.url)
        .map((article) => [article.url, article])
    ).values()
  );

  return uniqueArticles.slice(0, limit).map((article, index) => ({
    id:
      typeof article.id === "number"
        ? `finnhub-${article.id}`
        : article.url ?? `finnhub-${index}`,
    headline: article.headline ?? "Untitled headline",
    summary: article.summary ?? "",
    source: article.source ?? "Finnhub",
    impactScore: defaultImpactScore(article.category),
    impactNarrative:
      article.summary ??
      (article.category
        ? `Category: ${article.category}`
        : "Market development"),
    relatedTickers: article.related
      ? article.related
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    publishedAtISO: toISO(article.datetime),
    url: article.url,
  }));
}

async function fetchTwitterFeed({
  limit = 10,
  handles,
}: {
  limit?: number;
  handles?: string[];
} = {}): Promise<SocialPost[]> {
  // This function now calls our local API route
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const url = new URL("/api/twitter", baseUrl);
    if (limit) url.searchParams.set("limit", String(limit));
    if (handles && handles.length > 0) {
      url.searchParams.set("handles", handles.join(","));
    }

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      console.error("Failed to fetch twitter feed from API route", res.status);
      return [];
    }
    const data = await res.json();
    return data.social || [];
  } catch (error) {
    console.error("Error calling /api/twitter", error);
    return [];
  }
}

export async function fetchNewsAndSocial(
  tickers: string[],
  {
    newsLimit = 12,
    socialLimit = 10,
    handles,
  }: { newsLimit?: number; socialLimit?: number; handles?: string[] } = {}
): Promise<{ news: NewsInsight[]; social: SocialPost[] }> {
  const [news, social] = await Promise.all([
    fetchFinnhubNews(tickers, newsLimit),
    fetchTwitterFeed({ limit: socialLimit, handles }),
  ]);

  return { news, social };
}
