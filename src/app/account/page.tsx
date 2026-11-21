import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { getAuth } from "@/adapters/supabase";

export const metadata: Metadata = {
  title: "Account",
};

/**
 * The one protected route (#5). The guard is the page itself, not `proxy.ts`:
 * the proxy only refreshes, so there is exactly one place that decides who may
 * see what, and it sits next to the data it protects.
 *
 * The session read is pushed into a child behind `<Suspense>`, because Cache
 * Components turns a bare `cookies()` read outside a boundary into a build
 * error — and because the rest of the page can then prerender.
 */
export default function AccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>
      <Suspense fallback={<p className="text-sm text-zinc-600 dark:text-zinc-400">Checking your session…</p>}>
        <AccountSummary />
      </Suspense>
    </div>
  );
}

async function AccountSummary() {
  // `getClaims()` reads `Date.now()` to check expiry; prerendering must not
  // attempt it. Same guard as the header.
  await connection();

  const auth = await getAuth();
  const result = await auth.getCurrentUser();

  if (!result.ok) {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">
        Your session could not be checked. Reload the page.
      </p>
    );
  }

  // Signed out, or a cookie whose session no longer exists: both are anonymous.
  if (!result.data) redirect("/auth/sign-in");

  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
      <dt className="font-medium">Email</dt>
      <dd>{result.data.email ?? "not present in the token"}</dd>
      <dt className="font-medium">sub</dt>
      <dd className="break-all font-mono">{result.data.id}</dd>
    </dl>
  );
}
