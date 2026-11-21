import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { getAuth } from "@/adapters/supabase";
import { SignOutButton } from "./SignOutButton";

/**
 * The site chrome, and the visible answer to "who is signed in?".
 *
 * The session read lives in `HeaderSession` behind `<Suspense>` rather than at
 * the top of the layout: a top-level await on the session would hold every
 * route segment behind the request, and Cache Components would reject the bare
 * `cookies()` read anyway.
 */
export function Header() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          Supabase lab
        </Link>
        <Suspense fallback={<HeaderSessionSkeleton />}>
          <HeaderSession />
        </Suspense>
      </nav>
    </header>
  );
}

async function HeaderSession() {
  // Defer to request time before `getClaims()`, whose JWT-expiry check reads
  // `Date.now()`. Cache Components treats that as a value that cannot be
  // prerendered, and this read has to happen per request anyway.
  await connection();

  const auth = await getAuth();
  const result = await auth.getCurrentUser();

  // A failure is shown as signed out: the alternative is a header that hides
  // the sign-in links exactly when the auth server is unreachable.
  if (!result.ok || !result.data) {
    return (
      <div className="flex items-center gap-4 text-sm">
        <Link href="/auth/sign-in" className="font-medium underline">
          Sign in
        </Link>
        <Link href="/auth/sign-up" className="font-medium underline">
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-sm">
      <Link href="/account" className="font-medium underline">
        {result.data.email ?? "Account"}
      </Link>
      <SignOutButton />
    </div>
  );
}

function HeaderSessionSkeleton() {
  return (
    <div aria-hidden className="h-5 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
  );
}
