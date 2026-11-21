import type { AuthIdentity } from "@/core/dto/AuthIdentity";
import { err, ok, type Result } from "@/core/dto/Result";
import type {
  AuthService,
  ConfirmEmailInput,
  SignInInput,
  SignUpInput,
  SignUpOutcome,
} from "@/core/ports/AuthService";

export type FakeUser = {
  email: string;
  password: string;
  /** A stack with `enable_confirmations = true` refuses sign-in until true. */
  confirmed: boolean;
};

export type FakeAuthServiceOptions = {
  /** Accounts that already exist before the first call. */
  users?: FakeUser[];
  /** Matches the local stack's `enable_confirmations`; defaults to `true`. */
  confirmationsRequired?: boolean;
};

/**
 * In-memory auth for tests that should not need Docker.
 *
 * Models the rules the port promises — one message for a wrong password and an
 * unknown address, an unconfirmed account refused before its password is even
 * checked, a confirmation token that works once — and nothing else. It cannot
 * model cookies or token signatures; those are the proxy's job and are checked
 * against the real stack instead.
 *
 * Ids are `fake:<email>` so a test can assert an identity without decoding a
 * JWT; the Supabase adapter's ids come from `claims.sub`.
 */
export class FakeAuthService implements AuthService {
  private readonly users = new Map<string, FakeUser>();
  private readonly confirmationsRequired: boolean;
  /** token hash -> address, one live token per unconfirmed signup. */
  private readonly pending = new Map<string, string>();
  private current: AuthIdentity | null = null;

  constructor({ users = [], confirmationsRequired = true }: FakeAuthServiceOptions = {}) {
    this.confirmationsRequired = confirmationsRequired;
    users.forEach((user) => this.users.set(user.email, { ...user }));
  }

  async signUp({ email, password }: SignUpInput): Promise<Result<SignUpOutcome>> {
    const invalid = rejectBlank("signUp", { email, password });
    if (invalid) return invalid;

    if (this.users.has(email)) {
      return err({
        kind: "conflict",
        message: `signUp: ${email} already has an account`,
      });
    }

    this.users.set(email, {
      email,
      password,
      confirmed: !this.confirmationsRequired,
    });

    if (!this.confirmationsRequired) {
      this.current = identityFor(email);
      return ok({ requiresEmailConfirmation: false });
    }

    this.pending.set(tokenFor(email), email);
    return ok({ requiresEmailConfirmation: true });
  }

  async confirmEmail({ tokenHash, type }: ConfirmEmailInput): Promise<Result<AuthIdentity>> {
    if (tokenHash.trim() === "") {
      return err({ kind: "validation", message: "confirmEmail: the token hash is empty" });
    }

    const email = this.pending.get(tokenHash);
    const user = email ? this.users.get(email) : undefined;
    if (!email || !user) {
      return err({
        kind: "not_found",
        message: `confirmEmail: no live ${type} token matches this link`,
      });
    }

    user.confirmed = true;
    this.pending.delete(tokenHash);
    const identity = identityFor(email);
    this.current = identity;
    return ok(identity);
  }

  async signIn({ email, password }: SignInInput): Promise<Result<AuthIdentity>> {
    const invalid = rejectBlank("signIn", { email, password });
    if (invalid) return invalid;

    const user = this.users.get(email);
    // One answer for both, so no copy can reveal which address is registered.
    if (!user || user.password !== password) {
      return err({
        kind: "invalid_credentials",
        message: `signIn: the email and password do not match an account`,
      });
    }

    if (this.confirmationsRequired && !user.confirmed) {
      return err({
        kind: "email_unconfirmed",
        message: `signIn: ${email} has not confirmed the address yet`,
      });
    }

    const identity = identityFor(email);
    this.current = identity;
    return ok(identity);
  }

  async signOut(): Promise<Result<void>> {
    this.current = null;
    return ok(undefined);
  }

  async getCurrentUser(): Promise<Result<AuthIdentity | null>> {
    return ok(this.current ? { ...this.current } : null);
  }

  /**
   * The hash a confirmation email would carry for `email`. A test passes it to
   * `confirmEmail`; it exists only so the token does not have to be guessed.
   */
  confirmationTokenFor(email: string): string | undefined {
    const token = tokenFor(email);
    return this.pending.has(token) ? token : undefined;
  }
}

function identityFor(email: string): AuthIdentity {
  return { id: `fake:${email}`, email };
}

function tokenFor(email: string): string {
  return `fake-token:${email}`;
}

/** Local guard, so a blank field costs no work and returns the same kind everywhere. */
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
