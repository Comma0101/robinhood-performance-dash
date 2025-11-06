import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/serverClient';
import { getOrCreateAnonId } from '@/lib/session';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const userId = await getOrCreateAnonId();
    const { id: conversationId } = await params;
    const supabase = getSupabaseServerClient();

    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id,user_id')
      .eq('id', conversationId)
      .single();
    if (convErr) throw convErr;
    if (!conv || conv.user_id !== userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { searchParams } = new URL(_req.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? 200), 500);

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return NextResponse.json({ messages: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list messages';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const userId = await getOrCreateAnonId();
    const { id: conversationId } = await params;
    const supabase = getSupabaseServerClient();

    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .select('id,user_id,status')
      .eq('id', conversationId)
      .single();
    if (convErr) throw convErr;
    if (!conv || conv.user_id !== userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (conv.status === 'closed') {
      return NextResponse.json({ error: 'Conversation closed' }, { status: 409 });
    }

    const body = await request.json();
    const role = body?.role;
    const content = body?.content;
    const meta = body?.meta ?? null;
    if (!['user', 'assistant', 'system', 'tool'].includes(role) || typeof content !== 'string') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, role, content, meta })
      .select('*')
      .single();
    if (error) throw error;

    // Touch conversation updated_at
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    return NextResponse.json({ message: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to append message';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
