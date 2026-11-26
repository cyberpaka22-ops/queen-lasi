# Nexa

WhatsApp bot platform (Baileys + Supabase) with a black & white web UI.

## Pages

| Page | URL | Who |
|---|---|---|
| Landing + pairing | `/` | Anyone links a number |
| Developer panel | `/developer.html` | Developers, with a key from the admin |
| Admin panel | `/admin.html` | Admin / owner Supabase accounts |

## Setup

1. Create a Supabase project. In **SQL Editor** run the whole `supabase.sql`.
2. Copy `.env.example` to `.env` (or set these as hosting variables):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only, never in the browser)
   - `SUPABASE_ANON_KEY` (used by the admin login page)
   - `OWNER_NUMBERS` (optional, comma separated WhatsApp numbers treated as owners)
3. `npm install` then `npm start` (Node 22+).
4. Run exactly one replica. Active sockets live in process memory.

## Roles

- **Admin / owner** (Supabase Auth + `profiles.role`): manage users, commands, global defaults, developers, keys, sessions, and broadcasts.
- **Developer** (`nxd_…` key): sees only sessions assigned to them. Can change that number's bot settings, view its contacts, send updates to its contacts, deactivate it, and revoke their own key.
- **Bot owner** (the linked WhatsApp account, or `OWNER_NUMBERS`): when `COMMANDS_OWNER_ONLY` is on, other people's messages starting with the prefix are ignored.

## Developer keys

Admin → Developers → create the developer → **Keys** → **Generate key**. The key is shown once. Keys expire after the chosen number of days (default 30) and can be revoked at any time. Only a SHA-256 hash is stored.

## Per-number settings

Each number has its own row in `session_settings`. Only whitelisted settings can be changed from the developer panel (see `ALLOWED_SETTINGS` in `developer-api.js`). Any setting left unchanged uses the global default from `config.js`.

## Broadcasts

Updates go only to the contacts of the chosen number, meaning people who have messaged that bot. Sends are paced (4–8 s between messages), capped at 300 per 24 hours in total, and can be cancelled. Every recipient's result is stored.

## Security notes

- Rotate any key or token that was ever stored in a zip, repo, or chat. Earlier versions of this project included a `.env` with live credentials. That file has been removed here.
- `bot_sessions` contains WhatsApp credentials. Keep RLS enabled and never add public read policies.
- Plugins run with the linked account's permissions. Install only code you trust.
- Pairing (`/pair`) is public by design so people can link their own numbers. Add rate limiting or a CAPTCHA before wide release.

## Known limitations

- Some plugins still show the hard-coded footer "Developer: dinux". Replace it with `config.DEVELOPER` where needed.
- Baileys is pinned to the fork in `package.json`. Pin an exact version before production.
