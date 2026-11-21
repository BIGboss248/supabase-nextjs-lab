import type { AuthError, SupabaseClient } from "@supabase/supabase-js";

import type { AppError, AppErrorKind } from "@/core/dto/AppError";
import type { AuthIdentity } from "@/core/dto/AuthIdentity";
import { err, ok, type Result } from "@/core/dto/Result";
import type {
  AuthService,
  ConfirmEmailInput,
  SignInInput,
  SignUpInput,
  SignUpOutcome,
} from "@/core/ports/AuthService";

/**
 * The real auth surface, over GoTrue.
 *
 * Takes a client rather than creating one, so the cookie-bound factory stays in
 * `index.ts` (the one `server-only` door) and a test can hand it a plain client.
 *
 * Two rules hold on every method:
 *
 * - Identity comes from `getClaims()` and is read from `claims.sub`. A claims
 *   object has no `.id`; reading one returns `undefined` and signs nobody in.
 * - A session is written through the client's cookie adapter, so sign-in, sign-up
 *   and confirmation must be called where cookies are writable: a Server Action
 *   or a Route Handler, never a Server Component render.
 */
export class SupabaseAuthService implements AuthService {
  constructor(private readonly client: SupabaseClient) {}

  async signUp({ email, password }: SignUpInput): Promise<Result<SignUpOutcome>> {
    const invalid = rejectBlank("signUp", { email, password });
    if (invalid) return invalid;

    try {
      const { data, error } = await this.client.auth.signUp({ email, password });
      if (error) return err(toAppError("signUp", error));

      // GoTrue hides an address that already exists: with confirmations on it
      // answers with a user that has no identities and no session, so a new
      // signup and a duplicate look the same to the visitor (#5 decision 9).
      // The caller logs the conflict and shows the check-email state either way.
      if (data.user && data.user.identities?.length === 0) {
        return err({
          kind: "conflict",
          message: `signUp: ${email} already has an account`,
        });
      }

      // No session means the address must be confirmed before signing in.
      return ok({ requiresEmailConfirmation: data.session === null });
    } catch (cause) {
      return err(unavailable("signUp", cause));
    }
  }

  async confirmEmail({ tokenHash, type }: ConfirmEmailInput): Promise<Result<AuthIdentity>> {
    if (tokenHash.trim() === "") {
      return err({
        kind: "validation",
        message: "confirmEmail: the token hash is empty",
      });
    }

    try {
      const { error } = await this.client.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (error) return err(toAppError("confirmEmail", error));

      // `verifyOtp` writes the new session through the cookie adapter; reading
      // it back through claims is what proves the write landed.
      return this.requireIdentity("confirmEmail");
    } catch (cause) {
      return err(unavailable("confirmEmail", cause));
    }
  }

  async signIn({ email, password }: SignInInput): Promise<Result<AuthIdentity>> {
    const invalid = rejectBlank("signIn", { email, password });
    if (invalid) return invalid;

    try {
      const { error } = await this.client.auth.signInWithPassword({ email, password });
      if (error) return err(toAppError("signIn", error));
      return this.requireIdentity("signIn");
    } catch (cause) {
      return err(unavailable("signIn", cause));
    }
  }

  async signOut(): Promise<Result<void>> {
    try {
      const { error } = await this.client.auth.signOut();
      // Signing out with no session leaves the visitor in the state they asked
      // for, so the missing session is not a failure.
      if (error && !isDeadSession(error)) return err(toAppError("signOut", error));
      return ok(undefined);
    } catch (cause) {
      return err(unavailable("signOut", cause));
    }
  }

  async getCurrentUser(): Promise<Result<AuthIdentity | null>> {
    return this.identity("getCurrentUser");
  }

  /** `ok(null)` when nobody is signed in: the normal state of a storefront visitor. */
  private async identity(operation: string): Promise<Result<AuthIdentity | null>> {
    try {
      const { data, error } = await this.client.auth.getClaims();
      if (error) {
        // A stale cookie whose session is gone is an anonymous visitor, not a
        // failure; the proxy clears it on the next request. A network failure
        // stays an error, so "the auth server is down" is never read as "signed
        // out".
        if (isDeadSession(error)) return ok(null);
        return err(toAppError(operation, error));
      }
      if (!data) return ok(null);

      const claims = data.claims;
      if (!claims?.sub) {
        return err({
          kind: "unauthorized",
          message: `${operation}: the verified token carries no subject claim`,
        });
      }

      return ok({
        id: claims.sub,
        email: typeof claims.email === "string" ? claims.email : null,
      });
    } catch (cause) {
      return err(unavailable(operation, cause));
    }
  }

  /**
   * For a method that just authenticated: no session afterwards means the
   * cookie write did not land, which is a bug rather than an anonymous visitor.
   */
  private async requireIdentity(operation: string): Promise<Result<AuthIdentity>> {
    const result = await this.identity(operation);
    if (!result.ok) return result;
    if (!result.data) {
      return err({
        kind: "unauthorized",
        message: `${operation} succeeded but left no session: the caller cannot write cookies here`,
      });
    }
    return ok(result.data);
  }
}

/** Local guard, so a blank field costs no network round trip. */
function rejectBlank(
  operation: string,
  fields: { email: string; password: string },
): Result<never> | null {
  if (fields.email.trim() === "") {
    return err({ kind: "validation", message: `${operation}: the email is empty` });
  }
  if (fields.password === "") {
    return err({ kind: "validation", message: `${operation}: the password is empty` });
  }
  return null;
}

/**
 * GoTrue reports failure as a resolved error value, so this is the one place
 * where Auth vocabulary becomes the app's own taxonomy.
 */
function toAppError(operation: string, error: AuthError): AppError {
  return {
    kind: kindFor(error),
    message: `${operation} failed: ${error.message}`,
    cause: [error.status, error.code, error.name].filter(Boolean).join(" / "),
  };
}

function kindFor(error: AuthError): AppErrorKind {
  switch (error.code) {
    case "invalid_credentials":
      return "invalid_credentials";
    case "email_not_confirmed":
      return "email_unconfirmed";
    case "user_already_exists":
    case "email_exists":
      return "conflict";
    // A link already spent, or one whose token never existed.
    case "otp_expired":
    case "otp_disabled":
      return "not_found";
    case "weak_password":
    case "same_password":
    case "validation_failed":
    case "email_address_invalid":
    case "email_address_not_authorized":
      return "validation";
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
    case "user_banned":
      return "unauthorized";
    // Rate limits and server-side failures are the service's problem, not the
    // caller's input.
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
    case "over_sms_send_rate_limit":
    case "unexpected_failure":
      return "unavailable";
    default:
      return error.status === 401 || error.status === 403 ? "unauthorized" : "unavailable";
  }
}

/** The cookie names a session that no longer exists: signed out, not broken. */
function isDeadSession(error: AuthError): boolean {
  return (
    error.name === "AuthSessionMissingError" ||
    error.code === "session_not_found" ||
    error.code === "session_expired" ||
    error.code === "refresh_token_not_found" ||
    error.code === "refresh_token_already_used" ||
    error.code === "bad_jwt"
  );
}

/** A thrown value, not an Auth error: the network or the runtime gave up. */
function unavailable(operation: string, cause: unknown): AppError {
  return {
    kind: "unavailable",
    message: `${operation} could not reach the auth server`,
    cause: describe(cause),
  };
}

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  try {
    return JSON.stringify(cause) ?? String(cause);
  } catch {
    return String(cause);
  }
}
