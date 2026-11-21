import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The browser-side client, for the work a server render cannot do: the realtime
 * stock channel Phase 6 adds.
 *
 * Nothing imports this yet; #18 Phase 6 is the first caller. It lives here so a
 * component never imports `@supabase/supabase-js` itself, which keeps Supabase
 * behind `src/adapters/supabase/`.
 *
 * `createBrowserClient` reads and writes the session through `document.cookie`
 * on its own, so no cookie adapter is passed. It caches one client per tab, so
 * calling this twice is safe.
 *
 * The two env reads are written out as literal `process.env.NEXT_PUBLIC_*`
 * expressions on purpose: Next inlines exactly those, and a dynamic
 * `process.env[name]` would arrive in the browser as `undefined`.
 */
export function getBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set; copy them from `npx supabase status` into .env.local",
    );
  }
  return createBrowserClient(url, key);
}
