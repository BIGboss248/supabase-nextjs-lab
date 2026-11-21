import type { Metadata } from "next";

import { ClientSignInForm } from "@/components/auth/ClientSignInForm";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function SignInPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <ClientSignInForm />
    </div>
  );
}
