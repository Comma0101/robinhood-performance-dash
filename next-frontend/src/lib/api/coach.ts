/**
 * AI Coach API Client
 * Handles communication with the FastAPI backend coach endpoints
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_PREFIX = '/api/v1';

export interface CoachSession {
  id: number;
  session_id: string;
  started_at: string;
  ended_at: string | null;
  phase: 'pre_market' | 'kill_zone' | 'post_market' | 'general';
  related_date: string | null;
  related_trade_id: number | null;
  messages: Message[];
  key_insights: string[] | null;
  action_items: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ContextMetaEntry {
  name: string;
  source: string;
  generatedAt: string;
  metadata: Record<string, unknown>;
}

export interface ChatResponse {
  response: string;
  timestamp: string;
  phase: string;
  context_meta?: ContextMetaEntry[];
}

export interface CreateSessionRequest {
  phase?: 'pre_market' | 'kill_zone' | 'post_market' | 'general';
  related_date?: string;
  related_trade_id?: number;
}

/**
 * Create a new coaching session
 */
export async function createCoachSession(
  request: CreateSessionRequest
): Promise<CoachSession> {
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coach/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create coach session');
  }

  return response.json();
}

/**
 * Send a message to the coach
 */
export async function sendMessage(
  sessionId: string,
  message: string
): Promise<ChatResponse> {
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coach/sessions/${sessionId}/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to send message');
  }

  return response.json();
}

/**
 * Get all coaching sessions
 */
export async function getCoachSessions(
  phase?: string,
  limit: number = 20
): Promise<CoachSession[]> {
  const params = new URLSearchParams();
  if (phase) params.append('phase', phase);
  params.append('limit', limit.toString());

  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coach/sessions?${params}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to fetch sessions');
  }

  return response.json();
}

/**
 * Get a specific coaching session
 */
export async function getCoachSession(sessionId: string): Promise<CoachSession> {
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coach/sessions/${sessionId}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to fetch session');
  }

  return response.json();
}

/**
 * Delete a coaching session
 */
export async function deleteCoachSession(sessionId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coach/sessions/${sessionId}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete session');
  }
}
