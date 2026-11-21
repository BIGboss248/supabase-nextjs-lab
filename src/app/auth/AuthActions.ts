"use server";

import { redirect } from "next/navigation";

import { getAuth } from "@/adapters/supabase";
import type { AppErrorKind } from "@/core/dto/AppError";

/**
 * What every auth form renders after an action.
 *
 * `error` is the `AppErrorKind` itself, never provider words: the adapter owns
 * the diagnosis, the form owns the copy. `checkEmail` is the sign-up-only
 * "look in your inbox" state, which is also what a duplicate sign-up returns,
 * so the two are indistinguishable (#5 decision 9).
 */
export type AuthFormState = {
  error: AppErrorKind | null;
  checkEmail: boolean;
};

/**
 * The mutation surface for auth (#5). Every method of `AuthService` is called
 * from here, which is one of only two places where cookies are writable; a
 * Server Component render is the other and it must not try.
 *
 * Each action returns a state value rather than throwing, except on success,
 * where `redirect()` throws its own control-flow error and navigates. Keep
 * `redirect()` outside any `try`: a catch around it would swallow the redirect.
 */

export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const auth = await getAuth();
  const result = await auth.signUp({
    email: text(formData, "email"),
    password: text(formData, "password"),
  });

  if (!result.ok) {
    // GoTrue answers a duplicate with a user that has no identities. That is a
    // conflict, but rendering it would tell a stranger the address is taken.
    // Log the kind and show exactly what a fresh sign-up shows.
    if (result.error.kind === "conflict") {
      console.warn("[auth] signUp: conflict, returning the check-email state");
      return { error: null, checkEmail: true };
    }
    return { error: result.error.kind, checkEmail: false };
  }

  // With confirmations disabled a sign-up already holds a session; the local
  // `config.toml` enables them, so this is the fallback rather than the path.
  if (!result.data.requiresEmailConfirmation) redirect("/account");

  return { error: null, checkEmail: true };
}

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const auth = await getAuth();
  const result = await auth.signIn({
    email: text(formData, "email"),
    password: text(formData, "password"),
  });

  if (!result.ok) return { error: result.error.kind, checkEmail: false };

  redirect("/account");
}

export async function signOutAction(): Promise<void> {
  const auth = await getAuth();
  await auth.signOut();
  redirect("/");
}

function text(formData: FormData, key: "email" | "password"): string {
  const value = formData.get(key);
  if (typeof value !== "string") return "";
  // A password is taken exactly as typed; only the address tolerates a stray
  // leading or trailing space from a paste.
  return key === "email" ? value.trim() : value;
}
