// Join Form Submission Handler
// This script handles the recruitment form submission to Supabase

(function() {
  // Load Supabase credentials from environment or window globals
  // Priority: 1) window.__SUPABASE_URL/KEY, 2) imported env vars
  const supabaseUrl = window.__SUPABASE_URL || 'https://txldnqhqsgtqttpzbkeq.supabase.co';
  const supabaseAnonKey = window.__SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4bGRucWhxc2d0cXR0cHpia2VxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4ODAxNDksImV4cCI6MjA3OTQ1NjE0OX0.HfTR4pvi8dxar-_oCwd0ngAqnC3--6ypeZip8rm0Ebw';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('Supabase client library not found. Ensure @supabase/supabase-js is loaded from CDN.');
    return;
  }

  const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  const form = document.querySelector('.recruitment-form');

  if (!form) {
    console.warn('Recruitment form not found on page.');
    return;
  }

  /**
   * Helper: Convert checkbox inputs to arrays
   * @param {string} name - The name attribute of checkboxes
   * @returns {string[]} Array of checked values
   */
  function checkboxesToArray(name) {
    return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`))
      .map(input => input.value);
  }

  /**
   * Show toast notification
   * @param {string} message - Message to display
   * @param {string} type - 'success' or 'error'
   */
  function showToast(message, type = 'success') {
    let container = document.getElementById('join-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'join-toast-container';
      container.style.cssText = 'position: fixed; bottom: 20px; left: 20px; z-index: 9999;';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-weight: 500;
      animation: slideIn 0.3s ease-out;
    `;

    if (type === 'error') {
      toast.style.cssText += 'background-color: #fee; color: #c33;';
    } else {
      toast.style.cssText += 'background-color: #efe; color: #3c3;';
    }

    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  /**
   * Show success modal
   */
  function showSuccessModal() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 28px;
      max-width: 480px;
      width: 90%;
      text-align: right;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    `;

    const title = document.createElement('h3');
    title.textContent = 'تم إرسال طلبك بنجاح 🎉';
    title.style.cssText = 'margin-bottom: 12px; color: #1a1a1a; font-size: 20px;';

    const message = document.createElement('p');
    message.textContent = 'شكراً لاهتمامك بالانضمام لفريق نشرة الحاسوبي! سيتم مراجعة طلبك وسنتواصل معك قريباً عبر البريد الإلكتروني.';
    message.style.cssText = 'margin-bottom: 20px; color: #666; line-height: 1.6;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'حسناً';
    closeBtn.style.cssText = `
      background-color: #0066cc;
      color: white;
      border: none;
      padding: 10px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 16px;
    `;

    closeBtn.addEventListener('click', () => overlay.remove());
    closeBtn.addEventListener('mouseover', () => {
      closeBtn.style.backgroundColor = '#0052a3';
    });
    closeBtn.addEventListener('mouseout', () => {
      closeBtn.style.backgroundColor = '#0066cc';
    });

    modal.appendChild(title);
    modal.appendChild(message);
    modal.appendChild(closeBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  /**
   * Validate form fields before submission
   * @returns {boolean} True if form is valid
   */
  function validateForm() {
    const requiredFields = ['full_name', 'phone_number', 'email', 'club_member', 'committee', 'tech_interest', 'read_newsletter', 'motivation'];
    const fieldLabels = {
      full_name: 'الاسم الثلاثي',
      phone_number: 'رقم الجوال',
      email: 'البريد الإلكتروني',
      club_member: 'عضوية النادي',
      committee: 'اللجنة',
      tech_interest: 'مدى الاهتمام بالتقنية',
      read_newsletter: 'متابعة النشرات',
      motivation: 'دافع الانضمام'
    };
    for (const field of requiredFields) {
      const value = form.elements[field]?.value || form.querySelector(`input[name="${field}"]:checked`)?.value;
      if (!value || !value.trim()) {
        const label = fieldLabels[field] || field;
        showToast(`يرجى ملء الحقل المطلوب: ${label}`, 'error');
        return false;
      }
    }
    return true;
  }

  // Form submission handler
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate form
    if (!validateForm()) return;

    // Disable submit button during submission
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري الإرسال...';

    try {
      // Collect form data
      const formData = new FormData(form);
      const payload = {
        name: formData.get('full_name') || null,
        phone: formData.get('phone_number') || null,
        email: formData.get('email') || null,
        club_member: formData.get('club_member') || null,
        committee: formData.get('committee') || null,
        tech_interest: formData.get('tech_interest') || null,
        read_newsletter: formData.get('read_newsletter') || null,
        attraction: checkboxesToArray('attraction[]'),
        skills: checkboxesToArray('skills[]'),
        commitment: formData.get('commitment') || null,
        motivation: formData.get('motivation') || null,
        tech_field: formData.get('tech_field') || null,
        suggestion: formData.get('suggestion') || null,
      };

      // Log payload for debugging (remove in production)
      console.log('Submitting join request:', payload);

      // Insert into Supabase
      const { data, error } = await supabaseClient
        .from('join_requests')
        .insert([payload])
        .select();

      if (error) {
        console.error('Supabase error:', error);
        showToast(`حدث خطأ: ${error.message || 'فشل إرسال الطلب'}`, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        return;
      }

      // Success!
      showSuccessModal();
      form.reset();
    } catch (err) {
      console.error('Unexpected error:', err);
      showToast('تعذر الاتصال بالخادم. يرجى المحاولة لاحقاً.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });

  console.log('Join form handler initialized successfully');
})();
