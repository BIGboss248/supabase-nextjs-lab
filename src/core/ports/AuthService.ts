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
  signIn(input: SignInInput): Promise<Result<AuthIdentity>>;
  signOut(): Promise<Result<void>>;
  getCurrentUser(): Promise<Result<AuthIdentity | null>>;
}
