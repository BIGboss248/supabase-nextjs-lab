import type { Metadata } from "next";

import { ClientSignUpForm } from "@/components/auth/ClientSignUpForm";

export const metadata: Metadata = {
  title: "Sign up",
};

export default function SignUpPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign up</h1>
      <ClientSignUpForm />
    </div>
  );
}
