import { signOutAction } from "@/app/auth/AuthActions";

/**
 * Sign-out is a form, so it works with JavaScript still loading: the action
 * clears the cookies on the server and lands on `/`. It needs no client state,
 * which is why it is a Server Component.
 */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button type="submit" className="font-medium underline">
        Sign out
      </button>
    </form>
  );
}
