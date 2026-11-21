import type { AppErrorKind } from "@/core/dto/AppError";
import type { AuthFormState } from "@/app/auth/AuthActions";

/**
 * Visitor-facing copy, one sentence per `AppErrorKind`.
 *
 * The adapter sends a diagnostic message that is never rendered; this table is
 * the only place a failure becomes English. Two entries carry the security
 * decision from #5: `invalid_credentials` is the same sentence for a wrong
 * password and an unknown address, and `conflict` is the same sentence a new
 * sign-up sees, so neither tells a stranger who has an account.
 */
const COPY: Record<AppErrorKind, string> = {
  validation: "Check the address and password, then try again.",
  invalid_credentials: "That email and password do not match an account.",
  email_unconfirmed: "Confirm your email first. The link is in your inbox.",
  conflict: "Check your email to finish signing up.",
  not_found: "That link has expired or was already used.",
  unauthorized: "Sign in again to continue.",
  out_of_stock: "That is a stock error, not a sign-in problem. Try again.",
  unavailable: "The auth server is not answering. Try again in a moment.",
  unknown: "Something went wrong. Try again.",
};

export function authErrorMessage(kind: AppErrorKind): string {
  return COPY[kind];
}

/** The state both forms start from; `useActionState` needs a stable object. */
export const INITIAL_AUTH_FORM_STATE: AuthFormState = {
  error: null,
  checkEmail: false,
};
