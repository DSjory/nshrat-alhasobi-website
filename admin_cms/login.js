import { initSupabase } from './supabase-client.js';

const loginForm = document.getElementById('login-form');
const msg = document.getElementById('login-msg');
const btn = document.getElementById('btn-login');

await initSupabase();

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  msg.classList.remove('error');
  msg.textContent = 'جاري تسجيل الدخول…';
  btn.disabled = true; btn.classList.add('loading');

  try {
    const { error } = await window.supabase.auth.signInWithPassword({ email, password });
    if (error) {
      msg.classList.add('error');
      msg.textContent = error.message || 'تعذر تسجيل الدخول';
      btn.disabled = false; btn.classList.remove('loading');
      return;
    }
    msg.textContent = 'تم بنجاح. جاري التحويل…';
    window.location.href = '/admin_cms/dashboard.html';
  } catch (err) {
    msg.classList.add('error');
    msg.textContent = err.message || 'خطأ غير متوقع';
    btn.disabled = false; btn.classList.remove('loading');
  }
});
