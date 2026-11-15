# Supabase CLI in GitHub Actions

Research for issue #8. Checked against primary sources on 2026-11-15. Anything not traceable to a
source below is marked **unverified**.

## Versions this document is written against

| Component | Version | How verified |
|---|---|---|
| Supabase CLI | `3.1.0` | `supabase/cli` latest GitHub release `v3.1.0` (2026-11-09); `npm view supabase version` → `3.1.0` |
| `supabase/setup-cli` action | `v3.2.0` (major tag `v3`) | latest release in `supabase/setup-cli` |
| `actions/checkout` | `v7.0.1` | latest release |
| `actions/setup-node` | `v7.1.0` | latest release |
| Node | `26` (Active LTS since 2026-10-28) | Node release schedule JSON |
| Docker on `ubuntu-latest` | client/server `28.0.4` | `actions/runner-images` Ubuntu 24.04 image README |

CLI v3 is a breaking line: `--local` and `--linked` still work but are **deprecated and removed in
v4**, replaced by the default target and `--remote`. Write new YAML with `--remote`.

## 1. Quality gate job

### Step order

1. `actions/checkout`
2. `actions/setup-node` with `cache: npm`
3. `npm ci`
4. `supabase/setup-cli@v3.2.0` with `version: 3.1.0`
5. `supabase db start` — Postgres only, applies every migration from `supabase/migrations` to a
   fresh database. This is the "migrations replay from zero" gate.
6. `supabase db lint --level warning --fail-on error`
7. `supabase db diff --strict-coverage`
8. `supabase test db` (pgTAP) — optional, see section 4
9. `supabase gen types --lang typescript` compared against the committed file — optional

### What needs a running stack

| Command | Needs Docker + local stack? | Needs `link` + access token? |
|---|---|---|
| `supabase link --project-ref` | No | Yes |
| `supabase db push --dry-run --remote` | No | Yes |
| `supabase db push --remote` | No | Yes |
| `supabase db lint` (default target) | Yes | No |
| `supabase db lint --remote` | No (but `link` first) | Yes |
| `supabase db diff` (default target) | Yes, plus a second shadow container | No |
| `supabase db diff --remote` | Docker yes (shadow container), local stack no | Yes |
| `supabase migration list --remote` | No | Yes |
| `supabase test db` | Yes | No |

`db diff` and `db pull` both spin up a **shadow Postgres container** to replay migrations, so they
need a Docker daemon even when the target is the hosted project. `db lint` runs `plpgsql_check`
against the target database, so it needs whatever database the target names.

### `--local` vs `--linked` vs `--remote`

- Default (no flag) = the local stack started by `supabase start` / `supabase db start`.
- `--linked` = the project recorded by `supabase link`, i.e. the hosted project. Requires
  `SUPABASE_ACCESS_TOKEN` and the database password.
- `--remote` = the v3 replacement for `--linked`. Also accepts `--remote=<ref>`,
  `--remote=<branch>` or `--remote=<postgres-url>`.
- `--local` = explicit form of the default; deprecated in v3.

For CI the distinction matters because the PR gate must not need production credentials. The local
target is free, hermetic and needs no secrets.

### Two traps in the documented CI example

- `supabase db lint` defaults to `--fail-on none`, which **always exits 0**. Without
  `--fail-on error` (or `--fail-on warning`) the lint step is decorative.
- `supabase db diff` is not a drift gate. It prints SQL to stdout and, with no changes, reports
  "No schema changes found" and exits 0. In CI the local database was just built from the same
  migrations, so the diff is empty by construction. `--strict-coverage` is the part that can
  actually fail: it turns pg-delta's "objects I cannot manage" warnings into a non-zero exit.
  Drift detection against a real remote is `supabase db diff --remote` on a schedule, not a PR job.

The official `managing-environments` CI example is exactly `db start` → `db diff --strict-coverage`
→ generated-types check.

## 2. Migrations deploy job

### What `supabase link` needs

- `SUPABASE_ACCESS_TOKEN` — a personal access token (`sbp_...`). Without it the CLI tries the local
  keyring, which does not exist on a runner.
- The project ref, either positional (`supabase link <ref>`) or `--project-ref <ref>`. Find it in
  the dashboard URL: `https://supabase.com/dashboard/project/<project-id>`.
- `SUPABASE_DB_PASSWORD` — if absent, `link` prompts
  `Enter your database password (or leave blank to skip)`, which hangs a non-interactive job.
  The `-p/--password` flag is the alternative but leaks the value into process listings.

The link state is written under `supabase/.temp/`, which is not committed, so every job must link.

### How `db push` behaves

- Clean remote: it calculates the pending set by comparing local filenames to
  `supabase_migrations.schema_migrations`, applies them in order, and inserts one row per applied
  migration. Re-running is a no-op (`Linked project is up to date.`). Pushing is therefore
  idempotent and safe to retry.
- Drifted remote, local behind: `Remote migration versions not found in local migrations
  directory.` — someone applied a migration whose file is not in this checkout.
- Drifted remote, local ahead by an out-of-order timestamp: `Found local migration files to be
  inserted before the last migration on remote database.` The CLI suggests
  `--include-all`, which applies out-of-order migrations. Do not reach for it in a deploy job: it
  hides the fact that two branches produced overlapping timestamps. Repair the history with
  `supabase migration repair --status reverted|applied --remote --yes` instead.
- `--include-all` is a repair tool for exactly the case where migrations exist on disk but their
  version predates the remote head.

### Prompting

Yes, `db push` prompts in v3. Before touching a hosted database it lists what it will do
(migrations, custom roles, seed files, vault secrets) and asks once, **defaulting to No**.

- `supabase db push --yes` suppresses it. `--yes` is the global flag.
- `SUPABASE_YES=1` exported in the **shell** also suppresses it. A `SUPABASE_YES` in
  `supabase/.env` does **not** — the CLI deliberately ignores it for hosted mutations.
- Piped stdin is never read, so `echo y | supabase db push` does not work.
- `--dry-run` prints the pending list without applying. Run it before the real push so the job log
  shows what changed even if the push later fails.

## 3. Secrets

| Name | Value | Level | Why |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `sbp_...` personal access token | repository | Same token for every environment; scope it to the projects it deploys |
| `SUPABASE_DB_PASSWORD` | project database password | **environment** (`production`, later `staging`) | Different per project; an environment secret cannot be read by a job that does not declare that environment |
| `SUPABASE_PROJECT_ID` | 20-character project ref | **environment**, or a repository *variable* | Not actually secret (it is in the dashboard URL), and it differs per environment |

Grant the token **Project Settings**, **API Keys** and **API Key Secrets**, all **Read**, because
the workflows run `supabase link`.

```bash
REPO=BIGboss248/supabase-nextjs-lab

# Repository-level: shared by every environment.
gh secret set SUPABASE_ACCESS_TOKEN --repo "$REPO"

# Environment-level: created on first use, or create the environment explicitly first.
gh api -X PUT "repos/$REPO/environments/production" >/dev/null
gh secret set SUPABASE_PROJECT_ID   --repo "$REPO" --env production --body "<project-ref>"
gh secret set SUPABASE_DB_PASSWORD  --repo "$REPO" --env production --body "<db-password>"

# Non-secret alternative for the ref, usable as ${{ vars.SUPABASE_PROJECT_ID }}:
gh variable set SUPABASE_PROJECT_ID --repo "$REPO" --body "<project-ref>"
```

`gh secret set NAME` with no `--body` opens an interactive prompt; `--body` is what makes it
non-interactive. **Unverified:** whether `gh secret set --env` implicitly creates a missing
environment on every `gh` version; the `gh api -X PUT .../environments/production` line above
removes the doubt.

## 4. `supabase start` in CI: what it actually costs

Facts:

- `supabase start` runs 13 services and the CLI recommends **at least 7 GB RAM** for all of them.
- `ubuntu-latest` is 4 vCPU / 16 GB for public repositories but **2 vCPU / 8 GB for private
  repositories**. On a private repo the full stack fits with almost no headroom.
- First start pulls roughly 2 GB of images. The `setup-cli` README states that caching them via
  the Actions cache is not worth it: restoring takes about as long as downloading.
- The CLI's experimental stack (`[experimental] stack = true`, or `SUPABASE_EXPERIMENTAL_STACK=1`)
  answers requests about **20 s** after `supabase start` on `ubuntu-latest`, versus about **85 s**
  for the default stack. It requires committing `supabase/supabase.lock`; with `CI` set,
  `supabase start` fails rather than updating an out-of-date lock.
- `supabase db start` starts **Postgres only** and replays migrations. For a schema gate that is
  the whole job: no Kong, GoTrue, Storage, Realtime, Studio or imgproxy.

A bare `postgres:17` service container is cheaper still — one small image, seconds to start, no
Docker-in-Docker orchestration. It is also less useful: Supabase migrations routinely reference
`auth.users`, `auth.uid()`, the `anon` / `authenticated` / `service_role` roles, and platform
extensions that a vanilla Postgres image does not have. **Judgment, not documented:** a service
container is only a valid substitute if your migrations are vanilla SQL and you never test RLS.

pgTAP (`supabase test db`) is viable but not free: it requires a started local stack and then runs
`pg_prove` in an additional container with `supabase/tests` mounted. Each test file runs in its own
transaction and is rolled back. Against a hosted target it prompts (default No) and needs `--yes`
because it creates and drops the `pgtap` extension.

**Recommendation.** Run `db start` (Postgres only) on every PR. Do not run `start` in CI. Add
`test db` only once `supabase/tests/` actually exists, and gate it behind a label or a nightly
schedule rather than every push. The full stack earns its minutes only when a test needs Auth,
Storage or PostgREST behaviour — i.e. an end-to-end test of the app against a real local Supabase,
not a schema check.

## 5. Drift: local change to committed migration

The imperative workflow, in order:

```bash
supabase start                              # 1. stack up
# 2. make the change in Studio (127.0.0.1:54323) or via SQL
supabase db diff -f add_due_date_to_todo    # 3. write supabase/migrations/<ts>_add_due_date_to_todo.sql
# 4. read the generated file: grants, revokes, DROP EXTENSION, formatting
supabase db reset                           # 5. prove the whole chain replays from zero
supabase gen types --lang typescript > database.types.ts   # 6. if types are used
git add supabase/migrations supabase/config.toml database.types.ts
```

`db diff` compares the **live local database** against a shadow database built from
`supabase/migrations`. That is why the change must exist in the live database when the diff runs,
and why `-f` matters: without it the SQL goes to stdout and nothing is written.

### The classic mistake that silently loses a migration

Running `supabase db reset` (or `supabase stop --no-backup`) **before** `supabase db diff -f`.
`db reset` recreates the database from the migrations on disk, which do not contain the change you
just made in Studio. The change is destroyed before it was ever captured, and nothing reports an
error. The same loss happens with a bare `supabase db diff` and no `-f`: the SQL is printed and
then discarded with the terminal buffer.

A second, quieter loss: Supabase's migration history stores **timestamps only**, not checksums.
Editing a migration that has already been applied remotely therefore changes nothing on the next
`db push` — the timestamp is already in `schema_migrations`, so the file is skipped. The remote
keeps the old schema and local/remote drift apart with no warning. Once a migration is pushed, its
content is frozen; make a new migration instead.

## 6. Branching: when `db push` runs, and how to stop two deploys racing

Run it on every merge to `main`. Migrations are additive and the push is a no-op when there is
nothing new, so the cost of an app-only merge is one link plus one push — tens of seconds, no
Docker. A release-tag trigger adds ceremony without adding safety while there is a single hosted
environment: the code and the schema it expects can then disagree between the merge and the tag.

If a staging project is added later, promote with an environment rather than a tag: staging on
`develop`, production on `main`, and `environment: production` with required reviewers on the
production job.

Racing is prevented with a concurrency group, **not** with `cancel-in-progress: true`:

```yaml
concurrency:
  group: supabase-migrations-production
  cancel-in-progress: false
```

With `cancel-in-progress: false`, a second run waits instead of killing a `db push` mid-transaction.
The default queue is `single`: only one run may be pending, and a newer queued run replaces it.
That is safe here because a push applies *all* migrations not yet in the remote history, so the
surviving run still deploys everything the cancelled one would have. `queue: max` keeps up to 100
pending runs in FIFO order if you need every merge to see its own deploy. **Unverified:** the exact
failure a race produces without a group; plausibly a duplicate-version insert or a second DDL apply.

## 7. Free-tier limits a learner will hit

- **This repository is public**, and standard GitHub-hosted runners are free and unlimited on
  public repositories. Build minutes are not the constraint here.
- If it ever goes private: GitHub Free includes **$12 of compute per month**, which is about
  **2,000 Linux 2-core minutes** at $0.006/min, plus 500 MB of artifact storage and 10 GB of cache.
  A `db start` PR job is a few minutes; several pushes a day will exhaust that in a busy month.
- **Concurrency:** 20 concurrent jobs on GitHub Free (40 Pro, 60 Team). A learning lab will not hit
  this; a matrix that fans out over Postgres versions might.
- **Supabase Free plan:** two projects, 500 MB database, and projects are **paused after roughly
  7 days of low activity**. A warning email arrives about a week before the pause; visiting the
  dashboard or making API calls resets the clock. A paused project makes `supabase db push` fail to
  connect, and it must be resumed manually from the dashboard. Paused projects do not count toward
  the two-project limit. A weekly ping keeps it awake, but do not build production habits on it.

## 8. Recommended YAML

Two files. Both pin the action to an exact release tag and the CLI to an exact version. For
stronger supply-chain guarantees, replace the action tags with full commit SHAs.

The CLI version **must equal** the `supabase` version in `package.json` devDependencies. The repo
runs the CLI through `npx supabase` locally; if CI installs a different CLI, local and CI generate
different diffs and lint results. `setup-cli@v3` reads a root lockfile and installs the declared
version when `version` is omitted, so either pin both or pin neither.

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: "26"
  SUPABASE_CLI_VERSION: "3.1.0"

jobs:
  app:
    name: App build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7.0.1

      - uses: actions/setup-node@v7.1.0
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm

      - run: npm ci

      - run: npm run typecheck --if-present
      - run: npm run lint --if-present

      - name: Build
        run: npm run build
        env:
          # Placeholders so the build has the variables defined. Replace with the
          # values from `supabase status -o env` if the build starts fetching.
          NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
          NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder-anon-key

  schema:
    name: Migrations, lint, diff
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7.0.1

      - uses: supabase/setup-cli@v3.2.0
        with:
          version: ${{ env.SUPABASE_CLI_VERSION }}

      # Postgres only, and replays every migration from zero. Fails on broken SQL
      # or an out-of-order migration that cannot be applied.
      - name: Apply all migrations to a fresh database
        run: supabase db start

      # --fail-on defaults to `none`, which always exits 0.
      - name: Lint plpgsql
        run: supabase db lint --level warning --fail-on error --schema public

      # Fails when pg-delta finds objects it cannot manage, instead of warning.
      - name: Check diff-engine coverage
        run: supabase db diff --strict-coverage --schema public

      # Opt-in once supabase/tests/ exists. Needs the stack plus a pg_prove container.
      # - name: pgTAP
      #   run: supabase test db

      # Optional: generated types must match the schema.
      # - name: Verify generated types are checked in
      #   run: |
      #     supabase gen types --lang typescript > database.types.ts
      #     if ! git diff --ignore-space-at-eol --exit-code --quiet database.types.ts; then
      #       echo "Generated types are out of date; run supabase gen types."
      #       git diff -- database.types.ts
      #       exit 1
      #     fi
```

### `.github/workflows/deploy.yml`

```yaml
name: Deploy migrations

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

# Serialize deploys. Never cancel-in-progress: a cancelled db push can leave a
# half-applied migration file.
concurrency:
  group: supabase-migrations-production
  cancel-in-progress: false

jobs:
  deploy:
    name: supabase db push
    runs-on: ubuntu-latest
    timeout-minutes: 15
    # Environment secrets live here; add required reviewers for a manual gate.
    environment: production
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
      SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v7.0.1

      - uses: supabase/setup-cli@v3.2.0
        with:
          version: "3.1.0"

      # No prompt: the database password comes from SUPABASE_DB_PASSWORD.
      - name: Link project
        run: supabase link --project-ref "$SUPABASE_PROJECT_ID"

      # Visible in the log even if the push itself fails.
      - name: Show pending migrations
        run: supabase db push --dry-run --remote

      # --yes is required: the confirmation defaults to No and piped input is ignored.
      - name: Push migrations
        run: supabase db push --remote --yes

      - name: Show resulting history
        run: supabase migration list --remote
```

## 9. Rationale

- **`db start`, not `start`.** The PR gate only needs Postgres and the migration replay. Skipping
  twelve services saves the 7 GB RAM requirement and roughly a minute and a half of startup, and it
  keeps the job inside an 8 GB private-repo runner.
- **`db lint --fail-on error`.** Without `--fail-on`, lint always exits 0 (source: CLI reference).
  `--level warning --fail-on error` reports warnings but only fails the build on errors; tighten to
  `--fail-on warning` once the schema is clean.
- **`db diff --strict-coverage`.** The only diff-based check that can fail honestly on a hermetic
  CI checkout. A "diff must be empty" assertion is vacuous there, because the database was built
  from the same migrations; drift against the hosted project needs credentials and belongs in a
  scheduled job.
- **No `--include-all` in deploy.** It papers over two branches producing overlapping timestamps.
  Fail loudly, fix the history with `migration repair`, keep ordering meaningful.
- **`--dry-run` before every push.** It costs one round trip and makes the deploy log self-explaining
  when a later step fails.
- **`environment: production`.** It scopes the database password to one job, gives an approval gate
  for free, and keeps the access token reusable at repository level.
- **`concurrency` with `cancel-in-progress: false`.** Deploys queue rather than race; a cancelled
  push is the one failure mode that can leave the remote half-migrated.
- **Exact action tags.** `v3` is a moving tag by design (`setup-cli` README); `v3.2.0` is a fixed
  release. Same reasoning for `checkout@v7.0.1` and `setup-node@v7.1.0`.
- **Two pins that must agree.** `setup-cli`'s `version` and the `supabase` devDependency. If they
  diverge, `npx supabase` locally and `supabase` in CI produce different diffs — the worst kind of
  "works on my machine".

## 10. Sources

1. Supabase CLI reference (all commands and flags, v3 semantics): <https://supabase.com/docs/reference/cli>
2. `supabase db push`: <https://supabase.com/docs/reference/cli/supabase-db-push>
3. `supabase db diff`: <https://supabase.com/docs/reference/cli/supabase-db-diff>
4. `supabase db lint`: <https://supabase.com/docs/reference/cli/supabase-db-lint>
5. `supabase test db` (pgTAP): <https://supabase.com/docs/reference/cli/supabase-test-db>
6. `supabase link`: <https://supabase.com/docs/reference/cli/supabase-link>
7. Local development workflow (`db diff -f`, reset-before-diff, `db pull`): <https://supabase.com/docs/guides/local-development/cli-workflows>
8. Managing environments (the official CI and release workflows, secret list, token scopes): <https://supabase.com/docs/guides/deployment/managing-environments>
9. `supabase/setup-cli` README (action v3, version resolution, `db start`, experimental stack benchmark, lockfile behaviour): <https://github.com/supabase/setup-cli>
10. Drift error strings: <https://github.com/supabase/cli/blob/develop/apps/cli/src/command-internal/migration-pending.ts>
11. GitHub Actions billing (public repos free, $12 included compute on Free, per-minute rates): <https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions>
12. GitHub Actions limits and concurrency table: <https://docs.github.com/en/actions/reference/limits>
13. Workflow concurrency semantics (`pending`, `queue: single|max`, `cancel-in-progress`): <https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency>
14. Runner hardware (public 4 vCPU/16 GB, private 2 vCPU/8 GB): <https://docs.github.com/en/actions/reference/runners/github-hosted-runners>
15. Docker on the Ubuntu 24.04 runner image: <https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md>
16. `gh secret set` (repo vs environment level, `--body`, `--env`): <https://cli.github.com/manual/gh_secret_set>
17. Supabase project pausing (7-day inactivity, warning email, 1-year restore window): <https://supabase.com/docs/guides/platform/project-pausing>
18. Supabase billing and plan quotas (two Free projects, 500 MB database): <https://supabase.com/docs/guides/platform/billing-on-supabase>
19. Node.js release schedule (v26 Active LTS from 2026-10-28): <https://github.com/nodejs/Release/blob/main/schedule.json>

## Addendum — verification pass (2026-11-15)

An independent audit re-checked the load-bearing claims. The four focus items all check out: `setup-cli@v3.2.0` is current, the CLI pin `3.1.0` is correct, `--remote` really does replace `--linked` in v3 (removed in v4), `db lint` exits 0 by default, and `db diff` spins up a shadow container. Corrections follow.

### Corrections

- **§1/§9 — "needs Docker" is too absolute.** The default stack uses Docker, but v3 supports `--runtime native` (experimental), and `setup-cli`'s own README uses `supabase start --runtime native`. Correct phrasing: the shadow database needs *a* Postgres, which on `ubuntu-latest` means Docker.
- **§8 contradicts §0.** The deploy YAML uses `supabase link --project-ref`, while §0 correctly notes `--project-ref` is deprecated toward v4. v3 documents the positional form — use `supabase link <ref>`.
- **§4 — container count.** The stack is Postgres plus the 13 excludable services, i.e. 14 containers, not 13. Cosmetic, but it is the number carrying the RAM argument.
- **§1 — `db start` versus `supabase test db`.** The pgTAP step is documented to require the stack started by `supabase start`. Enabling it under the current `db start` job is untested; either give it its own job with the full stack, or drop the step.

### Stated as fact but unverified

- "First start pulls roughly 2 GB of images" — no source found.
- "Link state is written under `supabase/.temp/`" — true of v2, unconfirmed for v3. The conclusion (every job must link) holds regardless.
- "A paused project makes `db push` fail to connect" — plausible, but the pausing docs describe pausing and resuming, not the CLI error.

### Materially missing

- **`db push` runs each migration file in a single transaction.** Large index or table DDL dies on lock or statement timeouts. The migrations guide points at `lock_timeout`; a learner hits this the first time a real table grows.
- **`--strict-coverage` is pg-delta only** and a silent no-op on the legacy `migra` engine. Since it is the only check in the PR job that can fail, confirm which engine the project uses.
- **`ubuntu-slim` cannot run this pipeline** — it is an unprivileged container with no Docker-in-Docker. This rules out the obvious cost optimisation.
- **`setup-cli@v3` installs from npm**, falling back to the GitHub release, so it needs npm registry egress; `version` must be explicit or it silently follows the root lockfile.
- **Fork PRs receive no secrets.** The gate as written is safe, but any future `db diff --remote` or `db push --dry-run` added to the PR job will fail or skip there.
- Worth citing explicitly: migration history compares **timestamps only** — "Only the timestamps are compared to identify any differences."

