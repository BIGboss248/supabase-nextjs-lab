import { FakeAuthService } from "@/adapters/fake/AuthService";

import { describeAuthServiceContract } from "./AuthService.contract";

/**
 * The fake half of the contract, plus the loop only an in-memory service can
 * run: sign up, read the token, confirm, land signed in.
 *
 * `confirmationsRequired: true` matches the local stack once Phase 5 sets
 * `enable_confirmations = true` in `supabase/config.toml`.
 */
let counter = 0;

describeAuthServiceContract("FakeAuthService", {
  createService: async () => new FakeAuthService({ confirmationsRequired: true }),
  freshEmail: () => `contract-${++counter}@example.test`,
});

describe("FakeAuthService confirmation loop", () => {
  const password = "lab-password-1";

  it("names a duplicate sign-up a conflict", async () => {
    const auth = new FakeAuthService({ confirmationsRequired: true });
    const email = "twice@example.test";
    await auth.signUp({ email, password });

    const second = await auth.signUp({ email, password });

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.kind).toBe("conflict");
  });

  it("refuses sign-in until the address is confirmed, then returns the identity", async () => {
    const auth = new FakeAuthService({ confirmationsRequired: true });
    const email = "confirm-me@example.test";
    expect(await auth.signUp({ email, password })).toEqual({
      ok: true,
      data: { requiresEmailConfirmation: true },
    });

    const before = await auth.signIn({ email, password });
    expect(before.ok).toBe(false);
    if (before.ok) return;
    expect(before.error.kind).toBe("email_unconfirmed");

    const token = auth.confirmationTokenFor(email);
    expect(token).toBeDefined();

    const confirmed = await auth.confirmEmail({ tokenHash: token!, type: "email" });
    expect(confirmed).toEqual({
      ok: true,
      data: { id: `fake:${email}`, email },
    });

    await expect(auth.getCurrentUser()).resolves.toEqual(confirmed);
    await expect(auth.signIn({ email, password })).resolves.toEqual(confirmed);
  });

  it("spends a confirmation token once", async () => {
    const auth = new FakeAuthService({ confirmationsRequired: true });
    const email = "one-shot@example.test";
    await auth.signUp({ email, password });
    const token = auth.confirmationTokenFor(email)!;
    expect((await auth.confirmEmail({ tokenHash: token, type: "email" })).ok).toBe(true);

    const reuse = await auth.confirmEmail({ tokenHash: token, type: "email" });

    expect(reuse.ok).toBe(false);
    if (reuse.ok) return;
    expect(reuse.error.kind).toBe("not_found");
  });

  it("signs the visitor in on sign-up when confirmations are off", async () => {
    const auth = new FakeAuthService({ confirmationsRequired: false });
    const email = "instant@example.test";

    expect(await auth.signUp({ email, password })).toEqual({
      ok: true,
      data: { requiresEmailConfirmation: false },
    });
    await expect(auth.getCurrentUser()).resolves.toEqual({
      ok: true,
      data: { id: `fake:${email}`, email },
    });
  });
});
