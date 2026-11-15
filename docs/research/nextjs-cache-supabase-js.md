# Next.js caching and `supabase-js` queries

Ticket: [#13](https://github.com/BIGboss248/supabase-nextjs-lab/issues/13).

**Verdict: the plan's conclusion is right, its mechanism is wrong.** A `supabase-js` query does not "bypass" Next.js's cache — it never opts in, and since Next 15 nothing is cached without an opt-in. So "reads stay uncached" holds. But "uncached" is not the same as "fresh on every request": a Server Component that awaits a query with no request-time API in play is executed **once during `next build`** and served as static HTML from then on. That is the failure this ticket actually needs to warn about, and it is a build-time freeze, not a cache hit.

The rest of this document is the evidence, then the consequences for v1.

Verified 2026-11-15 against these versions. Nothing below is reconstructed from memory; every behavioural claim is either quoted from a page read in this session or read out of the published package source.

| Package | Version | Checked via |
|---|---|---|
| `next` | 16.4.6 (`latest`) | `npm view next version`, `npm view next dist-tags` |
| `@supabase/supabase-js` | 2.119.0 (published 2026-11-04) | `registry.npmjs.org/@supabase/supabase-js`, `src/SupabaseClient.ts`, `src/lib/fetch.ts` |
| `@supabase/postgrest-js` | 2.119.0 | `registry.npmjs.org/@supabase/postgrest-js`, `src/PostgrestBuilder.ts`, `src/fetchWithRetry.ts` |
| `@supabase/ssr` | 0.12.7 | `registry.npmjs.org/@supabase/ssr` (no `next` peer dependency) |

---

## 1. Mechanism: what `supabase-js` actually passes to `fetch`

Everything routes through `PostgrestBuilder.then()`. The request object is built literally:

```ts
// @supabase/postgrest-js@2.119.0, src/PostgrestBuilder.ts
const res = await fetchWithRetry(
  _fetch,
  this.url.toString(),
  {
    method: this.method,
    headers,
    body: JSON.stringify(this.body, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ),
    signal: this.signal,
  },
  this.retryEnabled
)
```

Source: <https://unpkg.com/@supabase/postgrest-js@2.119.0/src/PostgrestBuilder.ts>

And `fetchWithRetry` forwards exactly those four fields, nothing else:

```ts
// src/fetchWithRetry.ts
res = await fetchImpl(url, {
  method: request.method,
  headers,
  body: request.body,
  signal: request.signal,
})
```

Source: <https://unpkg.com/@supabase/postgrest-js@2.119.0/src/fetchWithRetry.ts>

The `RetryableRequest` interface in the same file enumerates the whole set: `method`, `headers` (a plain object), `body`, `signal`.

`supabase-js` wraps that fetch but does not enrich the init:

```ts
// @supabase/supabase-js@2.119.0, src/lib/fetch.ts
return async (input, init) => {
  const realToken = await getAccessToken()
  let headers = new HeadersConstructor(init?.headers)
  // ...apikey / Authorization / trace headers...
  return fetch(input, { ...init, headers })
}
```

Source: <https://unpkg.com/@supabase/supabase-js@2.119.0/src/lib/fetch.ts>

So the full option set handed to Next's patched `fetch` is `method`, `headers`, `body`, `signal`. There is **no** `cache`, **no** `next.revalidate`, **no** `next.tags`. Grepping the `PostgrestBuilder` constructor's option list confirms there is no cache-related knob anywhere in the builder: the accepted keys are `method`, `url`, `headers`, `schema`, `body`, `shouldThrowOnError`, `signal`, `fetch`, `isMaybeSingle`, `shouldStripNulls`, `urlLengthLimit`, `retry`.

**Conclusion:** the query reaches Next's `fetch` patch like any other fetch — it participates in the request's render context, deduplication and, if opted in, the Data Cache — but it arrives with zero caching instructions. The library is not evading the cache; it is silent.

This is deliberate on Supabase's side, and it is the correct default: a data-access library has no business deciding a framework's caching policy.

---

## 2. What Next does with a fetch that carries no cache option

Next 16's current `fetch` reference documents three values for `options.cache` and makes the default explicit:

> **`auto no cache`** (default): Next.js fetches the resource from the remote server on every request in development, but will fetch once during `next build` because the route will be statically prerendered. If Request-time APIs are detected on the route, Next.js will fetch the resource on every request.

Source: <https://nextjs.org/docs/app/api-reference/functions/fetch> (`lastUpdated: 2026-08-18`)

Read that carefully, because it is the whole ticket:

- In **development**, every request re-runs the query. You will never see the bug.
- In **`next build`**, the query runs once and the result is baked into the prerendered page.
- The exception is a route that uses a Request-time API (`cookies()`, `headers()`, `searchParams`).

The caching guide states the same rule from the other direction: "By default, `fetch` requests are not cached. You can cache individual requests by setting the `cache` option to `'force-cache'`." (<https://nextjs.org/docs/app/guides/caching-without-cache-components>, `lastUpdated: 2026-08-18`)

And the Data Cache genuinely is generic — it is not restricted to hand-written fetches, and it does not care which library called `fetch`. Its key is documented as URL, method, headers and body ("A request matches on its URL, method, headers, and body, so requests that differ in any of these are cached separately"), and the docs explicitly note that with `cache: 'force-cache'` it will cache "any request, including `POST` and requests that send `authorization` or `cookie` headers."

That last sentence matters twice. It means a `supabase-js` request **would** be cacheable if something opted it in — and that the auth identity travels in headers, so it would land inside the cache key. See §4.

---

## 3. Defaults across 14 → 15 → 16

| Next | Default for a `fetch` with no `cache` option | What changed |
|---|---|---|
| 13, 14 | Cached, implicitly (`force-cache`) | Every fetch in the App Router was cached unless told otherwise |
| 15 | **Not cached** | Upgrade guide: "`fetch` requests are no longer cached by default. To opt specific `fetch` requests into caching, you can pass the `cache: 'force-cache'` option." |
| 16 | Not cached (`auto no cache`) | Fetch default unchanged; the caching *model* changed around it (Cache Components), and `create-next-app` now turns that model on |

Source for the 15 break: <https://nextjs.org/docs/app/guides/upgrading/version-15> (`lastUpdated: 2026-10-15`). The 13/14 cell is read off that guide's wording ("no longer cached by default"); I did not open the 14 docs to confirm it independently.

Next 16 does not reverse that. It goes further, in the release post:

> Unlike the implicit caching found in previous versions of the App Router, caching with Cache Components is entirely opt-in. All dynamic code in any page, layout, or API route is executed at request time by default

Source: <https://nextjs.org/blog/next-16>

And the migration guide, on fetches specifically:

> With Cache Components, fetches are uncached unless they run inside a `use cache` scope.

Source: <https://nextjs.org/docs/app/guides/migrating-to-cache-components> (`lastUpdated: 2026-10-15`)

### What `use cache` / `cacheLife` / `cacheTag` require

All three are gated on one config flag:

```ts
// next.config.ts
const nextConfig: NextConfig = { cacheComponents: true }
```

- `cacheComponents` is a **stable top-level** option in 16 (it was `experimental.cacheComponents`, and it absorbed `dynamicIO` and `ppr`). Source: <https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents>.
- `use cache` requires the flag and requires the function to be `async`. It can sit at file, function or component level. Source: <https://nextjs.org/docs/app/api-reference/directives/use-cache>.
- `cacheLife` only works inside a cache-directive scope, and it is a *recommendation*, not a requirement: omit it and the `default` profile applies — `stale` 5 min, `revalidate` 15 min, `expire` never. Source: <https://nextjs.org/docs/app/api-reference/functions/cacheLife>.
- `cacheTag` also requires the flag plus a `'use cache'` scope. Source: <https://nextjs.org/docs/app/api-reference/functions/cacheTag>.
- Enabling `cacheComponents` **errors** on any route still exporting `dynamic`, `revalidate`, or `fetchCache`, and turns PPR on as the default rendering model. Source: migrating guide, above.

### The part the plan does not currently account for

`create-next-app` turns Cache Components on by default for App Router projects. The CLI reference lists:

> `--cache-components` Initialize with Cache Components enabled (default for App Router)

and the "recommended defaults" prompt in the docs includes "App Router, Cache Components, AGENTS.md". Source: <https://nextjs.org/docs/app/api-reference/cli/create-next-app>.

Phase 1 of `docs/PLAN.md` runs `npx create-next-app@latest`. So this repo will be built with `cacheComponents: true` unless someone opts out. That does not change "reads are uncached", but it changes *how the framework reacts* to an uncached read — see §6.

---

## 4. Can a `supabase-js` query carry a cache tag?

**No.** Not at the call site. A tag on a fetch lives in `next: { tags: [...] }`, and per §1 the library never sets `next`. There is no `.cache()`, `.tag()` or equivalent on the builder, and no cache-specific client option. This part of the plan's claim is correct and verifiable: `supabase.from(...).select()` cannot be tagged. The only injection point is the generic `global.fetch` override in §4.4, which is a workaround, not a feature.

Four ways out, in the order I would actually reach for them.

### 4.1 `use cache` + `cacheTag` around the adapter method (recommended)

```ts
async function listProducts() {
  'use cache'
  cacheLife('hours')
  cacheTag('products')
  return catalog.listPublished()   // calls supabase-js inside
}
```

This is the option the docs steer you toward, and the only one that keeps `supabase-js` (so: the typed client, the retry policy, RLS as configured). Requirements and traps, all documented:

- Needs `cacheComponents: true`.
- Cached functions **cannot** read `cookies()`, `headers()` or `searchParams`, and the restriction follows the call stack: "a helper the cached function calls that reads one of these fails the same way, with the `next-request-in-use-cache` error." That is fatal if you cache a function whose body constructs a `@supabase/ssr` server client, because that client's cookie adapter calls `await cookies()`. Source: <https://nextjs.org/docs/app/api-reference/directives/use-cache>.
- Consequence: the function may not know who the caller is. Identity must be extracted **outside** and passed as an argument, which puts it in the cache key. The docs give this as the preferred pattern.
- `use cache` entries are in-memory by default and scoped to one deployment — "a new deploy starts fresh... `use cache` entries don't carry over". For a local-first lab that is irrelevant; for the hosted phase it is a decision.

### 4.2 `unstable_cache`

```ts
const listPublished = unstable_cache(
  async () => catalog.listPublished(),
  ['products'],
  { tags: ['products'], revalidate: 3600 }
)
```

Works today, and keeps working under Cache Components — the migration guide's section on `unstable_cache` reads "**No change required.** `unstable_cache` continues to work with Cache Components." Its differentiator is persistence: like the `fetch` Data Cache, "`unstable_cache` persists cached values across deployments and serverless instances, while `use cache` does not."

Same identity constraint as 4.1: "The function passed to `unstable_cache` cannot depend on the incoming request. Read values from `cookies()` or `headers()` before calling the cached function." Source: <https://nextjs.org/docs/app/api-reference/functions/unstable_cache>.

### 4.3 Hand-rolled `fetch` to the REST endpoint

```ts
await fetch(`${url}/rest/v1/products?select=*&published=eq.true`, {
  headers: { apikey, Authorization: `Bearer ${token}` },
  next: { tags: ['products'] },
})
```

Tagging works because you control the init. What you give up is everything `supabase-js` was doing for you: the typed select parser, `.eq()` composition, the retry-on-503/520 policy, the `maybeSingle` PGRST116 handling, and the `Result`-shaped error mapping. For this repo it also breaks the ports-and-adapters rule at a second seam — the adapter would now speak PostgREST URLs, not just Supabase types. Not worth it.

### 4.4 Custom `fetch` injected via `global.fetch`

`createClient` accepts `global.fetch`, and `fetchWithAuth` calls it as `fetch(input, { ...init, headers })`, so a wrapper **can** add `next: { tags }` or `cache: 'force-cache'` to every PostgREST request:

```ts
createClient(url, key, {
  global: { fetch: (input, init) => fetch(input, { ...init, cache: 'force-cache', next: { tags: ['products'] } }) },
})
```

Source for the `global.fetch` option: <https://unpkg.com/@supabase/supabase-js@2.119.0/src/SupabaseClient.ts> (JSDoc: "`global.fetch` — A custom fetch implementation"); source for the pass-through: `src/lib/fetch.ts`, above.

Cheapest in lines of code, worst in surprise: the tag is per-client rather than per-query, so you need one client per tag, and it silently applies to auth calls made through the same client. I include it because it is what people rediscover and then present as a new finding. Not recommended for a learning repo whose point is legibility.

---

## 5. What invalidates a cached read

Only these, and only if the entry was tagged or given a lifetime in the first place:

| Trigger | API | Notes |
|---|---|---|
| Tag, stale-while-revalidate | `revalidateTag(tag, 'max')` | **The profile argument is required in 16.** The single-argument form is deprecated. Works in Server Actions and Route Handlers. Marks stale; the *next request* triggers the refetch, so pages revalidate as they are visited, not all at once |
| Tag, read-your-writes | `updateTag(tag)` | Server Actions only; expires immediately so the next read blocks for fresh data |
| Path | `revalidatePath('/')` | Path granularity, unchanged in 16 |
| Time | `cacheLife(profile)` / `unstable_cache({ revalidate })` | Server-side regeneration after the profile's `revalidate` window |
| Nothing | — | An entry with no tag cannot be invalidated on demand. It revalidates on its profile's schedule (the `default` profile's 15 minutes if you set none) and is discarded by the next deploy, because the cache key includes the build id |

Sources: <https://nextjs.org/docs/app/api-reference/functions/revalidateTag> (`lastUpdated: 2026-08-25`), <https://nextjs.org/docs/app/api-reference/functions/cacheTag>, <https://nextjs.org/blog/next-16>.

Two things that are **not** invalidation, and both are relevant here:

- **Realtime does not touch Next's cache.** A `postgres_changes` event arrives over a WebSocket in a client component. It updates React state. There is no path from Realtime to `revalidateTag`, and no documented integration that creates one. A cached RSC payload stays stale on the next navigation regardless of how many realtime events fired.
- **A database write does not invalidate anything by itself.** If rows change out of band — Studio, `seed.sql`, a second client — nothing calls `revalidateTag`. You need a trigger (a Supabase Database Webhook to a Route Handler), a short `cacheLife`, or you accept staleness.

One more limit worth knowing before designing around it: `cacheLife('seconds')` — the "real-time data" preset — has an `expire` of 1 minute, which is under the 5-minute prerender threshold, so it is "excluded from prerenders, becoming a 'dynamic hole' resolved at request time." The shortest profile does not give you a fast cache; it gives you no prerender.

---

## 6. RSC reality: what actually happens today

The answer depends on one thing — **whether the route touches a Request-time API** — and that is decided by your client factory, not by `supabase-js`.

### Case A: `@supabase/ssr` server client (the repo's plan)

`createServerClient` gets a cookie adapter, and the adapter does `await cookies()` (or the framework equivalent) inside `getAll`. `cookies()` is a Request-time API, so the route is dynamic and the query runs per request.

Supabase says this outright, in the "Creating a Supabase client for SSR" page:

> On the server, it basically configures a `fetch` call. You need to reconfigure the fetch call anew for every request to your server, because you need the cookies from the request.

Source: <https://supabase.com/docs/guides/auth/server-side/creating-a-client>

The same page's Next.js snippet — the documented way to read a table in a Server Component — wraps the query in `<Suspense>` and adds no caching (abridged: the `error` branch elided):

```tsx
async function InstrumentsData() {
  const supabase = await createClient()
  const { data: instruments, error } = await supabase.from('instruments').select()
  // ...
}

export default function Instruments() {
  return (
    <Suspense fallback={<div>Loading instruments...</div>}>
      <InstrumentsData />
    </Suspense>
  )
}
```

Source: <https://supabase.com/docs/guides/getting-started/quickstarts/nextjs>

So: with the cookie-based server client, "reads stay uncached" is true **and** you get fresh data every request. But note *why*. The freshness is an accident of the cookie adapter, not a property of the query. Nothing in `supabase-js` guarantees it.

### Case B: plain `createClient`, anon key, no cookie adapter

No `cookies()`, no `headers()`, no `searchParams` — so nothing marks the route dynamic.

- **On Next 15 and earlier (no Cache Components):** the page is prerendered at build, the select executes once, and the result is frozen until the next rebuild. There is no warning. `next dev` re-runs it every time, so the bug is invisible until `next start`.
- **On Next 16 with `cacheComponents: true`** (the `create-next-app` default): this is caught. An uncached async read outside `<Suspense>` surfaces a **blocking-route** validation insight in the dev overlay and dev-server log, with the fix "wrap in or move into Suspense". Per the migration guide, "Uncached data and Request-time APIs already run at request time" — the framework is telling you it is not going to bake it in silently.

This is the case the plan's word "bypasses" papers over. Nothing is bypassed; the read is simply unmarked, and an unmarked read used to mean "runs once, at build".

### Memoization, for completeness

`fetch` GETs with the same URL and options are deduplicated within a single render pass, and memoization "does not apply in Route Handlers, since they are not part of the React component tree". Since `supabase-js` issues ordinary GETs, two identical `.select()` calls in one render should collapse into one HTTP request. That follows from the patched-`fetch` model, but I did not run it — see §9.

---

## 7. Recommendation for this repo

**Keep "no cache layer in v1". Change the reason.**

The current reason ("supabase-js bypasses Next's cache") is not what the sources say, and a lesson built on it will teach something false. The defensible reasons are better ones:

1. **A cache fights the phase's own demo.** Phase 6's verify step is "editing `stock` in Studio changes the open page within a second". Realtime updates the client; it cannot invalidate a server cache. The moment the listing is cached, the page a user navigates *back* to can disagree with the page realtime just fixed — and the fix requires a revalidation path that does not exist for Studio edits. Teaching both at once muddles both.
2. **There is nothing to cache.** A local Supabase on `localhost:54321` answers in single-digit milliseconds. Caching it in v1 would be a lesson in a mechanism, demonstrated on a workload that does not need it.
3. **The correct configuration needs an identity decision the repo has not made.** Global-anonymous cache and per-user cache are different designs, and the second one requires passing identity into a cache scope that is documented to reject `cookies()`. That is a decision for a ticket, not a phase.

### What would have to change to add caching later

In dependency order, because each step constrains the next:

1. **Decide the cache subject.** Anonymous-only listing (shareable across all visitors) versus per-user rows (`/account`, future orders). Only the first is cheap.
2. **Move the cache boundary into the adapter,** not the component. `ProductCatalog.listPublished()` gets `'use cache'`, `cacheLife(...)`, `cacheTag('products')`. Pages and components stay ignorant, which is what the ports rule buys you here.
3. **Stop letting the cached function build a server client.** If the cached body calls `createServerClient`, the cookie adapter reads `cookies()` inside the cache scope and errors with `next-request-in-use-cache`. Either use a client with no cookie adapter (service-role or anon, deliberately) or extract the value outside and pass it in. This is the single sharpest constraint in the whole design and it is why "just add `use cache`" is not a one-line change.
4. **Build an invalidation source.** In this repo, writes come from three places and none of them call Next: Studio, `seed.sql`, and the dev-only `sellOneUnit` action. `sellOneUnit` can call `updateTag('products')` directly. Studio and seed cannot — that needs a Supabase Database Webhook (a `pg_net`-backed trigger; locally it must target `host.docker.internal`, not `localhost`) pointing at a Route Handler that calls `revalidateTag('products', 'max')`. Source: <https://supabase.com/docs/guides/database/webhooks>.
5. **Pick the lifetime honestly.** `cacheLife('hours')` matches a product catalog and is what the docs use for `/products/[id]`. `cacheLife('seconds')` will not give the page a prerender at all, so it is not a shortcut to "cached but always fresh".
6. **Re-state the realtime contract.** Realtime reconciles the client. The cache is a separate layer. Either the demo accepts a stale-on-navigation window bounded by `revalidate`, or the page is not cached. There is no third option in the documented API surface.

None of that is v1 work. The point of writing it down is that the door stays open and the cost is visible.

---

## 8. The plan sentence, rewritten

Current (`docs/PLAN.md`, locked decisions):

> No cache layer in v1 — Reads stay uncached; whether supabase-js participates in Next's cache at all is under verification (issue #13)

Suggested replacement, now that it is verified:

> **No cache layer in v1** — `supabase-js` passes no `cache` or `next` options to `fetch`, and Next caches nothing by default since 15, so queries are never cached *implicitly*. Freshness comes from the request-time API in the `@supabase/ssr` cookie adapter, not from the query. Caching means wrapping the adapter method in `use cache` + `cacheTag` and building an invalidation path; deferred until realtime is understood.

`docs/PLAN.md` is not edited by this ticket; that wording is a proposal for whoever owns the plan.

Phase 6's "Record" line ("the fetch-cache bypass") should instead name the pair of symptoms that actually occur: *a query with no request-time API is frozen at build time*, and *a query that opts in is stale until something revalidates it*.

---

## 9. Not verified

Stated rather than guessed:

- **Whether Next's patched `fetch` is used when a `supabase-js` client is constructed at module scope** rather than per request. Next patches `globalThis.fetch`, and `PostgrestBuilder` captures `this.fetch = fetch` at construction time, so a module-scope client captures the function identity — which should still be the patched one, since the patch is installed once for the runtime. I did not build a project to confirm the request context resolves correctly in that case. Supabase's guidance (new client per request) sidesteps it either way. Unverified.
- **Per-render-pass memoization of identical `supabase-js` GETs** (§6). Documented for `fetch` in the App Router; not exercised against a real `postgrest-js` call. Unverified.
- **Whether `cacheLife('seconds')` produces a usable cache for a realtime-adjacent page in practice.** The prerender exclusion is documented; the operational feel is not. Unverified.
- **Supabase's own position on Next.js Data Cache.** The "Caching considerations" section of the SSR guide addresses HTTP/CDN caching of `Set-Cookie` responses and ISR — a different mechanism from the Data Cache. I found no Supabase page that discusses `use cache`. Absence of evidence, not a claim.
- **Runtime behaviour of a custom `global.fetch` wrapper adding `next: { tags }`** (§4.4). Source-verified that the init is passed through (`fetch(input, { ...init, headers })`) and type-verified that `Fetch = typeof fetch`, but not exercised.

---

## 10. Primary sources

Next.js (`lastUpdated` as published on the page):

- <https://nextjs.org/docs/app/api-reference/functions/fetch> (2026-08-18) — `auto no cache` default, tags, memoization
- <https://nextjs.org/docs/app/guides/caching-without-cache-components> (2026-08-18) — previous model, `unstable_cache`, route segment config
- <https://nextjs.org/docs/app/getting-started/caching> (2026-10-06) — Cache Components, static shell, streaming uncached data
- <https://nextjs.org/docs/app/api-reference/directives/use-cache> (2026-11-06) — cache keys, `cookies()` prohibition, runtime storage
- <https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents> (2026-10-15)
- <https://nextjs.org/docs/app/api-reference/functions/cacheLife> (2026-09-29) — profiles, prerender thresholds
- <https://nextjs.org/docs/app/api-reference/functions/cacheTag> (2026-09-29)
- <https://nextjs.org/docs/app/api-reference/functions/revalidateTag> (2026-08-25) — required profile argument
- <https://nextjs.org/docs/app/api-reference/functions/unstable_cache> (2026-11-06) — cross-deploy persistence
- <https://nextjs.org/docs/app/api-reference/functions/connection> (2026-11-06)
- <https://nextjs.org/docs/app/guides/migrating-to-cache-components> (2026-10-15) — `unstable_cache` still supported, fetches uncached outside `use cache`
- <https://nextjs.org/docs/app/guides/upgrading/version-15> (2026-10-15) — the `fetch` default break
- <https://nextjs.org/docs/app/api-reference/cli/create-next-app> (2026-09-29) — `--cache-components` default
- <https://nextjs.org/blog/next-16> (2025-10-21) — "caching with Cache Components is entirely opt-in"

Supabase:

- <https://supabase.com/docs/guides/auth/server-side/creating-a-client> — "it basically configures a `fetch` call"; new client per request; caching considerations
- <https://supabase.com/docs/guides/getting-started/quickstarts/nextjs> — the `<Suspense>`-wrapped Server Component read
- <https://supabase.com/docs/guides/database/webhooks> — out-of-band invalidation trigger, `host.docker.internal` locally

Package source (`unpkg`, pinned to 2.119.0):

- <https://unpkg.com/@supabase/postgrest-js@2.119.0/src/PostgrestBuilder.ts>
- <https://unpkg.com/@supabase/postgrest-js@2.119.0/src/fetchWithRetry.ts>
- <https://unpkg.com/@supabase/postgrest-js@2.119.0/src/types/common/common.ts>
- <https://unpkg.com/@supabase/supabase-js@2.119.0/src/SupabaseClient.ts>
- <https://unpkg.com/@supabase/supabase-js@2.119.0/src/lib/fetch.ts>
