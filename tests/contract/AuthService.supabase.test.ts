import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { SupabaseAuthService } from "@/adapters/supabase/AuthService";

import { describeAuthServiceContract } from "./AuthService.contract";

/**
 * The same suite, against the local stack's GoTrue.
 *
 * Gated by `SUPABASE_CONTRACT=1` and reported as skipped otherwise, so the unit
 * run needs no Docker. It needs `npx supabase start` and nothing else: every
 * account it creates uses a fresh address, and the local stack keeps them.
 *
 * The client persists nothing and refreshes nothing, so each `createService()`
 * is an anonymous visitor with no cookie jar. What that cannot prove — the
 * `sb-*` cookie, the proxy's refresh, an identity surviving a reload — needs
 * the running app and is checked there.
 */
const enabled = process.env.SUPABASE_CONTRACT === "1";
const describeOrSkip = enabled ? describe : describe.skip;

describeOrSkip("SupabaseAuthService (SUPABASE_CONTRACT=1, local stack)", () => {
  describeAuthServiceContract("SupabaseAuthService", {
    createService: async () => {
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
      return new SupabaseAuthService(client);
    },
    freshEmail: () => `contract-${Date.now()}-${randomUUID()}@example.test`,
  });
});
