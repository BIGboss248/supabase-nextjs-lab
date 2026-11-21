import { createClient } from "@supabase/supabase-js";

import { SupabaseProductCatalog } from "@/adapters/supabase/ProductCatalog";

import { describeProductCatalogContract } from "./ProductCatalog.contract";

/**
 * The same suite, against the local stack, as the anonymous role.
 *
 * Gated by `SUPABASE_CONTRACT=1` and reported as skipped otherwise, so the unit
 * run needs no Docker. It needs `npx supabase start` and the seed rows: six
 * published products, one of them sold out.
 *
 * `sellsAs: anonymous` because `sell_one_unit` is granted to `authenticated`
 * only. A real sale needs a session, which is Phase 5's problem; until then the
 * contract proves the grant refuses this caller.
 */
const enabled = process.env.SUPABASE_CONTRACT === "1";
const describeOrSkip = enabled ? describe : describe.skip;

describeOrSkip("SupabaseProductCatalog (SUPABASE_CONTRACT=1, local stack)", () => {
  describeProductCatalogContract("SupabaseProductCatalog", {
    createCatalog: async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) {
        throw new Error(
          "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are needed; copy them from `npx supabase status` into .env.local",
        );
      }

      const client = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      return new SupabaseProductCatalog(client);
    },
    sellsAs: { kind: "anonymous" },
  });
});
