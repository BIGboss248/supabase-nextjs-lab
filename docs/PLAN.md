# PLAN — Supabase × Next.js 16 learning lab

A learning roadmap, not a product spec. Seven phases; each carries four blocks:

- **Learn** — the concepts, and the primary sources to read them from
- **Build** — what gets created
- **Verify** — how you know it works, in observable terms
- **Record** — what lands in the Obsidian vault when the phase closes

> **Status: v0.** Written from the decisions locked in [the map](https://github.com/BIGboss248/supabase-nextjs-lab/issues/1). Refined as tickets close; the map is authoritative when this file and an issue disagree.
>
> **Live status lives in the phase tasks on the map**, one `wayfinder:task` per phase, chained by native blocking: [#15](https://github.com/BIGboss248/supabase-nextjs-lab/issues/15) → [#16](https://github.com/BIGboss248/supabase-nextjs-lab/issues/16) → [#17](https://github.com/BIGboss248/supabase-nextjs-lab/issues/17) → [#18](https://github.com/BIGboss248/supabase-nextjs-lab/issues/18) → [#19](https://github.com/BIGboss248/supabase-nextjs-lab/issues/19). Tick boxes there, not here; this file stays the curriculum.

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
| Dark mode from the first component, via shadcn's `ThemeProvider` over `next-themes` ([#11](https://github.com/BIGboss248/supabase-nextjs-lab/issues/11)) | The server never learns the theme; the first correct paint comes from the provider's inline script, not from SSR |
| No cache layer in v1 | supabase-js never opts into Next's cache, and nothing opts in by default — reads are uncached because no one asked, not because a cache is bypassed |
| Server Actions are the mutation surface | Auth flows in v1, plus the dev `sellOneUnit` action |
| `.env.local` + `.env.example` | An explicit exception to vault rule #39 |
| PascalCase files across `src/` and `tests/` ([ADR 0001](adr/0001-file-naming-conventions.md)) | One case for modules and components; the vault's `snake_case` rule does not apply here |
| Seven phases with Learn / Build / Verify / Record | Every phase produces both code and a note |

---

## Phase 1 — Toolchain and the local stack

**Status** — landed on `main`: scaffold `2d4826c`, Sentry `8cc5852`, lint rule `6e0fb69`, docs `b5b8daf`. Every Verify bullet was checked on 2026-11-18.

**Learn**
- What the local Supabase stack actually is: Postgres, GoTrue (auth), PostgREST (data API), Realtime, Storage, Studio, Mailpit — and which port each owns.
- Why the CLI is a devDependency rather than a global install, and what `supabase init` writes into the repo.
- The publishable/secret key model, and why the publishable key is safe in the browser.
- Next 16's `proxy.ts` (formerly `middleware.ts`) and what the rename implies.
- Cache Components: `create-next-app` now enables `cacheComponents: true` by default, which makes caching entirely opt-in and requires a `<Suspense>` boundary around any uncached dynamic read. Expect this in the scaffold, not as something you add.

Sources: [Local development with the CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), [Next.js quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs), [Next.js proxy docs](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).

**Build**
- The selected rows of [the setup feature inventory](#setup-feature-inventory) that land in this phase — no other phase can start before the scaffold exists
- `npx create-next-app@latest` — TypeScript, App Router, Tailwind, `src/` directory
- `npx supabase init`, then `npx supabase start`
- `.env.local` + `.env.example` carrying `NEXT_PUBLIC_SUPABASE_URL` and the publishable key
- An `eslint-plugin-check-file` rule enforcing [ADR 0001](adr/0001-file-naming-conventions.md), so a lowercase component fails lint rather than review
- A `README` section listing the local ports, so you stop re-Googling them

**Verify**
- `npx supabase status` reports every service healthy.
- Studio answers on 54323; Mailpit on 54324.
- The Next app boots against the local URL with no auth wired yet.
- A component file named `product_card.tsx` fails lint; `ProductCard.tsx` passes.
- `npx supabase stop` then `start` again preserves your data.

**Record** — lab note: the port table, what `init` generates, and the fact that **the CLI reads `config.toml`, not your `.env` files**. That one will bite you when a secret "doesn't arrive".

---

## Phase 2 — Schema, RLS, and seed data

**Status** — landed on `main` in `c1b725f`; every Verify bullet was checked on 2026-11-18.

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

**Tracked in** [#15 Phase 3 - Finish ports and adapters](https://github.com/BIGboss248/supabase-nextjs-lab/issues/15) — core types landed in `67e38c7`; the schemas, both adapters and the contract suite remain.

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

> Closed in [#3](https://github.com/BIGboss248/supabase-nextjs-lab/issues/3) — **Define the port signatures and error taxonomy**: seven methods across two ports; one `Product` DTO with no `published` field; nine-variant `AppError` with diagnostic messages and UI-owned copy; Zod parsing inside the adapter; a request-scoped, cookie-bound factory behind a single `server-only` door; a fake that models stock rules but not RLS; one contract suite with a gated Supabase half. File names follow [ADR 0001](adr/0001-file-naming-conventions.md), which supersedes the kebab-case paths in that resolution and nothing else.

---

## Phase 4 — SSR auth wiring

**Tracked in** [#16 Phase 4 - Wire SSR auth](https://github.com/BIGboss248/supabase-nextjs-lab/issues/16).

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

> Closed in [#5](https://github.com/BIGboss248/supabase-nextjs-lab/issues/5) — **Decide the auth flow and the protected-route surface**: the session guard lives in `/account` and the proxy only refreshes; the matcher stays broad because Server Actions are POSTs to their own route; `AuthService` gains `confirmEmail`, an addendum on [#3](https://github.com/BIGboss248/supabase-nextjs-lab/issues/3).

---

## Phase 5 — Auth flows and the protected route

**Tracked in** [#17 Phase 5 - Build the auth flows and the protected route](https://github.com/BIGboss248/supabase-nextjs-lab/issues/17).

**Learn**
- Server Actions as the mutation surface: what they replace, and how they interact with forms and progressive enhancement.
- Email confirmation as a loop you can actually test locally (Mailpit), and why the `token_hash` template needs no `emailRedirectTo`.
- Error copy that does not leak account existence.

**Build**
- Sign-up, sign-in, sign-out — each a Server Action behind a form
- Confirmation via Mailpit, with `enable_confirmations` and `site_url` set in `config.toml`
- One protected route (`/account`) showing the session
- Header that reflects signed-in versus signed-out state

**Verify**
- Full loop: sign up → read the mail in Mailpit → click → `/account` renders, already signed in, because `verifyOtp` hands the Route Handler a session → sign out lands on `/` → sign in returns to `/account`.
- Clicking the same link twice lands on `/auth/error`.
- Wrong password produces the same message as unknown email.
- An unconfirmed account cannot sign in, and says why.

**Record** — lab note: the full loop as an ordered checklist, plus the redirect-URL misconfiguration and its silent failure mode.

> Closed in [#5](https://github.com/BIGboss248/supabase-nextjs-lab/issues/5) — **Decide the auth flow and the protected-route surface**: sign-up ends inline in a check-email state; confirmation runs through a `token_hash` Route Handler at `/auth/confirm`, which needs `enable_confirmations = true` in the local `config.toml` because local dev defaults it off, and needs no `emailRedirectTo` at all; failures return `{ error: AppErrorKind }` while success calls `redirect()`; a dead link lands on `/auth/error`; sign-out lives in the header and lands on `/`; `/account` shows the email and `sub`; a duplicate sign-up is indistinguishable from a new one and only logs `conflict`.

---

## Phase 6 — Listing, detail, and realtime

**Tracked in** [#18 Phase 6 - Build the listing, detail and realtime](https://github.com/BIGboss248/supabase-nextjs-lab/issues/18).

**Learn**
- RSC data fetching: the component awaits the port directly, and there is no client-side loading state for the initial render.
- How `supabase-js` interacts with Next's cache: it never opts in — no `cache` and no `next` field reaches `fetch` — and since Next 15 nothing opts in by default. Reads are uncached because no one asked, not because a cache is bypassed. A raw query cannot carry a tag; caching means wrapping the query in `use cache` + `cacheTag` (see `docs/research/nextjs-cache-supabase-js.md`).
- Why freshness here is an *accident*: with the `@supabase/ssr` cookie adapter, `cookies()` makes the route dynamic, so you get per-request data for free. A cookie-less client would freeze the page at build time — and you would never notice in `next dev`.
- Realtime authorisation: each subscriber's role is re-checked against RLS per changed row, and a row you cannot `SELECT` produces no event and no error. `SUBSCRIBED` only means the socket opened — it proves nothing about authorisation.
- The `UPDATE` rule: the policy must pass for both the old and the new row state, so unpublishing a row delivers nothing and leaves a stale card on screen.
- Channel lifecycle in React 19: return the cleanup synchronously (`removeChannel`) so Strict Mode's remount cannot race the join ack.

Sources: `docs/research/supabase-realtime-rls.md`.

**Build**
- `/` — listing: server-rendered 3-up card grid (prototype variant A, [#11](https://github.com/BIGboss248/supabase-nextjs-lab/issues/11)), Suspense boundary, empty state, sold-out and low-stock states, stock badge as a dot plus word in the card corner
- `/products/[slug]` — detail page, 404 on unknown slug
- Dark mode wired in the same pass: shadcn `ThemeProvider` composed into the app's providers, `class` on `<html>`, `defaultTheme="system"`, header toggle offering light / dark / system
- A client component that holds the rows the Server Component passed as props and subscribes to `UPDATE` on `products.stock`, merging `payload.new` by `id`; `payload.old` is never read, because under RLS it carries the primary key only
- A refetch through `router.refresh()` on every `SUBSCRIBED` and on `visibilitychange`, since the stream has no replay; the client's state adopts the new props through an effect, so the channel survives the refresh
- One shared Zod schema in the core layer parses the realtime patch — the one write into client state that bypasses the adapter
- A dev-only `sellOneUnit` Server Action behind a `NODE_ENV !== 'production'` guard, writing as the signed-in user through `sell_one_unit` — the function's `execute` grant is `authenticated` only ([#2](https://github.com/BIGboss248/supabase-nextjs-lab/issues/2) Lock the products schema and RLS posture) — with the button on each card rendered only when signed in

**Verify**
- Editing `stock` in Studio changes the open page within a second, with no reload.
- `sellOneUnit` updates the badge without a refresh.
- Navigating away and back does not accumulate duplicate subscriptions.
- Sleeping the tab and returning does not leave a stale list.
- The listing page is uncached: a Studio `INSERT` appears on reload without any revalidation step.
- Bird's-eye: a dropped event or a slept tab costs one refetch, never a wrong number that stays wrong; an inserted row appears on reload, not live.
- No realtime E2E exists — the merge is unit-tested and the socket is checked by hand, so that gap is named in the record rather than implied away.

**Record** — `SupaBase.md`: extend the Realtime section with RLS authorisation. Lab note: the fetch-cache bypass, with the "why is my list stale / why is it not cached" pair of symptoms.

> Closed in [#11](https://github.com/BIGboss248/supabase-nextjs-lab/issues/11) — **Prototype the product listing page**: variant A wins, a 3-up shelf grid whose six cards are the RLS ceiling rather than a taste call (eight seed rows minus two drafts); the stock badge is a dot plus word in the card corner, because that is what animates; `/products/[slug]` stays its own route; dark mode ships from the first component through `next-themes`, with the toggle in the header and `resolvedTheme` guarded while it is `undefined`.
>
> Closed in [#7](https://github.com/BIGboss248/supabase-nextjs-lab/issues/7) — **Decide the realtime demo surface and the dev write trigger**: `UPDATE` on `products.stock` only, so no `INSERT`/`DELETE` handling and no `replica identity full`; a Studio edit proves the database drives it, and an env-guarded, signed-in `sellOneUnit` writing as the user through `sell_one_unit` proves the UI reacts; the page stays a Server Component and hands the rows down, `router.refresh()` is the only refetch path, and the state follows the props through an effect so the channel survives; the merge is by `id` under one shared Zod schema, with refetch on `SUBSCRIBED` and `visibilitychange`; ordering is unguarded and inserts are not live, both accepted and self-healing.

---

## Phase 7 — Quality gates and CI/CD

**Tracked in** [#19 Phase 7 - Quality gates and CI/CD](https://github.com/BIGboss248/supabase-nextjs-lab/issues/19); [#12 Provision the hosted Supabase project and CI secrets](https://github.com/BIGboss248/supabase-nextjs-lab/issues/12) also blocks the deploy half.

**Learn**
- What each test layer buys you, and which layer earns its cost here. With a fake adapter, business logic is cheap to test; RLS and cookies are not.
- Local↔CI parity: what runs on save, pre-push, and in CI, and why they differ.
- `supabase db push` and drift: how a migration reaches a hosted project, and how deploy-on-merge can diverge from your local schema.
- Secrets management: which values are repository-level and which are environment-level.

Sources: `docs/research/supabase-cli-ci.md`.

**Build**
- Jest through `next/jest`: unit tests on the fake, the shared contract suite with its Supabase half behind `SUPABASE_CONTRACT=1`, and component tests for card, badge and empty state
- pgTAP files under `supabase/tests/` covering the RLS posture and `sell_one_unit`, run in their own rolled-back transactions
- A Playwright E2E covering signup → Mailpit → confirm → `/account`, sign-out, and the protected route
- `.github/workflows/ci.yml` — the PR quality gate: `typecheck`, `lint`, `build`, then `db start`, `db lint --fail-on error`, `db diff --strict-coverage`
- A full-stack job on a `full-stack` label and nightly, running contract-real, pgTAP and Playwright against one started stack
- `.github/workflows/deploy-db.yml` — migrations on `main`, triggered only by changes under `supabase/`
- A hosted project, linked, with secrets set

**Verify**
- A deliberately failing test fails the PR, and a red PR cannot merge.
- The pre-push hook catches a failing lint, typecheck or unit test before it reaches CI, and finishes fast enough that `--no-verify` never looks tempting.
- The `full-stack` job fails on a broken policy, a broken confirmation link, or a broken selector — each step independently, after one stack startup.
- Merging a migration to `main` pushes it to the hosted project, and re-running the job is a no-op rather than an error.
- Local schema and hosted schema agree: `supabase db diff --linked` is empty.

**Record** — lab note: the pipeline diagram in text, the pinned versions, the drift mistake, and the free-tier limits you actually hit.

> Open tickets: hosted provisioning (#12).
>
> Closed in [#9](https://github.com/BIGboss248/supabase-nextjs-lab/issues/9) — **Decide the test strategy and quality gates**: Jest via `next/jest`, one runner only; four thin layers (unit on the fake, contract against both adapters, component on presentational pieces, E2E on the auth loop); the Supabase half gated by `SUPABASE_CONTRACT=1` and reported as skipped; pgTAP for RLS and `sell_one_unit`, never on the PR path because it needs a full stack plus `pg_prove`; E2E reuses a local stack and, in CI, shares one experimental-path stack with the contract-real and pgTAP steps on a `full-stack` label and nightly; pre-push is lint plus typecheck plus unit plus contract, which overrides the vault's unit-and-E2E shape; retries twice with a trace on the first retry and no coverage threshold; the untested list is named rather than assumed.

---

## Setup feature inventory

Two setup skills expose independent feature menus: `setup-repository` (F-series, repository hygiene) and `nextjs-dev-setup` (N-series, framework and tests). Neither has run here — the repo holds no `docs/project.json`, no `.agents/setup-features.json`, and no `.agents/nextjs-setup-features.json`.

This table is **placement, not selection**. Which features run is decided in each skill's own Phase 1 interview, one selection file per skill, and both merge into the same `docs/project.json`. Acceptance checks live in the skills' runbooks and are not restated here.

### `setup-repository`

| Id | Feature | Lands in | Proposed |
|---|---|---|---|
| F1 | Project metadata — `docs/project.json` | Phase 1 | on |
| F2 | Project contract — `AGENTS.md`, `autofix.json`, standards | Phase 1 | on, merge only: `AGENTS.md` is hand-written here, so there is no machine block to overwrite |
| F3 | MCP servers and code intelligence | Phase 1 | your call — `AGENTS.md:89` and vault rule #61 both require a recommended set to be approved before anything is registered |
| F4 | Git hooks — Husky, commitlint | Phase 1 | on for commitlint; the pre-push hook belongs to Phase 7 |
| F5 | Production Docker | — | off — see Deliberate omissions: no app deploy |
| F6 | GitHub repository provisioning | Phase 1 | verify only — remote, issues and labels already exist, and `--license`/`--gitignore` can overwrite `README.md` |
| F7 | Issues and triage infrastructure | Phase 1 | merge — labels and `docs/agents/` already carry this; the issue templates are the missing half |
| F8 | Release Please | — | off — v1 ships no versioned artifact for a changelog to describe |
| F9 | Branch protection | Phase 7, after the first green run | off until `ci.yml` exists, then on — requiring a check that has never run blocks every push |
| F11 | Next.js internationalization | — | off — single locale is a deliberate omission |
| F12 | Planning workflow | Phase 1 | verify, not add — wayfinder and this plan are already the workflow; use the runbook as an audit |
| F13 | Code scanning — CodeQL, non-blocking | Phase 7 | on — public repo, TypeScript supported; a notify job, never a required check |

### `nextjs-dev-setup`

| Id | Feature | Lands in | Proposed |
|---|---|---|---|
| N1 | Project metadata — `docs/project.json` | Phase 1 | merge into the same file as F1, under `nextjs_setup_features` |
| N2 | Framework core and app shell | Phase 1 | on — `create-next-app` is already the plan's first build step |
| N3 | App icons and PWA manifest | — | skip — no deployed app means no install surface |
| N4 | Internationalization — `next-intl` | — | **off, despite the skill defaulting it on** — the plan rules i18n out; turning it on is a new decision, not a default |
| N5 | Jest unit testing | Phase 3 | on — Jest through `next/jest`, the only runner in the repo ([#9](https://github.com/BIGboss248/supabase-nextjs-lab/issues/9)) |
| N6 | Playwright E2E | Phase 7 | on — it carries the signup → confirm → sign in → `/account` loop, on a `full-stack` label and nightly rather than every PR ([#9](https://github.com/BIGboss248/supabase-nextjs-lab/issues/9)) |
| N7 | Storybook | Phase 6, if at all | off by default — the listing states are visible in the running app |
| N8 | Design-system lint | Phase 6 | on — the first real components land there |
| N13 | Theming and dark mode | Phase 6 | on — decided in [#11](https://github.com/BIGboss248/supabase-nextjs-lab/issues/11): shadcn `ThemeProvider` over `next-themes`, `class` strategy, system default, header toggle |
| N11 | Production Docker and reverse proxy | — | off — same reason as F5 |
| N12 | Git hooks and CI/CD | Phase 7 | on — overlaps F4; run one hooks pass, and let pre-push run lint, typecheck, unit and contract only — the E2E needs a full stack, so it lives on the `full-stack` label and nightly ([#9](https://github.com/BIGboss248/supabase-nextjs-lab/issues/9), which overrides vault rule #4 here) |

### What this surfaces

- **N4 and the omission disagree.** The skill defaults i18n on; the plan rules it out. Leaving it off is consistent; wanting it means amending the omission explicitly.
- **Ordering is a real constraint.** F9 may only name a check that already runs on `main`, and N12's pre-push must not point at a script that does not exist yet.
- **Two skills, one file.** Both write `docs/project.json`; F2 and F12 also append to `AGENTS.md`, so they run as merges against the existing hand-written contract.
- **Four features assume shipping.** F5, F8, N3 and N11 all exist to deploy an app that v1 deliberately does not deploy.
- **F3 cannot be unattended.** MCP registration needs your approval before it happens.

## Deliberate omissions

Not forgotten — ruled out. See the map's *Out of scope*; a decision to add any of these belongs in a new effort, not this plan.

Cart, checkout, payments, orders, order history · admin CRUD · app deployment · OAuth providers · Storage and uploads · i18n · multi-tenancy · Edge Functions · pgvector.

## Open questions

Tracked as fog in the map's *Not yet specified*: record-block granularity, the cache upgrade path, whether the detail page joins the stock channel, hosted↔local data parity, whether to enable the Supabase MCP server, and whether `stock` needs reservation semantics once two `sellOneUnit` calls can race.
