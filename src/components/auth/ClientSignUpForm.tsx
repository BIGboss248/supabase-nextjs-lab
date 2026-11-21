"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUpAction } from "@/app/auth/AuthActions";
import { authErrorMessage, INITIAL_AUTH_FORM_STATE } from "./AuthCopy";

/**
 * Sign-up ends in this component's own state rather than on a new route: the
 * action returns `checkEmail`, and the form is replaced by the paragraph below.
 * A duplicate address takes the same branch, so the two are indistinguishable
 * (#5 decision 9).
 */
export function ClientSignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, INITIAL_AUTH_FORM_STATE);

  if (state.checkEmail) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-medium">Check your email for the confirmation link.</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Follow the link to finish signing up. Once confirmed,{" "}
          <Link href="/auth/sign-in" className="font-medium text-foreground underline">
            sign in
          </Link>
          .
        </p>
      </div>
    );
  }

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
          minLength={6}
          autoComplete="new-password"
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
        {pending ? "Signing up…" : "Sign up"}
      </button>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href="/auth/sign-in" className="font-medium text-foreground underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
