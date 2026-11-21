import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { ProductCatalog } from "@/core/ports/ProductCatalog";
import { SupabaseProductCatalog } from "./ProductCatalog";

/**
 * The only door from app code to Supabase.
 *
 * `server-only` turns an accidental import from a Client Component into a build
 * error rather than a bundle that ships the URL and publishable key. The client
 * is created per request: `@supabase/ssr` reads the session from cookies and
 * buffers the cookies it wants to write, so a shared instance would leak one
 * visitor's session into another's render.
 *
 * `setAll` may fail here and that is expected: a Server Component render cannot
 * write cookies. The proxy refreshes the session and owns the actual write.
 */
export async function getCatalog(): Promise<ProductCatalog> {
  const cookieStore = await cookies();

  const client = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Read-only cookie store during a Server Component render.
          }
        },
      },
    },
  );

  return new SupabaseProductCatalog(client);
}

function requireEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set; copy it from \`npx supabase status\` into .env.local`);
  }
  return value;
}
