import type { AuthIdentity } from "../dto/AuthIdentity";
import type { Result } from "../dto/Result";

export type SignUpInput = {
  email: string;
  password: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

/**
 * Which emailed link a token hash belongs to.
 *
 * The six values GoTrue can mint, kept provider-neutral here because the port
 * is what callers see. v1 mints only `signup`, and the confirmation link reads
 * `type=email` from the URL (#5 Decide the auth flow and the protected-route
 * surface).
 */
export const EMAIL_OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const;

export type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

/**
 * Narrows an untrusted query parameter. The Route Handler runs what arrives in
 * the URL through this before the adapter sees it, so a hand-edited `type`
 * cannot reach `verifyOtp`.
 */
export function isEmailOtpType(value: string): value is EmailOtpType {
  return (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

export type ConfirmEmailInput = {
  /** The `token_hash` the emailed link carries; single-use. */
  tokenHash: string;
  type: EmailOtpType;
};

/**
 * True when the project requires the address to be confirmed before the
 * account can sign in, which decides whether the form shows "check your email".
 */
export type SignUpOutcome = {
  requiresEmailConfirmation: boolean;
};

/**
 * The auth surface v1 needs, and no provider vocabulary.
 *
 * `getCurrentUser` returns `ok(null)` when signed out: anonymous is the normal
 * state of a storefront visitor, not a failure, so a caller never has to
 * convert a normal state into an error before rendering.
 */
export interface AuthService {
  signUp(input: SignUpInput): Promise<Result<SignUpOutcome>>;
  /**
   * Spends an emailed link. Success signs the visitor in, so the returned
   * identity is the session the handler may now rely on.
   */
  confirmEmail(input: ConfirmEmailInput): Promise<Result<AuthIdentity>>;
  signIn(input: SignInInput): Promise<Result<AuthIdentity>>;
  signOut(): Promise<Result<void>>;
  getCurrentUser(): Promise<Result<AuthIdentity | null>>;
}
