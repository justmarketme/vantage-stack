/**
 * Optional: mirror user into Supabase Auth (same password at creation) for future IdP features.
 */
export async function supabaseAdminCreateUser(input: {
  email: string;
  password: string;
  username: string;
  role: string;
}): Promise<{ id: string } | null> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !service) return null;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: false,
      user_metadata: { username: input.username, role: input.role },
    });
    if (error || !data.user?.id) {
      console.warn("[supabase-user]", error?.message ?? "no user id");
      return null;
    }
    return { id: data.user.id };
  } catch (e) {
    console.warn("[supabase-user]", e instanceof Error ? e.message : e);
    return null;
  }
}
