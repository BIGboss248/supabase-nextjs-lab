/**
 * What a failure is, independent of who produced it.
 *
 * Nine cases, from #3 Define the port signatures and error taxonomy. The
 * adapter maps a provider error onto one of these; the interface maps the case
 * onto visitor copy. Two consequences worth keeping:
 *
 * - `invalid_credentials` covers a wrong password and an unknown email
 *   together, so no copy can reveal which one happened.
 * - `unknown` is the sentinel that lets a failure path return a value instead
 *   of throwing.
 */
export type AppErrorKind =
  | "validation"
  | "not_found"
  | "out_of_stock"
  | "unauthorized"
  | "invalid_credentials"
  | "email_unconfirmed"
  | "conflict"
  | "unavailable"
  | "unknown";

export type AppError = {
  kind: AppErrorKind;
  /** Diagnostic text for logs. Never rendered. */
  message: string;
  /** Provider wording, kept for logs so debugging does not need a repro. */
  cause?: string;
};
