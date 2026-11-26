-- Panel access codes + login tokens. Run once in Supabase SQL Editor.
create table if not exists public.panel_access_codes (
    id uuid primary key default gen_random_uuid(),
    session_id text not null references public.bot_sessions(session_id) on delete cascade,
    code_hash text not null unique,
    created_at timestamptz not null default now(),
    revoked_at timestamptz,
    last_used_at timestamptz
);
create index if not exists panel_access_codes_session_idx on public.panel_access_codes(session_id);

create table if not exists public.panel_tokens (
    id uuid primary key default gen_random_uuid(),
    session_id text not null references public.bot_sessions(session_id) on delete cascade,
    token_hash text not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);
create index if not exists panel_tokens_expiry_idx on public.panel_tokens(expires_at);

alter table public.panel_access_codes enable row level security;
alter table public.panel_tokens enable row level security;
-- No policies: only the server (service role) touches these tables.
