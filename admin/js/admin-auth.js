// admin/js/admin-auth.js
// Shared admin authentication guard.
// Usage: await requireAdminAuth();

export async function requireAdminAuth() {
  const { data: { session }, error } = await window.supabase.auth.getSession();
  if (error || !session) {
    // AGENT DECISION: redirect target — this project does not have an /admin/login.html
    // file in the repo, so redirecting to /admin/ for now.
    window.location.href = '/admin/';
    throw new Error('Not authenticated — redirecting');
  }
  return session;
}
