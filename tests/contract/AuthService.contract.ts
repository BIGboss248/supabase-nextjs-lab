import type { AuthService } from "@/core/ports/AuthService";

/**
 * One suite, two implementations.
 *
 * Anything asserted here must hold for the fake and for GoTrue. What cannot be
 * asserted here is named instead of pretended away:
 *
 * - The session cookie. It is written by a cookie adapter the suite does not
 *   build, so "signing in sets `sb-*`" is checked in the running app, not here.
 * - Email delivery and the confirmation link. The token only exists in Mailpit,
 *   so the fake suite carries that loop and Phase 5's full loop proves the real
 *   one.
 * - Token signatures and expiry: the adapter never inspects a token itself.
 */
export type AuthServiceContractOptions = {
  createService: () => Promise<AuthService>;
  /** A fresh address per call, so repeated runs never collide. */
  freshEmail: () => string;
  password?: string;
};

export function describeAuthServiceContract(
  name: string,
  { createService, freshEmail, password = "lab-password-1" }: AuthServiceContractOptions,
): void {
  describe(`${name} satisfies the AuthService contract`, () => {
    it("reports a signed-out visitor as ok(null), not as a failure", async () => {
      const auth = await createService();

      await expect(auth.getCurrentUser()).resolves.toEqual({ ok: true, data: null });
    });

    it("signs up a fresh address, and only signs in when no confirmation is due", async () => {
      const auth = await createService();
      const email = freshEmail();

      const result = await auth.signUp({ email, password });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const current = await auth.getCurrentUser();
      expect(current.ok).toBe(true);
      if (!current.ok) return;

      if (result.data.requiresEmailConfirmation) {
        expect(current.data).toBeNull();
      } else {
        expect(current.data).toEqual({ id: expect.any(String), email });
      }
    });

    it("reports conflict for an address that already signed up", async () => {
      const auth = await createService();
      const email = freshEmail();
      const first = await auth.signUp({ email, password });
      expect(first.ok).toBe(true);

      const second = await auth.signUp({ email, password });

      expect(second.ok).toBe(false);
      if (second.ok) return;
      expect(second.error.kind).toBe("conflict");
    });

    it("refuses an unknown address with invalid_credentials", async () => {
      const auth = await createService();

      const result = await auth.signIn({ email: freshEmail(), password });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("invalid_credentials");
    });

    it("refuses a wrong password with the same kind as an unknown address", async () => {
      const auth = await createService();
      const email = freshEmail();
      expect((await auth.signUp({ email, password })).ok).toBe(true);

      const result = await auth.signIn({ email, password: `${password}-wrong` });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("invalid_credentials");
    });

    it("treats signing out without a session as the state the caller wanted", async () => {
      const auth = await createService();

      await expect(auth.signOut()).resolves.toEqual({ ok: true, data: undefined });
    });

    it("refuses a confirmation link whose token matches nothing", async () => {
      const auth = await createService();

      const result = await auth.confirmEmail({
        tokenHash: "00000000-0000-0000-0000-000000000000",
        type: "email",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("not_found");
    });

    it("rejects a blank confirmation token as validation, before any call", async () => {
      const auth = await createService();

      const result = await auth.confirmEmail({ tokenHash: "   ", type: "email" });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("validation");
    });

    it("rejects a blank email as validation, before any call", async () => {
      const auth = await createService();

      const result = await auth.signIn({ email: "   ", password });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("validation");
    });

    it("rejects a blank password as validation, before any call", async () => {
      const auth = await createService();

      const result = await auth.signIn({ email: freshEmail(), password: "" });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.kind).toBe("validation");
    });
  });
}
