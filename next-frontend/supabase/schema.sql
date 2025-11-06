-- Enable required extensions
create extension if not exists pgcrypto;

-- Conversations table
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text,
  status text not null default 'open', -- 'open' | 'closed'
  token_budget integer not null default 40000,
  token_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Messages table
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null,
  token_prompt integer,
  token_completion integer,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists idx_conversations_user on public.conversations(user_id, updated_at desc);
create index if not exists idx_messages_conv on public.messages(conversation_id, created_at asc);

-- Row Level Security (optional; enable and craft policies if using anon key)
-- alter table public.conversations enable row level security;
-- alter table public.messages enable row level security;
--
-- Example policies if using a JWT-based user id column instead of anon cookie:
-- create policy "conversations_is_owner" on public.conversations
--   for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
-- create policy "messages_is_owner" on public.messages
--   for all using (
--     exists(select 1 from public.conversations c where c.id = messages.conversation_id and c.user_id = auth.uid()::text)
--   ) with check (
--     exists(select 1 from public.conversations c where c.id = messages.conversation_id and c.user_id = auth.uid()::text)
--   );

