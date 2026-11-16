# PLAN — Supabase × Next.js 16 learning lab

A learning roadmap, not a product spec. Seven phases; each carries four blocks:

- **Learn** — the concepts, and the primary sources to read them from
- **Build** — what gets created
- **Verify** — how you know it works, in observable terms
- **Record** — what lands in the Obsidian vault when the phase closes

> **Status: v0.** Written from the decisions locked in [the map](https://github.com/BIGboss248/supabase-nextjs-lab/issues/1). Refined as tickets close; the map is authoritative when this file and an issue disagree.

## What this is

A minimal storefront used as a vehicle. **v1 = auth + product listing.** No cart, no checkout, no payments, no admin UI, no image upload. Those omissions are deliberate: each one would double the surface area while teaching nothing new about the five goals below.

| Learning goal | Phases |
|---|---|
| 1. A development workflow you can rely on | 1, 7 |
| 2. Auth integrated into a Next.js app | 4, 5 |
| 3. Realtime changes reflected in the UI | 6 |
| 4. Services and contracts that abstract the database | 3 |
| 5. How to fetch data | 2, 6 |

## Locked decisions

These are settled. Do not re-open them mid-phase; if one is wrong, that is a new ticket.

| Decision | Consequence |
|---|---|
| Local-first, hosted only at the CI step | Every lesson happens against Docker, so it is reproducible and free |
| `create-next-app@latest` on Next 16, hand-wired `@supabase/ssr` | You write the cookie plumbing, so you learn it |
| Ports and adapters (`ProductCatalog`, `AuthService`) | Nothing outside an adapter knows Supabase exists |
| `Result<T>`, never thrown errors at the boundary | Callers handle failure explicitly |
| No cache layer in v1 | supabase-js never opts into Next's cache, and nothing opts in by default — reads are uncached because no one asked, not because a cache is bypassed |
| Server Actions are the mutation surface | Auth flows in v1, plus the dev `sellOneUnit` action |
| `.env.local` + `.env.example` | An explicit exception to vault rule #39 |
| Seven phases with Learn / Build / Verify / Record | Every phase produces both code and a note |

---

## Phase 1 — Toolchain and the local stack

**Learn**
- What the local Supabase stack actually is: Postgres, GoTrue (auth), PostgREST (data API), Realtime, Storage, Studio, Mailpit — and which port each owns.
- Why the CLI is a devDependency rather than a global install, and what `supabase init` writes into the repo.
- The publishable/secret key model, and why the publishable key is safe in the browser.
- Next 16's `proxy.ts` (formerly `middleware.ts`) and what the rename implies.
- Cache Components: `create-next-app` now enables `cacheComponents: true` by default, which makes caching entirely opt-in and requires a `<Suspense>` boundary around any uncached dynamic read. Expect this in the scaffold, not as something you add.

Sources: [Local development with the CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), [Next.js quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs), [Next.js proxy docs](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).

**Build**
- `npx create-next-app@latest` — TypeScript, App Router, Tailwind, `src/` directory
- `npx supabase init`, then `npx supabase start`
- `.env.local` + `.env.example` carrying `NEXT_PUBLIC_SUPABASE_URL` and the publishable key
- A `README` section listing the local ports, so you stop re-Googling them

**Verify**
- `npx supabase status` reports every service healthy.
- Studio answers on 54323; Mailpit on 54324.
- The Next app boots against the local URL with no auth wired yet.
- `npx supabase stop` then `start` again preserves your data.

**Record** — lab note: the port table, what `init` generates, and the fact that **the CLI reads `config.toml`, not your `.env` files**. That one will bite you when a secret "doesn't arrive".

---

## Phase 2 — Schema, RLS, and seed data

**Learn**
- Row Level Security as default-deny: a table with RLS on and no policy returns nothing, to everyone.
- Policy granularity — per command (`select`/`insert`/`update`/`delete`), per role (`anon`, `authenticated`), with `using` versus `with check` doing different jobs.
- Why `service_role` bypasses RLS, and why that key must never reach a client bundle. Read here, not demonstrated: this app holds no secret key (issue #2).
- `security definer` as the alternative to a bypass key, and the trap it carries — the function runs with owner rights, so **the `execute` grant is the authorisation**. Grant it to `anon` and you have published a write endpoint.
- Migrations as the durable artifact: how local schema changes become committed SQL.

Sources: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), the `supabase-postgres-best-practices` agent skill.

**Build**
- One migration, three labelled sections in dependency order: `products` (`uuid` key, `slug` unique, `name`, `description`, `price_minor` whole units, `currency`, `stock` non-negative, `image_url` nullable, `published` false by default, timestamps with an `updated_at` trigger) → access → publication. No `category`, no `rating`.
- RLS enabled, one `SELECT` policy `to anon, authenticated using (published = true)`, and no write policy at all
- `insert`/`update`/`delete`/`truncate` revoked from `anon, authenticated`, so deleting the policy does not re-open writes
- `sell_one_unit(uuid)` — `security definer`, `search_path` pinned, atomic conditional decrement, execute granted to `authenticated` only
- `products` added to the `supabase_realtime` publication in a guarded block (re-running must not error), with no `replica identity full`
- `supabase/seed.sql`: 8 realistic products — 4 in stock, 1 sold out, 1 low stock, 2 drafts — plus remote image URLs

**Verify**
- Anonymous `select` returns published rows only; unpublished rows are invisible.
- Anonymous `insert`/`update`/`delete` are refused — and still refused with the `SELECT` policy deleted, because the grants are gone too.
- `sell_one_unit` with an anonymous key is refused; with a signed-in session it decrements, and at zero it returns no row rather than an error.
- `supabase db diff` is clean after committing the migration.
- A fresh `supabase stop --no-backup` + `start` reproduces the whole schema from migrations plus seed.

**Record** — `SupaBase.md`: sharpen the RLS section with `using` vs `with check` and the default-deny consequence. Lab note: the exact policy SQL, and the fact that **Realtime authorises against RLS per subscriber** — a policy mistake shows up as silence, not an error.

> Closed in [#2](https://github.com/BIGboss248/supabase-nextjs-lab/issues/2): schema and posture fixed. Random-UUID key with slug addressing; read-only RLS plus withdrawn write grants; `sellOneUnit` is a `security definer` function granted to signed-in users only, so the app holds no secret key; update-only broadcast; one migration, three labelled sections.

---

## Phase 3 — Ports and adapters

**Learn**
- Contract-first design: define what callers need, then satisfy it, instead of exposing whatever the database happens to return.
- Why `PostgrestError` must not cross the adapter boundary, and what a domain-shaped error taxonomy buys you.
- Boundary validation — parsing at the edge so a schema change fails loudly once instead of producing `undefined` deep in a component.
- The fake adapter as a test seam: no Docker required to test business logic.

**Build**
- `ProductCatalog` and `AuthService` interfaces plus their DTOs
- Zod schemas for the adapter boundary; a parse failure maps to a distinct `AppError` case
- `Result<T>` = `{ ok: true, data } | { ok: false, error: AppError }`
- A Supabase adapter per port, and an in-memory fake per port
- One contract test suite run against both implementations

**Verify**
- Unit tests pass against the fake with Docker stopped.
- The same contract suite passes against the Supabase adapter.
- No component, page, or Server Action imports a Supabase client.
- Browsing `src/` shows exactly two places that know Supabase exists.

**Record** — lab note: the seam, why two ports and not five, and the concrete cost of the alternative (thin repositories leaking Supabase types into every caller).

> Open ticket: signatures and error taxonomy (issue #3) — now including a write operation on `ProductCatalog` and an `out_of_stock` case, per #2.

---

## Phase 4 — SSR auth wiring

**Learn**
- Cookie-based sessions versus `localStorage`: why the server needs the token in a cookie to render authenticated HTML.
- `getUser()` vs `getSession()` vs `getClaims()` — which one is authoritative server-side, and why trusting the other is a security bug.
- Why a Server Component cannot write cookies, and where writes are permitted instead.
- Session refresh, and why refresh tokens being **single-use** means exactly one layer may refresh: a second concurrent refresh revokes the whole session, which surfaces as random sign-outs.
- The matcher — what a stale matcher breaks, and why `_next/data` runs the proxy even when excluded.

Sources: [Server-side auth](https://supabase.com/docs/guides/auth/server-side), [creating a client](https://supabase.com/docs/guides/auth/server-side/creating-a-client), `docs/research/supabase-ssr-nextjs16.md`.

**Build**
- Browser and server client factories with the cookie adapter (`getAll`/`setAll`)
- `proxy.ts` refreshing the session on matched routes
- `AuthService` implemented against the server client

**Verify**
- Signing in sets `sb-*` cookies; a page reload keeps the session.
- Deleting the cookie logs you out on the next request.
- The server resolves identity from `claims.sub` — not `user.id`, which does not exist on a claims object.
- Two tabs refreshing at once do not sign you out.
- The token never appears in a client bundle.
- The proxy matcher covers every route that reads auth state.

**Record** — `SupaBase.md`: the `getUser`/`getSession` distinction and the cookie-write constraint. Lab note: the **Next 16 `middleware.ts` → `proxy.ts` rename**, since every tutorial you find predates it.

> Open tickets: SSR research (#4), auth flow decision (#5).

---

## Phase 5 — Auth flows and the protected route

**Learn**
- Server Actions as the mutation surface: what they replace, and how they interact with forms and progressive enhancement.
- Email confirmation as a loop you can actually test locally (Mailpit), and what `emailRedirectTo` must be.
- Error copy that does not leak account existence.

**Build**
- Sign-up, sign-in, sign-out — each a Server Action behind a form
- Confirmation via Mailpit, with the redirect URL configured in `config.toml`
- One protected route (`/account`) showing the session
- Header that reflects signed-in versus signed-out state

**Verify**
- Full loop end to end: sign up → read the confirmation mail in Mailpit → confirm → sign in → `/account` renders → sign out → `/account` redirects.
- Wrong password produces the same message as unknown email.
- An unconfirmed account cannot sign in, and says why.

**Record** — lab note: the full loop as an ordered checklist, plus the redirect-URL misconfiguration and its silent failure mode.

---

## Phase 6 — Listing, detail, and realtime

**Learn**
- RSC data fetching: the component awaits the port directly, and there is no client-side loading state for the initial render.
- How `supabase-js` interacts with Next's cache: it never opts in — no `cache` and no `next` field reaches `fetch` — and since Next 15 nothing opts in by default. Reads are uncached because no one asked, not because a cache is bypassed. A raw query cannot carry a tag; caching means wrapping the query in `use cache` + `cacheTag` (see `docs/research/nextjs-cache-supabase-js.md`).
- Why freshness here is an *accident*: with the `@supabase/ssr` cookie adapter, `cookies()` makes the route dynamic, so you get per-request data for free. A cookie-less client would freeze the page at build time — and you would never notice in `next dev`.
- Realtime authorisation: each subscriber's role is re-checked against RLS per changed row, and a row you cannot `SELECT` produces no event and no error. `SUBSCRIBED` only means the socket opened — it proves nothing about authorisation.
- The `UPDATE` rule: the policy must pass for both the old and the new row state, so unpublishing a row delivers nothing and leaves a stale card on screen.
- Channel lifecycle in React 19: return the cleanup synchronously (`removeChannel`) so Strict Mode's remount cannot race the join ack.

Sources: `docs/research/supabase-realtime-rls.md`.

**Build**
- `/` — listing: server-rendered grid, Suspense boundary, empty state, sold-out and low-stock states
- `/products/[slug]` — detail page, 404 on unknown slug
- A client component that subscribes to `UPDATE` on `products.stock` and reconciles into the server-rendered list
- A refetch on every `SUBSCRIBED` and on `visibilitychange`, since the stream has no replay
- A dev-only `sellOneUnit` Server Action as a write trigger — signed-in only, since the function's `execute` grant is `authenticated` (#2)

**Verify**
- Editing `stock` in Studio changes the open page within a second, with no reload.
- `sellOneUnit` updates the badge without a refresh.
- Navigating away and back does not accumulate duplicate subscriptions.
- Sleeping the tab and returning does not leave a stale list.
- The listing page is uncached: a Studio `INSERT` appears on reload without any revalidation step.

**Record** — `SupaBase.md`: extend the Realtime section with RLS authorisation. Lab note: the fetch-cache bypass, with the "why is my list stale / why is it not cached" pair of symptoms.

> Open tickets: realtime research (#6), realtime surface decision (#7).

---

## Phase 7 — Quality gates and CI/CD

**Learn**
- What each test layer buys you, and which layer earns its cost here. With a fake adapter, business logic is cheap to test; RLS and cookies are not.
- Local↔CI parity: what runs on save, pre-push, and in CI, and why they differ.
- `supabase db push` and drift: how a migration reaches a hosted project, and how deploy-on-merge can diverge from your local schema.
- Secrets management: which values are repository-level and which are environment-level.

Sources: `docs/research/supabase-cli-ci.md`.

**Build**
- Unit tests at the port layer; component tests for the listing states
- A Playwright E2E covering signup/login/logout and the protected route
- `.github/workflows/ci.yml` — the PR quality gate
- `.github/workflows/deploy-db.yml` — migrations on `main`, triggered only by changes under `supabase/`
- A hosted project, linked, with secrets set

**Verify**
- A deliberately failing test fails the PR, and a red PR cannot merge.
- Merging a migration to `main` pushes it to the hosted project, and re-running the job is a no-op rather than an error.
- Local schema and hosted schema agree: `supabase db diff --linked` is empty.
- The pre-push hook catches a failing unit test before it reaches CI.

**Record** — lab note: the pipeline diagram in text, the pinned versions, the drift mistake, and the free-tier limits you actually hit.

> Open tickets: CI research (#8), test strategy (#9), hosted provisioning (#12).

---

## Deliberate omissions

Not forgotten — ruled out. See the map's *Out of scope*; a decision to add any of these belongs in a new effort, not this plan.

Cart, checkout, payments, orders, order history · admin CRUD · app deployment · OAuth providers · Storage and uploads · i18n · multi-tenancy · Edge Functions · pgvector.

## Open questions

Tracked as fog in the map's *Not yet specified*: record-block granularity, the cache upgrade path, whether the detail page joins the stock channel, hosted↔local data parity, whether to enable the Supabase MCP server, and whether `stock` needs reservation semantics once two `sellOneUnit` calls can race.
