/**
 * Who is signed in, as far as the rest of the app needs to know.
 *
 * `id` is the subject claim (`claims.sub`) of the verified token. A claims
 * object has no `.id`; reading one is the trap recorded in
 * docs/research/supabase-ssr-nextjs16.md.
 */
export type AuthIdentity = {
  id: string;
  email: string | null;
};
