import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request that renders app code.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts` and the export to `proxy`; the
 * `runtime` option is gone and setting it throws. Every tutorial written before
 * November 2026 has the old name.
 *
 * This file refreshes and never redirects (#5 decision 1). The guard lives in
 * the page that needs the identity, `/account`, so there is exactly one place
 * that decides who may see what.
 *
 * Refresh tokens are single-use, so this must remain the only layer that
 * refreshes: a second concurrent refresh revokes the whole session, which the
 * visitor experiences as a random sign-out.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set; copy them from `npx supabase status` into .env.local",
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Forward the new token to the Server Components rendering this request...
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        // ...rebuild the response so it carries the same request...
        response = NextResponse.next({ request });
        // ...send the cookie to the browser...
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // ...and keep auth responses out of any cache. Dropping these headers
        // lets a CDN serve one visitor's `Set-Cookie` to another.
        Object.entries(headers).forEach(([header, value]) => response.headers.set(header, value));
      },
    },
  });

  // Do not run code between creating the client and this call. `getClaims()`
  // verifies the JWT and refreshes a session that is close to expiry; skipping
  // it is what makes visitors sign out at random.
  await supabase.auth.getClaims();

  // Return this response as built. A fresh `NextResponse.next()` without the
  // request and these cookies desynchronises browser and server.
  return response;
}

/**
 * Broad on purpose (#5 decision 8): a Server Action is a POST to the page's own
 * route, so a matcher that skipped a page would also skip the refresh that keeps
 * its session alive. Only static assets are excluded.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
