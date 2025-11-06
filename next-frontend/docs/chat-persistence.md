Chat Persistence (Supabase)

This project now persists chat conversations and messages to Supabase Postgres.

What was added
- Tables: `conversations`, `messages` (see `supabase/schema.sql`).
- API routes:
  - `POST /api/conversations` – create a new conversation.
  - `GET /api/conversations` – list conversations for current anon user.
  - `GET /api/conversations/:id/messages` – list messages.
  - `POST /api/conversations/:id/messages` – append a message (optional path; chat flow writes via `/api/chat`).
- Chat route update: `POST /api/chat` now accepts `conversationId`, loads last messages from DB, persists user + assistant messages, and enforces a per‑conversation token budget.
- Frontend: `ChartView` starts/loads a conversation on mount, hydrates messages from `/api/conversations/:id/messages`, passes `conversationId`, and shows a "Start New Chat" button when token limit is reached.

Environment variables (server)
- `SUPABASE_URL` – your Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` – service role key (server only; do not expose to client).

Setup
1) Create a Supabase project.
2) Run the SQL in `next-frontend/supabase/schema.sql` in the SQL editor.
3) Add env vars to `.env.local` (server-only vars):

```
SUPABASE_URL=your-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role
```

Token budget enforcement
- Default budget per conversation: `40000` tokens.
- When a chat turn would exceed the budget, `/api/chat` returns `409` and marks the conversation `closed`. The UI shows a Start New Chat button.
- You can pass a custom `tokenBudget` when creating a conversation.

Notes
- Current flow uses a cookie `anon_id` to identify the user (no auth yet). Later you can add real auth and RLS.
- For performance, the UI keeps messages in React state and the server persists after each turn. Polling is paused when tab hidden (unrelated to chat).

Anon session cookie and crypto
- We generate a durable anonymous ID (`anon_id`) and store it as an HTTP-only cookie so each browser has its own conversations.
- We use Node’s `crypto.randomUUID()` to create a secure, unique ID. That’s why we `import crypto from 'crypto'` in `src/lib/session.ts`.
- On Next.js 15, `cookies()` is an async Dynamic API. Our helper is async and all API routes `await getOrCreateAnonId()` to avoid the sync-API warning.

Runtime requirements
- `@supabase/supabase-js@^2.45.0` requires Node.js 20+. Upgrade your local Node (e.g., `nvm install 20 && nvm use 20`).
- After upgrading, reinstall deps and restart the dev server.
