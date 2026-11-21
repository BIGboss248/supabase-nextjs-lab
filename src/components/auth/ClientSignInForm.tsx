"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signInAction } from "@/app/auth/AuthActions";
import { authErrorMessage, INITIAL_AUTH_FORM_STATE } from "./AuthCopy";

/**
 * A client component for one reason: `useActionState` keeps the returned error
 * kind on the form without putting it in the URL. It is also what makes the
 * form work before hydration completes — the action is a POST to the same
 * route either way, so progressive enhancement is intact.
 */
export function ClientSignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, INITIAL_AUTH_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-base font-normal dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded border border-zinc-300 bg-white px-3 py-2 text-base font-normal dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {authErrorMessage(state.error)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No account yet?{" "}
        <Link href="/auth/sign-up" className="font-medium text-foreground underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}
