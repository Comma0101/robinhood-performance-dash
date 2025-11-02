export interface Trade {
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

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: "profit" | "streak" | "trades" | "winrate" | "milestone";
  tier: "bronze" | "silver" | "gold" | "platinum";
  condition: (trades: Trade[], summary: any) => boolean;
  progress?: (
    trades: Trade[],
    summary: any
  ) => { current: number; target: number };
}

export const ACHIEVEMENTS: Achievement[] = [
  // First Steps
  {
    id: "first_win",
    title: "First Victory",
    description: "Close your first profitable trade",
    icon: "🎯",
    category: "milestone",
    tier: "bronze",
    condition: (trades) => trades.filter((t) => t.status === "Win").length >= 1,
    progress: (trades) => ({
      current: trades.filter((t) => t.status === "Win").length,
      target: 1,
    }),
  },
  {
    id: "first_ten",
    title: "Getting Started",
    description: "Complete 10 trades",
    icon: "📊",
    category: "trades",
    tier: "bronze",
    condition: (trades) => trades.length >= 10,
    progress: (trades) => ({
      current: trades.length,
      target: 10,
    }),
  },

  // Profit Milestones
  {
    id: "profit_1k",
    title: "$1K Club",
    description: "Reach $1,000 in total profit",
    icon: "💵",
    category: "profit",
    tier: "bronze",
    condition: (_, summary) => summary.total_pl >= 1000,
    progress: (_, summary) => ({
      current: Math.max(0, summary.total_pl),
      target: 1000,
    }),
  },
  {
    id: "profit_5k",
    title: "$5K Club",
    description: "Reach $5,000 in total profit",
    icon: "💰",
    category: "profit",
    tier: "silver",
    condition: (_, summary) => summary.total_pl >= 5000,
    progress: (_, summary) => ({
      current: Math.max(0, summary.total_pl),
      target: 5000,
    }),
  },
  {
    id: "profit_10k",
    title: "$10K Club",
    description: "Reach $10,000 in total profit",
    icon: "🏆",
    category: "profit",
    tier: "gold",
    condition: (_, summary) => summary.total_pl >= 10000,
    progress: (_, summary) => ({
      current: Math.max(0, summary.total_pl),
      target: 10000,
    }),
  },
  {
    id: "profit_50k",
    title: "$50K Club",
    description: "Reach $50,000 in total profit",
    icon: "💎",
    category: "profit",
    tier: "platinum",
    condition: (_, summary) => summary.total_pl >= 50000,
    progress: (_, summary) => ({
      current: Math.max(0, summary.total_pl),
      target: 50000,
    }),
  },

  // Win Streaks
  {
    id: "streak_3",
    title: "Hot Streak",
    description: "Win 3 trades in a row",
    icon: "🔥",
    category: "streak",
    tier: "bronze",
    condition: (trades) => getMaxWinStreak(trades) >= 3,
    progress: (trades) => ({
      current: getMaxWinStreak(trades),
      target: 3,
    }),
  },
  {
    id: "streak_5",
    title: "On Fire",
    description: "Win 5 trades in a row",
    icon: "🔥🔥",
    category: "streak",
    tier: "silver",
    condition: (trades) => getMaxWinStreak(trades) >= 5,
    progress: (trades) => ({
      current: getMaxWinStreak(trades),
      target: 5,
    }),
  },
  {
    id: "streak_10",
    title: "Unstoppable",
    description: "Win 10 trades in a row",
    icon: "⚡",
    category: "streak",
    tier: "gold",
    condition: (trades) => getMaxWinStreak(trades) >= 10,
    progress: (trades) => ({
      current: getMaxWinStreak(trades),
      target: 10,
    }),
  },

  // Trade Volume
  {
    id: "trades_50",
    title: "Active Trader",
    description: "Complete 50 trades",
    icon: "📈",
    category: "trades",
    tier: "bronze",
    condition: (trades) => trades.length >= 50,
    progress: (trades) => ({
      current: trades.length,
      target: 50,
    }),
  },
  {
    id: "trades_100",
    title: "Century Club",
    description: "Complete 100 trades",
    icon: "💯",
    category: "trades",
    tier: "silver",
    condition: (trades) => trades.length >= 100,
    progress: (trades) => ({
      current: trades.length,
      target: 100,
    }),
  },
  {
    id: "trades_500",
    title: "Veteran Trader",
    description: "Complete 500 trades",
    icon: "🎖️",
    category: "trades",
    tier: "gold",
    condition: (trades) => trades.length >= 500,
    progress: (trades) => ({
      current: trades.length,
      target: 500,
    }),
  },
  {
    id: "trades_1000",
    title: "Market Master",
    description: "Complete 1,000 trades",
    icon: "👑",
    category: "trades",
    tier: "platinum",
    condition: (trades) => trades.length >= 1000,
    progress: (trades) => ({
      current: trades.length,
      target: 1000,
    }),
  },

  // Win Rate
  {
    id: "winrate_60",
    title: "Consistent Trader",
    description: "Achieve 60%+ win rate (min 20 trades)",
    icon: "🎲",
    category: "winrate",
    tier: "bronze",
    condition: (_, summary) => {
      const winRate = parseFloat(summary.win_rate) || 0;
      return summary.total_trades >= 20 && winRate >= 60;
    },
    progress: (_, summary) => ({
      current: parseFloat(summary.win_rate) || 0,
      target: 60,
    }),
  },
  {
    id: "winrate_70",
    title: "Elite Trader",
    description: "Achieve 70%+ win rate (min 50 trades)",
    icon: "🌟",
    category: "winrate",
    tier: "silver",
    condition: (_, summary) => {
      const winRate = parseFloat(summary.win_rate) || 0;
      return summary.total_trades >= 50 && winRate >= 70;
    },
    progress: (_, summary) => ({
      current: parseFloat(summary.win_rate) || 0,
      target: 70,
    }),
  },
  {
    id: "winrate_80",
    title: "Trading Legend",
    description: "Achieve 80%+ win rate (min 100 trades)",
    icon: "👑",
    category: "winrate",
    tier: "gold",
    condition: (_, summary) => {
      const winRate = parseFloat(summary.win_rate) || 0;
      return summary.total_trades >= 100 && winRate >= 80;
    },
    progress: (_, summary) => ({
      current: parseFloat(summary.win_rate) || 0,
      target: 80,
    }),
  },

  // Special Achievements
  {
    id: "perfect_week",
    title: "Perfect Week",
    description: "Win 5 trades in a day",
    icon: "✨",
    category: "milestone",
    tier: "silver",
    condition: (trades) => {
      const tradesByDate = trades.reduce((acc, trade) => {
        const date = new Date(trade.close_date).toDateString();
        if (!acc[date]) acc[date] = [];
        acc[date].push(trade);
        return acc;
      }, {} as Record<string, Trade[]>);

      return Object.values(tradesByDate).some(
        (dayTrades: Trade[]) =>
          dayTrades.filter((t) => t.status === "Win").length >= 5
      );
    },
  },
  {
    id: "big_win",
    title: "Jackpot",
    description: "Win $500+ on a single trade",
    icon: "🎰",
    category: "milestone",
    tier: "silver",
    condition: (trades) =>
      trades.some((t) => t.status === "Win" && t.pnl >= 500),
  },
  {
    id: "comeback",
    title: "Comeback Kid",
    description: "Recover from 5 losses with 5 consecutive wins",
    icon: "💪",
    category: "milestone",
    tier: "gold",
    condition: (trades) => {
      // Check for pattern of 5 losses followed by 5 wins
      const sortedTrades = [...trades].sort(
        (a, b) =>
          new Date(a.close_date).getTime() - new Date(b.close_date).getTime()
      );

      for (let i = 0; i <= sortedTrades.length - 10; i++) {
        const segment = sortedTrades.slice(i, i + 10);
        const first5 = segment.slice(0, 5);
        const next5 = segment.slice(5, 10);

        const allLosses = first5.every((t) => t.status === "Loss");
        const allWins = next5.every((t) => t.status === "Win");

        if (allLosses && allWins) return true;
      }
      return false;
    },
  },
];

// Helper function to calculate max win streak
function getMaxWinStreak(trades: Trade[]): number {
  const sortedTrades = [...trades].sort(
    (a, b) =>
      new Date(a.close_date).getTime() - new Date(b.close_date).getTime()
  );

  let maxStreak = 0;
  let currentStreak = 0;

  for (const trade of sortedTrades) {
    if (trade.status === "Win") {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return maxStreak;
}

// Check which achievements are unlocked
export function checkAchievements(
  trades: Trade[],
  summary: any
): {
  unlocked: Achievement[];
  locked: Achievement[];
} {
  const unlocked: Achievement[] = [];
  const locked: Achievement[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (achievement.condition(trades, summary)) {
      unlocked.push(achievement);
    } else {
      locked.push(achievement);
    }
  }

  return { unlocked, locked };
}

// Get newly unlocked achievements (compared to previously unlocked)
export function getNewlyUnlocked(
  trades: Trade[],
  summary: any,
  previouslyUnlocked: string[]
): Achievement[] {
  const { unlocked } = checkAchievements(trades, summary);
  return unlocked.filter((a) => !previouslyUnlocked.includes(a.id));
}

// Save/load from localStorage
export function saveUnlockedAchievements(achievementIds: string[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(
      "unlockedAchievements",
      JSON.stringify(achievementIds)
    );
  }
}

export function loadUnlockedAchievements(): string[] {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("unlockedAchievements");
    return stored ? JSON.parse(stored) : [];
  }
  return [];
}
