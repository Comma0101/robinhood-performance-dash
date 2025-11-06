import { SocialPost } from "@/types/ai";

const X_API_BASE = "https://api.twitter.com/2";

// Simple in-memory cache with TTL
const cache = new Map<string, { value: any; expiry: number }>();

function setCache(key: string, value: any, ttl: number) {
  const expiry = Date.now() + ttl;
  cache.set(key, { value, expiry });
}

function getCache(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) {
    return entry.value;
  }
  cache.delete(key);
  return null;
}

type UserTimelineResponse = {
  data?: Array<{
    id: string;
    text: string;
    author_id: string;
    created_at: string;
    public_metrics?: {
      like_count?: number;
      retweet_count?: number;
      reply_count?: number;
    };
    entities?: {
      cashtags?: Array<{ tag: string }>;
    };
  }>;
  includes?: {
    users?: Array<{
      id: string;
      name: string;
      username: string;
      profile_image_url?: string;
      verified?: boolean;
    }>;
  };
  meta?: {
    result_count: number;
  };
};

type UserLookupResponse = {
  data?: {
    id: string;
    name: string;
    username: string;
  };
};

const getEnv = (name: string) => process.env[name];

const toISO = (value: number | string | undefined): string => {
  if (!value) return new Date().toISOString();
  if (typeof value === "number") {
    return new Date(value * 1000).toISOString();
  }
  return new Date(value).toISOString();
};

async function resolveTwitterHandle(handle: string): Promise<string | null> {
  const cachedId = getCache(`twitter-id-${handle}`);
  if (cachedId) return cachedId;

  const bearer = getEnv("X_BEARER_TOKEN");
  if (!bearer) return null;

  try {
    const res = await fetch(`${X_API_BASE}/users/by/username/${handle}`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });

    if (!res.ok) {
      console.warn(`Failed to resolve Twitter handle: @${handle}`, res.status);
      return null;
    }

    const data: UserLookupResponse = await res.json();
    const userId = data.data?.id;

    if (userId) {
      // Cache for 24 hours
      setCache(`twitter-id-${handle}`, userId, 24 * 60 * 60 * 1000);
      return userId;
    }
  } catch (error) {
    console.error(`Error resolving Twitter handle @${handle}:`, error);
  }

  return null;
}

const parseHandlesFromEnv = (): string[] =>
  (getEnv("X_SOCIAL_HANDLES") ?? "traderstewie,wsbchairman,deitaone,gurgavin")
    .split(",")
    .map((handle) => handle.trim().replace(/^@/, ""))
    .filter(Boolean);

export async function fetchTweets({
  limit = 10,
  handles,
}: {
  limit?: number;
  handles?: string[];
} = {}): Promise<SocialPost[]> {
  const bearer = getEnv("X_BEARER_TOKEN");
  if (!bearer) {
    console.warn("X_BEARER_TOKEN is not set; returning empty tweet feed.");
    return [];
  }

  const targetHandles =
    handles && handles.length > 0 ? handles : parseHandlesFromEnv();
  if (targetHandles.length === 0) return [];

  const userIds: string[] = [];
  for (const handle of targetHandles) {
    const userId = await resolveTwitterHandle(handle);
    if (userId) {
      userIds.push(userId);
    }
    // Add a small delay to avoid hitting rate limits
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (userIds.length === 0) return [];

  const allTweets: SocialPost[] = [];

  for (const userId of userIds) {
    const cacheKey = `tweets-user-${userId}`;
    const cachedTweets = getCache(cacheKey);
    if (cachedTweets) {
      allTweets.push(...cachedTweets);
      continue;
    }

    const url = new URL(`${X_API_BASE}/users/${userId}/tweets`);
    url.searchParams.set("max_results", "10");
    url.searchParams.set("tweet.fields", "created_at,public_metrics,entities");
    url.searchParams.set("expansions", "author_id");
    url.searchParams.set(
      "user.fields",
      "name,username,profile_image_url,verified"
    );

    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${bearer}` },
      });

      if (!res.ok) {
        console.warn(`Failed to fetch tweets for user ${userId}`, res.status);
        continue;
      }

      const data: UserTimelineResponse = await res.json();
      const user = data.includes?.users?.find((u) => u.id === userId);

      const tweets = (data.data ?? []).map((tweet) => {
        const cashtags =
          tweet.entities?.cashtags?.map((tag) => tag.tag.toUpperCase()) ?? [];
        return {
          id: tweet.id,
          source: "twitter" as const,
          author: {
            name: user?.name ?? "Unknown",
            handle: user?.username ? `@${user.username}` : "@unknown",
            avatarUrl: user?.profile_image_url,
            verified: user?.verified ?? false,
          },
          text: tweet.text,
          url: user?.username
            ? `https://twitter.com/${user.username}/status/${tweet.id}`
            : `https://twitter.com/i/web/status/${tweet.id}`,
          metrics: {
            likeCount: tweet.public_metrics?.like_count ?? 0,
            retweetCount: tweet.public_metrics?.retweet_count ?? 0,
            replyCount: tweet.public_metrics?.reply_count ?? 0,
          },
          relatedTickers: cashtags,
          publishedAtISO: toISO(tweet.created_at),
        };
      });

      // Cache for 2 minutes
      setCache(cacheKey, tweets, 2 * 60 * 1000);
      allTweets.push(...tweets);
    } catch (error) {
      console.error(`Error fetching tweets for user ${userId}:`, error);
    }
  }

  // Sort by date and take the most recent ones
  return allTweets
    .sort((a, b) => b.publishedAtISO.localeCompare(a.publishedAtISO))
    .slice(0, limit);
}
