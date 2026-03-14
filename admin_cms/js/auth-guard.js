import { initSupabase } from '../supabase-client.js';

const supabase = await initSupabase();
const { data: { session } } = await supabase.auth.getSession();

if (!session || !session.user) {
  window.location.replace('/admin_cms/index.html');
  // Throwing string stops further execution in this module context
  throw 'Not authenticated';
}

window.__adminUser = session.user;

supabase.auth.onAuthStateChange((event, newSession) => {
  if (event === 'SIGNED_OUT' || !newSession) {
    window.location.replace('/admin_cms/index.html');
  }
});

// Create and inject user profile & logout button
function injectUserProfile() {
  const user = window.__adminUser;
  if (!user) return;
  
  const sidebarWidget = document.getElementById('user-profile-widget');
  
  if (sidebarWidget) {
    if (sidebarWidget.dataset.injected) return; // Prevent double injection
    sidebarWidget.dataset.injected = "true";
    
    // Inject neatly into the new sidebar block
    const userLabel = document.createElement('div');
    userLabel.textContent = 'المستخدم:';
    userLabel.style.fontWeight = '700';
    userLabel.style.fontSize = '0.9rem';
    userLabel.style.color = 'var(--secondary-color)';
    userLabel.style.marginBottom = '4px';

    const emailSpan = document.createElement('div');
    emailSpan.textContent = user.email;
    emailSpan.className = 'user-email';
    emailSpan.style.direction = 'ltr'; // Ensure emails format correctly
    
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn';
    logoutBtn.style.marginTop = '8px';
    logoutBtn.style.background = '#fff'; // match screenshot look
    logoutBtn.innerHTML = 'تسجيل الخروج';
    logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.replace('/admin_cms/index.html');
    });

    sidebarWidget.appendChild(userLabel);
    sidebarWidget.appendChild(emailSpan);
    sidebarWidget.appendChild(logoutBtn);

  } else {
    // If widget isn't found right away, wait a bit and try again (DOM might still be parsing)
    if (!document.body) return; // Wait for body
    
    // Fallback for editor.html and others
    const existingBar = document.getElementById('fallback-profile-bar');
    if (existingBar) return;
    
    const profileDiv = document.createElement('div');
    profileDiv.style.display = 'flex';
    profileDiv.style.alignItems = 'center';
    profileDiv.style.gap = '8px';
    
    const avatar = document.createElement('div');
    avatar.style.width = '36px';
    avatar.style.height = '36px';
    avatar.style.borderRadius = '50%';
    avatar.style.background = 'var(--primary-color)';
    avatar.style.color = '#fff';
    avatar.style.display = 'flex';
    avatar.style.alignItems = 'center';
    avatar.style.justifyContent = 'center';
    avatar.style.fontWeight = 'bold';
    avatar.style.fontSize = '14px';
    avatar.textContent = user.email.charAt(0).toUpperCase();
    
    const emailSpan = document.createElement('span');
    emailSpan.textContent = user.email;
    emailSpan.className = 'muted';
    emailSpan.style.margin = '0';
    emailSpan.style.fontSize = '0.9rem';
    
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn';
    logoutBtn.textContent = 'تسجيل الخروج';
    logoutBtn.style.padding = '6px 12px';
    logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.replace('/admin_cms/index.html');
    });
    
    profileDiv.appendChild(avatar);
    profileDiv.appendChild(emailSpan);
    profileDiv.appendChild(logoutBtn);

    const bar = document.createElement('div');
    bar.id = 'fallback-profile-bar';
    bar.style.display = 'flex';
    bar.style.justifyContent = 'flex-start';
    bar.style.padding = '12px 16px';
    bar.style.maxWidth = '1200px';
    bar.style.margin = '0 auto';
    bar.appendChild(profileDiv);
    document.body.insertBefore(bar, document.body.firstChild);
  }
}

// Ensure execution across different load states
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectUserProfile);
} else {
  injectUserProfile();
}

// Fallback interval just in case widget element loads late via a defer/async pipeline
const injectionInterval = setInterval(() => {
  const widget = document.getElementById('user-profile-widget');
  const fallback = document.getElementById('fallback-profile-bar');
  if ((widget && widget.dataset.injected) || fallback) {
    clearInterval(injectionInterval);
  } else {
    injectUserProfile();
  }
}, 300);
