import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Confirmation link expired",
};

/**
 * Where the Route Handler sends a link whose token is dead, reused or absent.
 * One page for all three: which of them happened is not the visitor's problem,
 * and saying "already used" for a forged token is the same sentence.
 */
export default function AuthErrorPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">That link did not work</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        The confirmation link has expired or was already used. Sign up again with the same
        address to get a fresh one.
      </p>
      <p className="flex gap-4 text-sm">
        <Link href="/auth/sign-up" className="font-medium underline">
          Sign up
        </Link>
        <Link href="/auth/sign-in" className="font-medium underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
