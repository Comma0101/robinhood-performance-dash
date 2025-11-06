import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/serverClient';
import { getOrCreateAnonId } from '@/lib/session';

export async function GET() {
  try {
    const userId = await getOrCreateAnonId();
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json({ conversations: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list conversations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getOrCreateAnonId();
    const body = await request.json().catch(() => ({}));
    const title = typeof body?.title === 'string' ? body.title : null;
    const tokenBudget = Number.isFinite(body?.tokenBudget) ? Number(body.tokenBudget) : 40000;

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: userId, title, token_budget: tokenBudget })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ conversation: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create conversation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
