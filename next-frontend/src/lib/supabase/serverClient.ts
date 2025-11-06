import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client using the service role for writes.
// Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your env.
export const getSupabaseServerClient = () => {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Supabase env not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

export type ConversationRow = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  status: 'open' | 'closed';
  token_budget: number;
  token_used: number;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string; // plain text for now; extend to JSON if needed
  created_at: string;
  token_prompt: number | null;
  token_completion: number | null;
  meta: Record<string, any> | null;
};

