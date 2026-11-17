# supabase-nextjs-lab — agent instructions

A learning lab: Supabase × Next.js 16, expressed as a minimal e-commerce storefront. The product is **understanding**, not the store. v1 covers auth and product listing only.

## Start here

| Artifact | Where |
|---|---|
| The plan | [`docs/PLAN.md`](docs/PLAN.md) — living destination artifact, seven phases with Learn / Build / Verify / Record blocks |
| The map | [issue #1](https://github.com/BIGboss248/supabase-nextjs-lab/issues/1) — every decision taken, and the fog ahead |
| Research | [`docs/research/`](docs/research/) — primary-source findings, one file per ticket |

Read `docs/PLAN.md`, the map, and [`.agents/autofix.json`](.agents/autofix.json) before proposing work. The plan is the state of the build; do not infer progress from the presence or absence of files. The ruleset is the set of corrections already paid for; see *Self-repair*.

**Cite the subject, not just the number.** Every reference to a GitHub issue carries its title alongside its number — `#10 Resolve the component naming convention conflict`, never `#10` alone. Applies to chat, comments, commits, notes, and PR bodies.

## Agent skills

### Self-repair

Durable corrections for this repo live in [`.agents/autofix.json`](.agents/autofix.json). Load that file through the `self-repair` skill at the start of every session, before planning or editing, and treat the entries that touch the task as hard constraints rather than suggestions.

- **Scope.** Repo rules govern this repo and layer on the vault ruleset at `D:\Scripts\Obsidian\.agents\autofix.json`. Where the two conflict, the repo rule wins, and the override names the vault rule number it supersedes — the env-file decision under *Toolchain facts* is the live example.
- **Precedence.** Within a ruleset the higher `Rule_number` wins. A rule that contradicts the current codebase is a finding: surface it, do not obey it silently.
- **When to add.** The user corrects the output or rejects a pattern; the user states a preference or says "remember this"; a bug traces back to a wrong assumption. Not a one-off task instruction, and not a rule about recording rules.
- **How.** Append one imperative sentence — "Never/Always X — because Y" — with a `Category` and a short `Why`, plus the `Issue` when a ticket produced it. Keep the file valid JSON at two-space indent, merge overlaps, renumber `1..N`, and name the new rule number in the reply.
- **Prefer a check.** If the constraint is mechanical (banned import, file location, command shape), propose a lint rule, hook, or CI job instead of another prose rule.

### Issue tracker

Issues live as GitHub issues in `BIGboss248/supabase-nextjs-lab`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical defaults, unchanged: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root, created lazily on first use. See `docs/agents/domain.md`.

## How work is chosen

This repo uses **wayfinder**. The map is an index of decisions, not a task list.

- **Tickets are sub-issues of the map.** A ticket resolves *one decision*. Its type lives in its `wayfinder:<type>` label — `research`, `prototype`, `grilling`, or `task` — never in its body.
- **The frontier** is the open, unblocked, unassigned children. Native GitHub dependencies express blocking; do not restate blocking in prose.
- **Claim before working**: assign the ticket to yourself first, so concurrent sessions skip it.
- **One HITL ticket per session.** Research tickets are exempt and can run in parallel.
- **Resolving** means: post the answer as a comment, close the issue, then append one line to the map's *Decisions so far*. Assets are linked, never pasted.
- **Grilling and prototype tickets are human-in-the-loop.** Never answer the human's side of a grilling ticket yourself, and never record a decision a human did not make.
- **Planning, not building.** Absent an explicit instruction to implement, produce decisions. The pull to just write the code is the signal the map is finished and it is time to hand off.

## Locked decisions

Full list and rationale: the map's *Foundations* table. The ones that shape code:

1. **Local-first.** `supabase init` + `supabase start`; the CLI runs through `npx supabase` as a devDependency. A hosted project exists only for the CI/CD phase.
2. **Hand-wired, not templated.** `create-next-app@latest` on Next 16, wiring `@supabase/ssr` by hand. The `with-supabase` template is reference reading.
3. **Ports and adapters.** All data access goes through `ProductCatalog` and `AuthService`. No component, page, or Server Action touches a Supabase client directly. Failures are values: `Result<T>`, never thrown `PostgrestError`.
4. **No cache layer in v1.** `supabase-js` never opts into Next's cache and Cache Components make caching opt-in, so reads are uncached by default rather than "bypassing" anything. Do not add caching to "fix" apparent staleness.
5. **Server Actions are the only mutation surface**, and in v1 that means auth plus the dev-only `sellOneUnit` action.
6. **Products enter through `seed.sql` and Studio.** There is no admin UI and adding one is out of scope.

## Toolchain facts

- **Next 16.4.6.** `middleware.ts` is now `proxy.ts` and the `runtime` config is gone. Tutorials predating Next 16 will get this wrong.
- **Node 26.8.1, npm 11.19.0, Docker 29.7.2.** `supabase start` needs Docker running.
- **Local ports:** API `54321`, Postgres `54322`, Studio `54323`, Mailpit `54324`.
- **Env files:** `.env.local` plus `.env.example` (Supabase/Next convention). This overrides vault rule #39 for this repo — deliberate, recorded in the map.
- **The CLI ignores your env files.** `supabase start` is driven by `supabase/config.toml`; `.env.local` only feeds the Next app, and Edge Functions read `supabase/functions/.env`.

## Knowledge capture (Obsidian)

Findings belong in the vault at `D:\Scripts\Obsidian`. On any notable change, update it **in the same turn** — not batched for later.

**Two targets, different jobs:**

- `Computer/Backend/SupaBase.md` — the canonical concept reference. Supabase-wide facts, written to outlive this repo.
- `Computer/Backend/Supabase Next.js Lab.md` — this project's log. Gotchas, root causes, version traps, decisions taken here and why.

**"Notable" means at least one of:**

- a concept you did not understand before this session and now do
- a root cause behind a bug, not merely its fix
- a configuration decision with a consequence, and what the alternative cost
- a version or API fact that contradicts an existing note, or that older tutorials get wrong

**Not notable:** routine edits, formatting, dependency bumps, or anything already written down.

**How to write it:**

- Append. Do not rewrite existing prose. If a fact is now wrong, correct that line and say what changed rather than deleting the section.
- Terse — one bullet or two sentences per finding. Do not restate the docs.
- Frontmatter on the lab note: `Parent: "[[SupaBase]]"`, tags, and `Source:` links to the primary docs actually read.
- Link with wikilinks, e.g. `[[SupaBase#Row Level Security (RLS)|RLS]]`.
- Never `git commit` or `git push` in either repo unless asked. Staging is fine.

## Standing constraints

- **Never `git commit` or `git push`** unless explicitly asked. Do not create branches or tags unprompted.
- **Do not register MCP servers** without asking, and present a recommended set first.
- **Keep the workspace clean.** No dummy or sample test files; sample code goes in docs as snippets.
- **Conventions in flux.** Component file naming is an open ticket (#10). Do not settle it by writing the first component.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
