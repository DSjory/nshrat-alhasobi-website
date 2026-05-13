// admin_cms/js/auth-guard.js
// Guards every admin page: redirects to login if no session, exposes the
// signed-in user, and injects the sidebar profile widget.

import { initSupabase } from '../supabase-client.js';

const supabase = await initSupabase();
const { data: { session } } = await supabase.auth.getSession();

if (!session || !session.user) {
  window.location.replace('/admin_cms/index.html');
  throw 'Not authenticated';
}

window.__adminUser = session.user;

supabase.auth.onAuthStateChange((event, newSession) => {
  if (event === 'SIGNED_OUT' || !newSession) {
    window.location.replace('/admin_cms/index.html');
  }
});

/* ─── Sidebar profile widget ──────────────────────────────────────────────── */
function injectUserProfile() {
  const user = window.__adminUser;
  if (!user) return;

  const widget = document.getElementById('user-profile-widget');
  if (widget) {
    if (widget.dataset.injected) return;
    widget.dataset.injected = 'true';

    const label = document.createElement('div');
    label.className = 'label';
    label.style.marginBottom = '4px';
    label.textContent = 'المستخدم:';

    const email = document.createElement('div');
    email.className = 'user-email';
    email.textContent = user.email;

    const logout = document.createElement('button');
    logout.className = 'btn btn-block';
    logout.textContent = 'تسجيل الخروج';
    logout.style.marginTop = '8px';
    logout.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.replace('/admin_cms/index.html');
    });

    widget.append(label, email, logout);
    return;
  }

  // Fallback for pages without the widget element
  if (document.getElementById('fallback-profile-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'fallback-profile-bar';
  bar.className = 'admin-wrapper';
  bar.style.cssText = 'padding: 12px 16px; display:flex; justify-content:flex-end; gap:12px; align-items:center;';

  const avatar = document.createElement('div');
  avatar.style.cssText = 'width:36px;height:36px;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;';
  avatar.textContent = user.email.charAt(0).toUpperCase();

  const emailSpan = document.createElement('span');
  emailSpan.className = 'muted';
  emailSpan.style.direction = 'ltr';
  emailSpan.textContent = user.email;

  const logout = document.createElement('button');
  logout.className = 'btn btn-sm';
  logout.textContent = 'تسجيل الخروج';
  logout.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.replace('/admin_cms/index.html');
  });

  bar.append(avatar, emailSpan, logout);
  document.body.insertBefore(bar, document.body.firstChild);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectUserProfile);
} else {
  injectUserProfile();
}

// Retry until the widget element is in the DOM (other scripts may add it late)
const interval = setInterval(() => {
  const widget = document.getElementById('user-profile-widget');
  const fallback = document.getElementById('fallback-profile-bar');
  if ((widget && widget.dataset.injected) || fallback) clearInterval(interval);
  else injectUserProfile();
}, 300);
