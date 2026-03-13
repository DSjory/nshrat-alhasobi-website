import { initSupabase } from './supabase-client.js';

const loginForm = document.getElementById('login-form');
const msg = document.getElementById('login-msg');

await initSupabase();

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  msg.textContent = 'جاري تسجيل الدخول…';

  try {
    const { error } = await window.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      msg.textContent = error.message;
      return;
    }
    msg.textContent = '';
    window.location.href = '/admin_cms/dashboard.html';
  } catch (err) {
    msg.textContent = err.message || 'خطأ غير متوقع';
  }
});
