# supabase-nextjs-lab

Learning Supabase by building with it in a Next.js app.

## Local stack

`npx supabase start` boots the whole thing through Docker. Each service owns one
port:

| Port | Service | What you open |
|---|---|---|
| 54321 | API (PostgREST, Gotrue, Realtime, Storage) | `http://127.0.0.1:54321` |
| 54322 | Postgres | `psql -h 127.0.0.1 -p 54322 -U postgres` |
| 54323 | Studio | `http://127.0.0.1:54323` — table editor, SQL editor, RLS policies |
| 54324 | Mailpit | `http://127.0.0.1:54324` — every email the auth service sends |

`npx supabase status` prints the URLs and keys. `npx supabase stop` leaves the
volumes alone; `npx supabase stop --no-backup` throws the data away.

Two files, two jobs:

- `supabase/config.toml` is what the CLI reads. Auth settings, email
  confirmations, ports — all of it lives here.
- `.env.local` is what the Next.js app reads, and the CLI ignores it entirely.
  Copy `.env.example` and fill in the URL and publishable key that
  `npx supabase start` printed.
