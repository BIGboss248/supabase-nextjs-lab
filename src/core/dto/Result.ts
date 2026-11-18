import type { AppError } from "./AppError";

/**
 * Every boundary in this app returns one of these instead of throwing.
 *
 * `ok` and `err` exist so no caller writes the union literal by hand, and so a
 * success can never be confused with the absence of a value.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T = never>(error: AppError): Result<T> {
  return { ok: false, error };
}
