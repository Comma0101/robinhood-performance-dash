/**
 * Reports API Client
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_PREFIX = '/api/v1';

export interface PreMarketReport {
  id: number;
  date: string;
  symbol: string;
  htf_bias: 'Bullish' | 'Bearish' | 'Neutral';
  htf_dealing_range_high?: number;
  htf_dealing_range_low?: number;
  htf_key_levels: Record<string, any[]>;
  ltf_structure: string;
  ltf_entry_zones: any[];

  // Session Structure
  asian_session_high?: number;
  asian_session_low?: number;
  london_session_high?: number;
  london_session_low?: number;
  session_liquidity_sweeps?: Array<{ type: string; level: string; price: number }>;
  asian_bars_count?: number;
  london_bars_count?: number;
  sessions_last_ts?: string;
  asian_complete?: boolean;
  london_complete?: boolean;
  london_made_high?: boolean;
  london_made_low?: boolean;

  // Dealing Range Zones
  premium_zone?: number;
  discount_zone?: number;
  equilibrium?: number;
  dealing_range_source?: string;

  // Liquidity Locations
  inducement_liquidity?: any[];
  target_liquidity?: any[];

  day_type: string;
  day_type_reasoning?: string;
  narrative: string;

  long_scenario: {
    entry_zone: { high: number; low: number };
    stop_loss: number;
    targets: number[];
    entry_type: string;
    invalidation: number;
    risk_reward: number;
    entry_conditions: string[];
  } | null;

  short_scenario: {
    entry_zone: { high: number; low: number };
    stop_loss: number;
    targets: number[];
    entry_type: string;
    invalidation: number;
    risk_reward: number;
    entry_conditions: string[];
  } | null;

  target_sessions: string[];
  trade_plan: any;
  confidence: number;
  post_market_summary?: string;
  created_at: string;
  updated_at: string;
}

export async function getMorningReport(date: string, symbol: string = 'QQQ'): Promise<PreMarketReport> {
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/reports/morning/${date}?symbol=${symbol}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('No report found');
    }
    const error = await response.json();
    throw new Error(error.detail || 'Failed to fetch report');
  }

  return response.json();
}

export async function generateReport(symbol: string = 'QQQ', targetDate?: string): Promise<void> {
  const url = new URL(`${API_BASE_URL}${API_PREFIX}/reports/generate`);
  url.searchParams.append('symbol', symbol);
  if (targetDate) {
    url.searchParams.append('target_date', targetDate);
  }

  const response = await fetch(
    url.toString(),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to generate report');
  }
}
