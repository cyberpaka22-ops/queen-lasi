-- DINUX MOD STORE / WhatsApp bot database
-- Run the whole file in Supabase Dashboard -> SQL Editor.
-- Safe to re-run. Existing bot_sessions rows and session_id values are preserved.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. User profiles and application roles
-- A profile is created automatically when a Supabase Auth user signs up.
-- Never grant admin by accepting a role from a browser/client request.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    phone_number text,
    role text not null default 'user' check (role in ('user', 'admin', 'owner')),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email))
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 2. Bot instances and WhatsApp sessions
-- bot_sessions keeps the original session_id + data interface used by pair.js.
-- -----------------------------------------------------------------------------
create table if not exists public.bot_instances (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid references public.profiles(id) on delete set null,
    name text not null default 'Main Bot',
    instance_key text not null unique,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.bot_sessions (
    session_id text primary key,
    data jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    instance_id uuid references public.bot_instances(id) on delete set null,
    owner_user_id uuid references public.profiles(id) on delete set null,
    phone_number text,
    status text not null default 'unknown' check (status in ('unknown','pairing','connected','disconnected','logged_out','error')),
    last_connected_at timestamptz,
    last_seen_at timestamptz,
    metadata jsonb not null default '{}'::jsonb
);

-- Upgrade installations that already have the original three-column table.
-- Required by pair.js for Baileys multi-file session backups.
alter table public.bot_sessions add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.bot_sessions add column if not exists instance_id uuid references public.bot_instances(id) on delete set null;
alter table public.bot_sessions add column if not exists owner_user_id uuid references public.profiles(id) on delete set null;
alter table public.bot_sessions add column if not exists phone_number text;
alter table public.bot_sessions add column if not exists status text not null default 'unknown';
alter table public.bot_sessions add column if not exists last_connected_at timestamptz;
alter table public.bot_sessions add column if not exists last_seen_at timestamptz;
alter table public.bot_sessions add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Keep status values consistent on databases created from older schema versions.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.bot_sessions'::regclass
          and conname = 'bot_sessions_status_check'
    ) then
        alter table public.bot_sessions
            add constraint bot_sessions_status_check
            check (status in ('unknown','pairing','connected','disconnected','logged_out','error'));
    end if;
end;
$$;

create index if not exists bot_sessions_owner_idx on public.bot_sessions(owner_user_id);
create index if not exists bot_sessions_instance_idx on public.bot_sessions(instance_id);
create index if not exists bot_sessions_status_idx on public.bot_sessions(status);
create index if not exists bot_sessions_updated_idx on public.bot_sessions(updated_at desc);

-- -----------------------------------------------------------------------------
-- 3. Bot configuration and command registry
-- Settings are key/value JSON so new options do not require schema migrations.
-- -----------------------------------------------------------------------------
create table if not exists public.bot_settings (
    id uuid primary key default gen_random_uuid(),
    instance_id uuid references public.bot_instances(id) on delete cascade,
    setting_key text not null,
    setting_value jsonb not null default 'null'::jsonb,
    description text,
    is_public boolean not null default false,
    updated_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (instance_id, setting_key)
);
create index if not exists bot_settings_instance_idx on public.bot_settings(instance_id);

create table if not exists public.bot_commands (
    id uuid primary key default gen_random_uuid(),
    instance_id uuid references public.bot_instances(id) on delete cascade,
    command_name text not null,
    aliases text[] not null default '{}',
    description text not null default '',
    category text not null default 'misc',
    is_enabled boolean not null default true,
    admin_only boolean not null default false,
    owner_only boolean not null default false,
    cooldown_seconds integer not null default 0 check (cooldown_seconds >= 0),
    config jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (instance_id, command_name)
);
create index if not exists bot_commands_instance_idx on public.bot_commands(instance_id);
create index if not exists bot_commands_enabled_idx on public.bot_commands(is_enabled);
create index if not exists bot_commands_category_idx on public.bot_commands(category);

-- -----------------------------------------------------------------------------
-- 4. WhatsApp groups and per-group bot preferences
-- -----------------------------------------------------------------------------
create table if not exists public.whatsapp_groups (
    id uuid primary key default gen_random_uuid(),
    instance_id uuid references public.bot_instances(id) on delete cascade,
    group_jid text not null,
    group_name text,
    is_active boolean not null default true,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (instance_id, group_jid)
);

create table if not exists public.group_settings (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
    setting_key text not null,
    setting_value jsonb not null default 'null'::jsonb,
    updated_at timestamptz not null default now(),
    unique (group_id, setting_key)
);
create index if not exists group_settings_group_idx on public.group_settings(group_id);

-- -----------------------------------------------------------------------------
-- 5. Users using the bot, command audit and session lifecycle events
-- These are bot identities (WhatsApp JIDs), distinct from dashboard auth users.
-- -----------------------------------------------------------------------------
create table if not exists public.bot_users (
    id uuid primary key default gen_random_uuid(),
    whatsapp_jid text not null unique,
    phone_number text,
    display_name text,
    is_blocked boolean not null default false,
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    metadata jsonb not null default '{}'::jsonb
);
create index if not exists bot_users_phone_idx on public.bot_users(phone_number);

create table if not exists public.command_logs (
    id bigint generated always as identity primary key,
    instance_id uuid references public.bot_instances(id) on delete set null,
    session_id text references public.bot_sessions(session_id) on delete set null,
    bot_user_id uuid references public.bot_users(id) on delete set null,
    command_name text not null,
    chat_jid text,
    succeeded boolean not null default true,
    error_message text,
    executed_at timestamptz not null default now(),
    metadata jsonb not null default '{}'::jsonb
);
create index if not exists command_logs_executed_idx on public.command_logs(executed_at desc);
create index if not exists command_logs_command_idx on public.command_logs(command_name);
create index if not exists command_logs_user_idx on public.command_logs(bot_user_id);

create table if not exists public.session_events (
    id bigint generated always as identity primary key,
    session_id text references public.bot_sessions(session_id) on delete set null,
    event_type text not null check (event_type in ('pairing','connected','disconnected','reconnecting','logged_out','error','session_saved')),
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
create index if not exists session_events_session_idx on public.session_events(session_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 6. updated_at maintenance trigger
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

do $$
declare t text;
begin
    foreach t in array array['profiles','bot_instances','bot_sessions','bot_settings','bot_commands','whatsapp_groups'] loop
        execute format('drop trigger if exists set_%I_updated_at on public.%I', t, t);
        execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
    end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Security
-- All application tables are private by default. The Node server uses the
-- SUPABASE_SERVICE_ROLE_KEY (server-side only), which bypasses RLS. Dashboard
-- clients must use authenticated, explicitly-scoped policies before access.
-- No anon/public policies are created, especially for WhatsApp auth material.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
    foreach t in array array['profiles','bot_instances','bot_sessions','bot_settings','bot_commands','whatsapp_groups','group_settings','bot_users','command_logs','session_events'] loop
        execute format('alter table public.%I enable row level security', t);
    end loop;
end;
$$;

-- Helpful schema documentation
comment on table public.bot_sessions is 'Private Baileys multi-file authentication state; never expose to browser clients.';
comment on column public.bot_sessions.data is 'Serialized WhatsApp auth files. Treat as credentials/secrets.';
comment on table public.bot_settings is 'JSONB key/value settings per bot instance; NULL instance_id means global defaults.';
comment on table public.bot_commands is 'Database-backed command metadata and enable/permission flags.';
comment on table public.profiles is 'Supabase Auth user profile and application role; assign admin/owner only from trusted server/dashboard.';


-- FIRST ADMIN SETUP (run once after creating your account in Supabase Auth)
-- Replace the email with the account that should own this bot dashboard.
-- update public.profiles p set role = 'owner'
-- from auth.users u where u.id = p.id and u.email = 'YOUR_ADMIN_EMAIL@example.com';

-- ==================== Nexa web / developer / broadcast migration ====================
create table if not exists public.developers (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.developer_keys (
    id uuid primary key default gen_random_uuid(),
    developer_id uuid not null references public.developers(id) on delete cascade,
    key_prefix text not null,
    key_hash text not null unique,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    last_used_at timestamptz,
    created_at timestamptz not null default now()
);

alter table public.bot_sessions add column if not exists developer_id uuid references public.developers(id) on delete set null;
alter table public.bot_sessions add column if not exists is_active boolean not null default true;

create table if not exists public.session_settings (
    session_id text primary key references public.bot_sessions(session_id) on delete cascade,
    settings jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

create table if not exists public.session_contacts (
    session_id text not null references public.bot_sessions(session_id) on delete cascade,
    whatsapp_jid text not null,
    display_name text,
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    primary key (session_id, whatsapp_jid)
);

create table if not exists public.broadcasts (
    id uuid primary key default gen_random_uuid(),
    created_by uuid references public.profiles(id) on delete set null,
    session_id text references public.bot_sessions(session_id) on delete set null,
    message text not null check (char_length(message) between 1 and 4000),
    status text not null default 'queued' check (status in ('queued','running','done','cancelled','failed')),
    total integer not null default 0,
    sent integer not null default 0,
    failed integer not null default 0,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    finished_at timestamptz
);

create table if not exists public.broadcast_recipients (
    id bigint generated always as identity primary key,
    broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
    whatsapp_jid text not null,
    status text not null default 'pending' check (status in ('pending','sent','failed')),
    error_message text,
    sent_at timestamptz
);
create index if not exists broadcast_recipients_pending_idx on public.broadcast_recipients(broadcast_id, status);
create index if not exists broadcast_recipients_sent_idx on public.broadcast_recipients(sent_at) where status = 'sent';

alter table public.developers enable row level security;
alter table public.developer_keys enable row level security;
alter table public.session_settings enable row level security;
alter table public.session_contacts enable row level security;
alter table public.broadcasts enable row level security;
alter table public.broadcast_recipients enable row level security;
