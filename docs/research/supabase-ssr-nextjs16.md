# Hand-wiring `@supabase/ssr` on Next.js 16 (App Router)

Ticket: [#4](https://github.com/BIGboss248/supabase-nextjs-lab/issues/4).

Verified 2026-11-15 against these exact versions and pages. Every snippet below is copied from the source named directly above it; nothing is reconstructed from memory.

| Package | Version | Checked via |
|---|---|---|
| `next` | 16.4.6 (`latest`) | `npm view next version`, `npm view next dist-tags` |
| `@supabase/ssr` | 0.12.7 (published 2026-09-08) | `npm view @supabase/ssr version`, `npm view @supabase/ssr time.modified` |
| `@supabase/supabase-js` | 2.119.0 (published 2026-11-04) | `npm view @supabase/supabase-js version` |

Primary documents read:

- <https://supabase.com/docs/guides/auth/server-side/creating-a-client> (the older `/server-side/nextjs` URL now serves this same page; page title "Creating a Supabase client for SSR")
- <https://github.com/supabase/supabase/tree/master/examples/auth/nextjs> — the Next.js files the docs embed via `$CodeSample`
- <https://github.com/supabase/ssr/blob/main/src/createServerClient.ts>, `types.ts`, `createBrowserClient.ts`, `CHANGELOG.md`
- <https://nextjs.org/docs/app/api-reference/file-conventions/proxy> (`lastUpdated: 2026-11-06`)
- <https://nextjs.org/docs/app/guides/upgrading/version-16>
- <https://nextjs.org/docs/app/api-reference/functions/cookies> (`lastUpdated: 2026-11-06`)
- <https://supabase.com/docs/reference/javascript/auth-getclaims>
- <https://supabase.com/docs/guides/getting-started/api-keys>

---

## 1. Client factories and the cookie adapter

### 1.1 `createBrowserClient` signature (0.12.7)

From `src/createBrowserClient.ts`. The live overload, verbatim:

```ts
export function createBrowserClient<
  Database = any,
  SchemaName extends string & keyof Omit<Database, "__InternalSupabase"> =
    "public" extends keyof Omit<Database, "__InternalSupabase">
      ? "public"
      : string & keyof Omit<Database, "__InternalSupabase">,
>(
  supabaseUrl: string,
  supabaseKey: string,
  options?: SupabaseClientOptions<SchemaName> & {
    cookies?: CookieMethodsBrowser;
    cookieOptions?: CookieOptionsWithName;
    cookieEncoding?: "raw" | "base64url";
    isSingleton?: boolean;
  },
): SupabaseClient<Database, SchemaName>;
```

Source: <https://github.com/supabase/ssr/blob/main/src/createBrowserClient.ts>

Behavioural facts from the same file:

- `options` is optional. In a browser it is a singleton by default: `isSingleton` defaults to `isBrowser()`, and the client is cached in a module-level `cachedBrowserClient`. Passing `isSingleton: false` opts out.
- `cookies` is optional. If both `getAll` and `setAll` are omitted in a browser runtime, it reads/writes via `document.cookie`.
- It sets `flowType: "pkce"`, `persistSession: true`, and `autoRefreshToken`/`detectSessionInUrl` default to `isBrowser()`.
- `auth.storage` is ignored and logs a one-time warning (see 1.4).

Verbatim app file — `lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
```

Source: <https://github.com/supabase/supabase/blob/master/examples/auth/nextjs/lib/supabase/client.ts> (verified against `@supabase/ssr` 0.12.7)

### 1.2 `createServerClient` signature (0.12.7)

From `src/createServerClient.ts`. Two overloads exist; the second is the current one and the first is explicitly deprecated in its own JSDoc. Generic parameter lists are elided as `<...>` for readability; nothing else is changed.

```ts
/**
 * @deprecated Please specify `getAll` and `setAll` cookie methods instead of
 * the `get`, `set` and `remove`. These will not be supported in the next major
 * version.
 */
export function createServerClient<...>(
  supabaseUrl: string,
  supabaseKey: string,
  options: SupabaseClientOptions<SchemaName> & {
    cookieOptions?: CookieOptionsWithName;
    cookies: CookieMethodsServerDeprecated;
    cookieEncoding?: "raw" | "base64url";
  },
): SupabaseClient<Database, SchemaName>;

export function createServerClient<...>(
  supabaseUrl: string,
  supabaseKey: string,
  options: SupabaseClientOptions<SchemaName> & {
    cookieOptions?: CookieOptionsWithName;
    cookies: CookieMethodsServer;
    cookieEncoding?: "raw" | "base64url";
  },
): SupabaseClient<Database, SchemaName>;
```

Source: <https://github.com/supabase/ssr/blob/main/src/createServerClient.ts>

Behavioural facts from the same file, all load-bearing:

- The session always lives in cookies. `auth.storage` is ignored, with a one-time console warning.
- The client is created with `skipAutoInitialize: true`: the session is not loaded until the first `getSession()`, `getUser()`, or `getClaims()`. This is what prevents a token-refresh race on the server.
- Also forced: `flowType: "pkce"`, `autoRefreshToken: false`, `detectSessionInUrl: false`, `persistSession: true`.
- `cookieEncoding` defaults to `"base64url"`.
- Cookie writes happen on `SIGNED_IN`, `TOKEN_REFRESHED`, `USER_UPDATED`, `PASSWORD_RECOVERY`, `SIGNED_OUT`, `MFA_CHALLENGE_VERIFIED` — and only when there are pending changes.
- The JSDoc is explicit that a client must never be shared across requests: "*Always* create a new client with this function for each server render".

Verbatim app file — `lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet, _headers) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have a proxy refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
```

Source: <https://github.com/supabase/supabase/blob/master/examples/auth/nextjs/lib/supabase/server.ts> (verified against `@supabase/ssr` 0.12.7)

Note `await cookies()`: Next 16 removed synchronous access to `cookies()`. The `_headers` parameter is deliberately unused here — response headers cannot be set from a Server Component render (see section 4).

### 1.3 Cookie adapter shape

From `src/types.ts`, verbatim except that the long JSDoc blocks are omitted (`encode` is marked `@experimental` there):

```ts
export type GetAllCookies = () =>
  | Promise<{ name: string; value: string }[] | null>
  | { name: string; value: string }[]
  | null;

export type SetAllCookies = (
  cookies: { name: string; value: string; options: CookieOptions }[],
  headers: Record<string, string>,
) => Promise<void> | void;

export type CookieMethodsServer = {
  encode?: "user-and-tokens" | "tokens-only";
  getAll: GetAllCookies;
  setAll?: SetAllCookies;
};
```

Source: <https://github.com/supabase/ssr/blob/main/src/types.ts>

What the second `setAll` argument is, quoted from that type's doc comment:

- It carries `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0`, `Pragma: no-cache`.
- "*For a server client, the cache headers are delivered only with the first cookie write.*"
- "*This object is empty on later calls from the same client.*"

So: `getAll` is required; `setAll` is optional but omitting it is only safe when something else (the proxy) writes cookies. `CookieMethodsBrowser` is the mirror image (`getAll?`, `setAll?` both optional, `encode?`).

### 1.4 Deprecated or superseded options that still appear in tutorials

| What older material shows | Status in 0.12.7 | Current form |
|---|---|---|
| `cookies: { get, set, remove }` | Deprecated overload, "will not be supported in the next major version" | `getAll` / `setAll` |
| `@supabase/auth-helpers-nextjs` | Deprecated package, folded into `@supabase/ssr`; `warnIfUsingDeprecatedAuthHelpersPackage()` fires | `@supabase/ssr` |
| `setAll(cookiesToSet)` (one argument) | Still runs, but silently drops the cache headers | `setAll(cookiesToSet, headers)` — `headers` param added in **0.10.0** (2026-03-30) |
| `auth: { storage }` on either factory | Ignored, one-time console warning | Nothing; cookies are always the store |
| Module-level / global server client | Broken by design; the docs example comments "With Fluid compute, don't put this client in a global environment variable" | New client per request |
| `supabase.auth.getUser()` inside middleware | Not deprecated, but no longer the documented check | `supabase.auth.getClaims()` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Still functional (legacy key), but not what current docs use | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

`CHANGELOG.md` source for the version claims: <https://github.com/supabase/ssr/blob/main/CHANGELOG.md>

---

## 2. Next.js 16: `proxy.ts` replaces `middleware.ts`

### 2.1 The facts

From the Next.js `proxy` reference (<https://nextjs.org/docs/app/api-reference/file-conventions/proxy>) and the v16 upgrade guide:

- **File location.** `proxy.ts` (or `.js`) "in the project root, or inside `src` if applicable, so that it is located at the same level as `pages` or `app`". With a custom `pageExtensions`, the file is `proxy.page.ts`.
- **Export name.** "The file must export a single function, either as a default export or named `proxy`." The Next 16 upgrade guide recommends renaming even default exports to `proxy`.
- **Config.** An optional `export const config = { matcher: ... }` alongside the function.
- **Runtime.** "Proxy defaults to using the Node.js runtime. The `runtime` config option is not available in Proxy files. Setting the `runtime` config option in Proxy will throw an error." The upgrade guide adds: the edge runtime is not supported in `proxy`; "If you want to continue using the edge runtime, keep using `middleware`."
- **`middleware.ts` status.** Deprecated, not removed: "The `middleware` file convention is deprecated and has been renamed to `proxy`." (Deprecated-but-functional is what the docs say; I did not run a build to prove it. See section 7.)
- **Matcher syntax.** Unchanged from middleware: a string, an array of strings, or an array of objects with `source` / `locale` / `has` / `missing`. Values "need to be constants so they can be statically analyzed at build-time". Paths must start with `/`; named params support `*`, `?`, `+` modifiers; regex groups allowed; negative lookahead is the idiom for exclusions.
- **Ordering.** Proxy runs before filesystem routes, after `next.config` `headers`/`redirects`.
- **Server Functions.** "Server Functions are not separate routes in this chain. They are handled as POST requests to the route where they are used, so a Proxy matcher that excludes a path will also skip Server Function calls on that path."
- **Supabase's own warning.** "On Next.js 15 and earlier, a `proxy.ts` file is never called, so sessions never refresh and users get signed out. Next.js renamed this file in version 16."

### 2.2 Verbatim `proxy.ts` — project root

```ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

Source: <https://github.com/supabase/supabase/blob/master/examples/auth/nextjs/proxy.ts>

### 2.3 Verbatim `lib/supabase/proxy.ts` — the session refresh

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims()

  const user = data?.claims

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
```

Source: <https://github.com/supabase/supabase/blob/master/examples/auth/nextjs/lib/supabase/proxy.ts> (verified against `@supabase/ssr` 0.12.7)

### 2.4 What actually changed for Supabase session refresh

Only three things, and the third is easy to miss:

1. Rename the file `middleware.ts` -> `proxy.ts`, and `export async function middleware` -> `export async function proxy`. The Supabase code inside is unchanged; Supabase says so explicitly.
2. Delete `export const runtime` if it is present. In Next 16 it throws in a proxy file. Nothing replaces it: proxy is Node-only.
3. `setAll` now takes `headers` as a second argument, and the proxy must apply them to the response. The old one-argument form compiles and runs, but auth responses lose `Cache-Control: private, no-store` and become cacheable by a CDN — one user's `Set-Cookie` served to another.

The refresh mechanism itself is the same as before: `request.cookies.set` forwards the new token to Server Components in the same render; `response.cookies.set` sends it back to the browser; `NextResponse.next({ request })` is rebuilt inside `setAll` so the response carries the fresh cookie.

---

## 3. `getClaims` vs `getUser` vs `getSession`

Supabase's current guidance, quoted from the "Choosing an auth method" section of <https://supabase.com/docs/guides/auth/server-side/creating-a-client>:

- **`getClaims()`** — "Use `getClaims` to protect pages and user data." It reads the access token and verifies the JWT signature. With asymmetric signing keys (the default for new projects) verification is local against a cached JWKS endpoint; with a symmetric secret "it calls `getUser` solely to validate" — i.e. it falls back to a network round trip. "When the access token is close to expiring, `getClaims` refreshes the session before it verifies, which is how a server-rendered session stays alive."
- **`getUser()`** — "makes a network call to the project's Auth instance to get the user record, which includes the most up-to-date information about the user at the cost of a network call."
- **`getSession()`** — "when you need the raw session (the access token, refresh token, and expiry). For example to forward the access token to another service. The session is loaded directly from local storage and isn't re-validated against the Auth server, so the embedded user object shouldn't be trusted on its own when storage is shared with the client (cookies, request headers)."

| | Authoritative server-side? | Cost per call | Right for |
|---|---|---|---|
| `getClaims()` | Yes. Verifies the signature; on asymmetric keys this is local + cached JWKS | Cheap (one JWKS fetch, then cached), or one Auth request on symmetric-key projects | Proxy, page/data authorization, the default check |
| `getUser()` | Yes. Server-confirmed record | One Auth network request, every call | Needing fresh user metadata (email change, ban state) rather than just identity |
| `getSession()` | **No.** Reads the cookie, does not revalidate | Free | Forwarding the access/refresh token to another service. Never for authorization |

The JSDoc in `createServerClient.ts` reinforces the ordering rule: `getClaims` calls `getSession()` internally only when no explicit JWT is passed, so the first auth call in a request pays for session load and possible refresh, and later calls are cheap.

**Guidance that changed.** Older tutorials put `await supabase.auth.getUser()` in the middleware as the auth check. The current docs use `getClaims()` and state, in a danger admonition: "*Never* trust `supabase.auth.getSession()` inside server code such as Proxy. It reads the session out of the cookie without revalidating it." `getUser()` is not wrong, only more expensive than needed for a mere identity check.

One more constraint from `types.ts` (server `setAll` doc): call `await supabase.auth.getClaims()` early, "before any response is generated", so a refresh cannot land after the response is committed.

---

## 4. The Server Component cannot write cookies

### 4.1 The failure mode

`cookies()` from `next/headers` is read/write in Server Functions and Route Handlers, but read-only during a Server Component render. Next.js states it directly (<https://nextjs.org/docs/app/api-reference/functions/cookies>):

> "**Setting cookies** is not supported during Server Component rendering. To modify cookies, invoke a Server Function from the client or use a Route Handler."

> "HTTP does not allow setting cookies after streaming starts, so you must use `.set` in a Server Function or Route Handler."

In practice: a Server Component calls `supabase.auth.getUser()` (or any call that triggers a token refresh), `@supabase/ssr` invokes `setAll`, `cookieStore.set(...)` throws, and the request errors — or, with the Supabase example's `try/catch`, the refreshed token is silently discarded.

### 4.2 The documented pattern

Two halves, both required:

1. In the Server Component client, wrap `setAll` in `try { ... } catch {}` and ignore the error. The cookie write is best-effort there, because it cannot succeed. That is the `server.ts` snippet in 1.2, and Supabase explains the reasoning: "In Server Components, the headers cannot be set, which is why the `setAll` call is wrapped in a try/catch and the error is ignored. The Proxy handles writing cookies and headers on every request."
2. In the proxy, write cookies for real, on every request, and apply the cache headers. Without this, the `try/catch` becomes a silent session-killer: each render refreshes, the new token is dropped, and the next request refreshes again.

### 4.3 Where writes are allowed

| Location | Can set cookies? | Role in the Supabase pattern |
|---|---|---|
| `proxy.ts` | Yes, on both request and response | Primary writer: refresh, forward to RSC via `request.cookies.set`, return to browser via `response.cookies.set` |
| Server Action | Yes | Required for `updateUser()`, `signOut()`, password change, any auth mutation; the write lands on the action's response |
| Route Handler | Yes | Same, for `/auth/callback` code exchange and other HTTP entry points |
| Server Component render | **No** | Read only; `setAll` must swallow the error |

Two consequences worth internalising:

- `supabase.auth.updateUser()` called from a Server Component will hit the unwritable-cookie path. If `setAll` is omitted entirely, `@supabase/ssr` emits a warning enumerating the likely causes: no proxy client configured, a bug in the proxy, or a server-side `updateUser()`.
- If the proxy matcher excludes a path that has Server Actions, the refresh never runs for those POSTs, because Server Functions are handled as POSTs to their own route.

---

## 5. Env vars, publishable keys, and what it changes

Current Next.js values, quoted from the docs `.env.local` block:

```bash
NEXT_PUBLIC_SUPABASE_URL=supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=supabase_publishable_key
```

Sources: <https://supabase.com/docs/guides/auth/server-side/creating-a-client> and <https://supabase.com/docs/guides/getting-started/api-keys>

Key model, from the API keys page:

- Publishable key: `sb_publishable_...`, low privilege, safe to ship in a browser, maps to the `anon` Postgres role when no user is signed in and `authenticated` when one is.
- Secret key: `sb_secret_...`, elevated, maps to `service_role`, bypasses RLS, must never carry a `NEXT_PUBLIC_` prefix and is rejected with 401 if sent from a browser.
- `anon` and `service_role` (JWTs beginning `eyJ`) are legacy but still valid. "Supabase is deprecating the `anon` and `service_role` keys by the end of 2026." Both key systems work simultaneously; creating a publishable key does not revoke the anon key.
- "Publishable and secret keys are short strings, not JWTs. If a tool, tutorial, or AI assistant tells you to copy a long key that begins with `eyJ`, it was written for the legacy keys."
- `supabase start` prints a publishable key and a secret key for the local stack under "Authentication Keys". Local keys are unrelated to hosted keys.

Does the publishable-key model change any code? **No.** `createServerClient(url, key, ...)` and `createBrowserClient(url, key, ...)` take an opaque string; nothing inspects the key format. The only changes are the env var name and which value you paste. `@supabase/ssr`'s `createServerClient` JSDoc still says "The `anon` API key of the Supabase project" — stale wording, not a behavioural constraint.

One caveat for this repo: `.env.local` feeds Next only. `supabase start` is driven by `supabase/config.toml`, and the CLI ignores `.env.local`.

---

## 6. Versions and Next 16 compatibility

Verified via npm on 2026-11-15:

```
@supabase/ssr          0.12.7   (published 2026-09-08)
@supabase/supabase-js  2.119.0  (published 2026-11-04)
next                   16.4.6
```

Dependency facts:

- `@supabase/ssr@0.12.7` peer-depends on `@supabase/supabase-js: ^2.114.0` and has exactly one runtime dependency, `cookie: ^1.0.2`. It declares **no** `next` peer dependency, so npm will not flag a Next version mismatch either way.
- `@supabase/supabase-js@2.119.0` declares `engines: { node: ">=22.0.0" }`. `@supabase/ssr@0.12.7` declares no `engines` field.
- `next@16.4.6` declares `engines: { node: ">=20.9.0" }`.

So the binding runtime floor is Node 22, set by `supabase-js`, not Node 20.9 set by Next. This repo runs Node 26.8.1, so it is clear.

Known Next 16 interactions, all already covered above:

1. `proxy.ts` runs on the Node runtime only, and `export const runtime` throws. This removes the old Edge-runtime constraint from the Supabase wiring; it also means you cannot opt into Edge without staying on the deprecated `middleware.ts`.
2. `cookies()` is async-only in 16; `await cookies()` is mandatory in the server client.
3. Turbopack is the default for `next dev` and `next build` in 16. `@supabase/ssr` is plain JS with no bundler hooks, and no Turbopack-specific Supabase configuration appears in the docs.

**No documented Next 16 incompatibility with `@supabase/ssr` was found.** That is an absence of evidence from the primary docs, not a proof: I did not audit the issue trackers, and `@supabase/ssr` has no `next` peer range to declare compatibility with.

Version-sensitive features to pin deliberately:

- `setAll(cookiesToSet, headers)` requires `@supabase/ssr >= 0.10.0` (2026-03-30).
- `cookies.encode: "tokens-only"` requires `>= 0.8.0` (2025-11-26) and is marked `@experimental`.
- `getClaims()` requires a `supabase-js` recent enough to ship it; the peer floor of `^2.114.0` covers it.

---

## 7. Where older tutorials disagree with current docs

| Older tutorial | Current | Why it matters |
|---|---|---|
| `middleware.ts` + `export function middleware` | `proxy.ts` + `export function proxy` | On Next 16 the old name is deprecated; on 15-and-earlier a `proxy.ts` file is never invoked at all |
| `export const runtime = 'edge'` in the middleware | Not allowed in `proxy.ts`; it throws | Copy-pasting the old block breaks the build |
| `setAll(cookiesToSet)` | `setAll(cookiesToSet, headers)` and apply `headers` | Missing cache headers let a CDN cache an authenticated response |
| `cookies: { get, set, remove }` | `getAll` / `setAll` | Deprecated overload, slated for removal in the next major |
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | Deprecated package; fires a runtime warning |
| `auth: { storage: ... }` to customise persistence | Ignored with a warning; cookies are the only store | Silent no-op that looks like working config |
| `getUser()` as the middleware check | `getClaims()` | Same security outcome on asymmetric keys, minus a network round trip per request |
| `getSession()` to read the user server-side | Never for authorization; `getClaims()` | `getSession()` does not revalidate the JWT |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` with an `eyJ...` value | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with `sb_publishable_...` | Anon keys are being deprecated by end of 2026; both work today |
| Module-level or global `createServerClient` | New client per request | Shared clients leak one request's cookies into another |

---

## 8. Not verified

Stated plainly rather than guessed:

- Whether `middleware.ts` still functions in 16.4.6 in practice. The docs call it deprecated and the upgrade guide says to keep using it for Edge, which implies it works, but I did not build a project to confirm. Unverified.
- Any runtime incompatibility between `@supabase/ssr` 0.12.7 and Next 16.4.6 beyond the Node floor. No primary source documents one; this is not an exhaustive audit. Unverified.
- Whether the `headers` object passed to a server `setAll` is populated on every write or only the first. The type doc says the first; I did not empirically test it. The doc statement is what section 2.4 relies on.
- Behaviour of `cookies.encode: "tokens-only"` in a real deployment. It is marked `@experimental` in the source; it was read, not exercised.

## Addendum — verification pass (2026-11-15)

An independent audit re-checked every load-bearing claim against upstream sources. **No factual errors were found**; the embedded snippets match `@supabase/ssr`'s own `examples/auth/nextjs/` files byte-for-byte. What follows is what the first pass omitted — which matters more than anything it got wrong.

### 1. Refresh-token reuse detection — the real reason the proxy must be the sole refresher

A refresh token is single-use, bar a short reuse window and the parent-token case. A second refresh with the same token **revokes the entire session**. Two tabs refreshing concurrently therefore produce apparently random sign-outs; the `@supabase/ssr` README documents the symptom as `session: null`.

This is why session refresh belongs in exactly one place — the proxy — and why a Server Component must never attempt it. It also means `getSession()` is not free: near expiry it refreshes, which is a network call plus a cookie write, i.e. precisely the Server Component hazard.

### 2. `claims` is not a `User`

The proxy snippet's `user` is a claims object: `sub`, `email`, `role`, `aud`, `exp`. It has **no `.id`**. Anything mapping into an `AuthService` identity must use `claims.sub`; a component reading `user.id` fails silently with `undefined`.

### 3. Local-stack signing keys are undetermined

`getClaims()` verifies locally against cached JWKS only when the project uses asymmetric signing keys; on symmetric keys it falls back to an Auth round trip. What `supabase start` issues is not documented, so the dev-time cost of `getClaims()` is **unverified** — measure it in Phase 4 rather than assume it.

### 4. Matcher nuance

Even when a path is excluded from `config.matcher`, Next still runs the proxy for `_next/data` requests.

### 5. Version pinning hazard

`supabase-js` publishes a `next` dist-tag (currently `3.0.0-next.29`). A bare install resolves to 2.119.0 today, but v3 would violate `@supabase/ssr`'s `^2.114.0` peer range. Pin both explicitly.

### Minor corrections to this document

- §6: the `engines` field on a transitive dependency warns (`EBADENGINE`), it does not block unless `engine-strict` is set — "floor" overstates enforcement.
- §2.4: `setAll(..., headers)` is a **library** change (`@supabase/ssr` 0.10.0), not a Next 16 change. §1.4 states this correctly.
- §3: `getSession()` is "free" only while the access token is valid; near expiry it refreshes.

