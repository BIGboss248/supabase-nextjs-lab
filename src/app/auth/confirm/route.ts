import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { getAuth } from "@/adapters/supabase";
import { isEmailOtpType } from "@/core/ports/AuthService";

/**
 * Spends the confirmation link the email carries.
 *
 * A Route Handler, not a page, because `verifyOtp` writes the session cookies
 * and a Server Component render cannot. The link is
 * `/auth/confirm?token_hash=…&type=email` — built by
 * `supabase/templates/confirmation.html` — so nothing here depends on
 * `emailRedirectTo` or on a session arriving in a URL fragment.
 *
 * Both branches end in `redirect()`, which throws; do not wrap them in `try`.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (!tokenHash || !type || !isEmailOtpType(type)) redirect("/auth/error");

  const auth = await getAuth();
  const result = await auth.confirmEmail({ tokenHash, type });

  // A spent token, a forged one and an expired one all map to `not_found` in
  // the adapter. One error page, because the visitor can only act on "get a
  // fresh link".
  if (!result.ok) redirect("/auth/error");

  redirect("/account");
}
