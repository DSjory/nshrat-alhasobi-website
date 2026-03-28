import { initSupabase, reinitSupabase, uploadFileWithProgress } from './supabase-client.js';
import { showToast, showConfirm } from './ui.js';

await initSupabase();
let supabase = window.supabase;

// use UI utilities (showToast returns a handle)

function setLoading(el, isLoading){ if (!el) return; el.disabled = isLoading; if (isLoading) el.classList.add('loading'); else el.classList.remove('loading'); }

// DOM refs
const params = new URLSearchParams(window.location.search);
const newsletterId = params.get('id');
const titleAr = document.getElementById('title-ar');
const titleEn = document.getElementById('title-en');
const edition = document.getElementById('edition');
const issueDate = document.getElementById('issue-date');
const readingTime = document.getElementById('reading-time');
const readingTimeEn = document.getElementById('reading-time-en');
const welcomeMessage = document.getElementById('welcome-message');
const welcomeMessageEn = document.getElementById('welcome-message-en');
const hasTranslation = document.getElementById('has-translation');
const categorySel = document.getElementById('category');
const coverFile = document.getElementById('cover-file');
const coverPreview = document.getElementById('cover-preview');
const coverStatus = document.getElementById('cover-status');
const isPublished = document.getElementById('is-published');
const saveMetaBtn = document.getElementById('save-meta');
const deleteNewsBtn = document.getElementById('delete-news');
const addSectionType = document.getElementById('add-section-type');
const btnAddSection = document.getElementById('btn-add-section');
const sectionsDiv = document.getElementById('sections');
const sectionEditorArea = document.getElementById('section-editor-area');
const publishAllBtn = document.getElementById('publish-all');

let categoriesCache = [];
let sectionTypes = [];
let newsletter = null;
let newsletterSections = [];

function toggleTranslationFields(showEnglish) {
  document.querySelectorAll('.english-only').forEach((el) => {
    el.style.display = showEnglish ? '' : 'none';
  });
}

async function init(){
  // Reinitialize early so subsequent queries use the freshest schema metadata.
  supabase = await reinitSupabase();
  toggleTranslationFields(false);
  await loadSectionTypes();
  await loadCategories();
  if (newsletterId) await loadNewsletter(newsletterId);
}

async function loadSectionTypes(){
  try{
    const { data, error } = await supabase.from('section_types').select('*').order('sort_order', {ascending:true});
    if (error) throw error; sectionTypes = data || [];
    addSectionType.innerHTML = '';
    sectionTypes.forEach(st=> addSectionType.append(new Option(`${st.icon || ''} ${st.name_ar}`, st.id)));
  }catch(e){ console.error(e); showToast('فشل في جلب أنواع الأقسام','error'); }
}

async function loadCategories(){
  try{
    const { data, error } = await supabase.from('categories').select('*').order('created_at',{ascending:true});
    if (error) throw error; categoriesCache = data || [];
    categorySel.innerHTML = '<option value="">-- اختر --</option>';
    categoriesCache.forEach(c=> categorySel.append(new Option(c.name_ar || c.name_en, c.id)));
  }catch(e){ console.error(e); }
}

async function loadNewsletter(id){
  try{
    const { data, error } = await supabase.from('newsletters').select('*').eq('id', id).maybeSingle();
    if (error) throw error; newsletter = data;
    if (!newsletter) return showToast('العدد غير موجود','error');
    titleAr.value = newsletter.title_ar || '';
    titleEn.value = newsletter.title_en || '';
    edition.value = newsletter.edition_number || '';
    issueDate.value = newsletter.issue_date || '';
    readingTime.value = newsletter.reading_time || '';
    readingTimeEn.value = newsletter.reading_time_en || '';
    welcomeMessage.value = newsletter.welcome_message || 'اهلا بك في نشرة الحاسوبي';
    welcomeMessageEn.value = newsletter.welcome_message_en || '';
    hasTranslation.checked = newsletter.has_translation || false;
    toggleTranslationFields(hasTranslation.checked);
    isPublished.checked = newsletter.status === 'published';
    if (newsletter.category_id) categorySel.value = newsletter.category_id;
    if (newsletter.cover_image_url) {
      coverPreview.innerHTML = `<img src="${newsletter.cover_image_url}" style="max-width:260px;display:block">`;
      coverStatus.textContent = 'تم العثور على صورة غلاف محفوظة';
    } else {
      coverPreview.innerHTML = '<p class="muted">لا توجد صورة غلاف حالياً</p>';
      coverStatus.textContent = '';
    }
    await loadNewsletterSections(id);
  }catch(e){ console.error(e); showToast('فشل جلب بيانات النشرة','error'); }
}

async function loadNewsletterSections(nlId){
  try{
    const { data, error } = await supabase.from('newsletter_sections').select('*, section_types(*)').eq('newsletter_id', nlId).order('sort_order', {ascending:true});
    if (error) throw error; newsletterSections = data || [];
    renderSectionsList();
  }catch(e){ console.error(e); }
}

function renderSectionsList(){
  sectionsDiv.innerHTML = '';
  newsletterSections.forEach(s=>{
    const el = document.createElement('div'); el.className='section-item'; el.draggable = true; el.dataset.sid = s.id;
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between"><div><strong>${s.section_types?.name_ar || s.section_type_id}</strong> <div class='muted' style='font-size:12px'>visible: ${s.is_visible}</div></div><div style='display:flex;align-items:center'><span class='drag-handle'>≡</span></div></div>`;
    const right = document.createElement('div');
    const edit = document.createElement('button'); edit.textContent='تحرير'; edit.className='btn'; edit.addEventListener('click', ()=> openSectionEditor(s));
    const rm = document.createElement('button'); rm.textContent='حذف'; rm.className='btn'; rm.addEventListener('click', async ()=>{
      const ok = await showConfirm('حذف القسم؟'); if (!ok) return;
      const { error } = await supabase.from('newsletter_sections').delete().eq('id', s.id);
      if (error) return showToast(error.message,'error');
      await loadNewsletterSections(newsletter.id);
      showToast('تم حذف القسم');
    });
    right.append(edit, rm);
    el.appendChild(right);
    // drag handlers
    el.addEventListener('dragstart', (ev)=>{
      ev.dataTransfer.setData('text/section-id', String(s.id));
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', ()=> el.classList.remove('dragging'));
    el.addEventListener('dragover', (ev)=>{ ev.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', ()=> el.classList.remove('drag-over'));
    el.addEventListener('drop', async (ev)=>{
      ev.preventDefault(); el.classList.remove('drag-over');
      const draggedId = ev.dataTransfer.getData('text/section-id');
      if (!draggedId || draggedId === String(s.id)) return;
      // reorder in memory
      const fromIdx = newsletterSections.findIndex(x=>String(x.id)===draggedId);
      const toIdx = newsletterSections.findIndex(x=>x.id===s.id);
      if (fromIdx === -1 || toIdx === -1) return;
      const [item] = newsletterSections.splice(fromIdx,1);
      newsletterSections.splice(toIdx,0,item);
      // persist new sort_order
      await persistSectionOrder();
      renderSectionsList();
      showToast('تم إعادة ترتيب الأقسام');
    });
    sectionsDiv.appendChild(el);
  });
}

async function persistSectionOrder(){
  // update sort_order for all sections in the current newsletterSections array
  try{
    for (let i=0;i<newsletterSections.length;i++){
      const s = newsletterSections[i];
      await supabase.from('newsletter_sections').update({ sort_order: i+1 }).eq('id', s.id);
    }
  }catch(e){ console.error('persistSectionOrder', e); showToast('فشل حفظ ترتيب الأقسام','error'); }
}

btnAddSection.addEventListener('click', async ()=>{
  const stId = addSectionType.value; if (!stId) return showToast('اختر نوع القسم','error');
  if (!newsletter || !newsletter.id) return showToast('احفظ بيانات النشرة أولاً','error');
  try{
    const payload = { newsletter_id: newsletter.id, section_type_id: stId, is_visible: true, sort_order: (newsletterSections.length||0)+1 };
    const { data, error } = await supabase.from('newsletter_sections').insert(payload).select().maybeSingle();
    if (error) throw error;
    await loadNewsletterSections(newsletter.id);
    showToast('تم إضافة القسم');
  }catch(e){ showToast(e.message || 'خطأ','error'); }
});

async function openSectionEditor(section){
  sectionEditorArea.innerHTML = '';
  const container = document.createElement('div'); container.style.marginTop='12px';
  container.className = 'newsletter-card';
  const h = document.createElement('h4'); h.textContent = `تحرير: ${section.section_types?.name_ar || ''}`; container.append(h);
  const slug = section.section_types?.slug;
  const sectionName = section.section_types?.name_ar || 'غير معروف';
  const sectionIcon = section.section_types?.icon || '📌';

  async function saveSectionHeaderMeta(fields) {
    const { error } = await supabase
      .from('newsletter_sections')
      .update(fields)
      .eq('id', section.id);

    if (!error) return;
    if (error.code !== '42703') throw error;

    // Compatibility fallback when newsletter_sections header columns do not exist yet.
    let legacyTable = null;
    if (slug === 'illumination') legacyTable = 'section_illumination';
    else if (slug === 'inspiring') legacyTable = 'section_inspiring';
    else if (slug === 'translation') legacyTable = 'section_translation';

    if (!legacyTable) {
      throw new Error('هذا القسم يتطلب تحديث قاعدة البيانات لحفظ صورة الهيدر.');
    }

    const legacyPayload = {};
    if (Object.prototype.hasOwnProperty.call(fields, 'header_image_url')) {
      legacyPayload.header_image_url = fields.header_image_url;
    }

    const { data: existing, error: findError } = await supabase
      .from(legacyTable)
      .select('id')
      .eq('newsletter_section_id', section.id)
      .maybeSingle();
    if (findError) throw findError;

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from(legacyTable)
        .update(legacyPayload)
        .eq('id', existing.id);
      if (updateError) throw updateError;
      return;
    }

    const { error: insertError } = await supabase
      .from(legacyTable)
      .insert({ newsletter_section_id: section.id, ...legacyPayload });
    if (insertError) throw insertError;
  }

  // common controls
  const visLabel = document.createElement('label'); visLabel.innerHTML = `<input type='checkbox' ${section.is_visible ? 'checked' : ''}> مرئي`; visLabel.style.display='block'; visLabel.style.marginBottom='8px';
  visLabel.querySelector('input').addEventListener('change', async (e)=>{
    const { error } = await supabase.from('newsletter_sections').update({ is_visible: e.target.checked }).eq('id', section.id);
    if (error) return showToast(error.message,'error'); showToast('تم التحديث'); loadNewsletterSections(newsletter.id);
  });
  container.append(visLabel);

  // Global section header image upload (applies to any section type)
  const headerSection = document.createElement('div');
  headerSection.style.marginBottom = '16px';
  headerSection.style.padding = '8px';
  headerSection.style.backgroundColor = 'rgba(0,0,0,0.02)';
  headerSection.style.borderRadius = '4px';
  
  const headerLabel = document.createElement('label');
  headerLabel.style.display = 'block';
  headerLabel.style.marginBottom = '8px';
  headerLabel.style.fontWeight = '600';
  headerLabel.innerHTML = `<strong>صورة هيدر القسم "${sectionName}" ${sectionIcon}</strong><br><span style="font-weight: normal; font-size: 0.9em; color: #666;">صورة بانر تظهر فوق محتوى هذا القسم</span>`;
  
  const headerFileInput = document.createElement('input');
  headerFileInput.type = 'file';
  headerFileInput.accept = 'image/*';
  headerFileInput.className = 'input';
  headerFileInput.style.marginBottom = '8px';
  
  const headerPreview = document.createElement('div');
  headerPreview.style.marginBottom = '8px';
  if (section.header_image_url) {
    headerPreview.innerHTML = `<img src="${section.header_image_url}" style="max-width: 100%; height: auto; border-radius: 4px; max-height: 200px;">`;
  }

  
  const clearHeaderBtn = document.createElement('button');
  clearHeaderBtn.type = 'button';
  clearHeaderBtn.className = 'btn';
  clearHeaderBtn.textContent = 'حذف الصورة';
  clearHeaderBtn.style.fontSize = '0.85rem';
  clearHeaderBtn.addEventListener('click', async () => {
    try {
      await saveSectionHeaderMeta({ header_image_url: null });
      headerPreview.innerHTML = '';
      headerFileInput.value = '';
      section.header_image_url = null;
      showToast('تم حذف صورة هيدر القسم');
    } catch(e) { showToast(e.message || e, 'error'); }
  });
  
  headerSection.append(headerLabel, headerFileInput, headerPreview, clearHeaderBtn);
  container.append(headerSection);

  // Save section header image when file is selected
  headerFileInput.addEventListener('change', async () => {
    const file = headerFileInput.files?.[0];
    if (!file) return;
    
    try {
      setLoading(headerFileInput, true);
      const prog = document.createElement('progress');
      prog.max = 1;
      prog.value = 0;
      headerPreview.appendChild(prog);
      
      const note = showToast('جاري رفع صورة هيدر القسم…', 'pending', 0);
      const publicUrl = await uploadFileWithProgress(file, `sections/${section.id}`, (r) => {
        if (r >= 0) prog.value = r;
      });
      prog.value = 1;
      note.dismiss();
      
      await saveSectionHeaderMeta({ header_image_url: publicUrl });
      
      // Update section object and preview
      section.header_image_url = publicUrl;
      headerPreview.innerHTML = `<img src="${publicUrl}" style="max-width: 100%; height: auto; border-radius: 4px; max-height: 200px;">`;
      headerFileInput.value = '';
      showToast('تم رفع صورة هيدر القسم بنجاح');
    } catch(e) {
      showToast(e.message || e, 'error');
    } finally {
      setLoading(headerFileInput, false);
    }
  });

  // switch by section type
  if (slug === 'illumination' || slug === 'inspiring'){
    // fetch existing content
    const table = slug === 'illumination' ? 'section_illumination' : 'section_inspiring';
    const { data } = await supabase.from(table).select('*').eq('newsletter_section_id', section.id).maybeSingle();
    const labelAr = document.createElement('label'); labelAr.className = 'label'; labelAr.textContent = 'المحتوى (عربي)';
    const textarea = document.createElement('textarea'); textarea.className='input'; textarea.rows=8; textarea.value = data?.body_ar || '';
    const enWrap = document.createElement('div'); enWrap.className = 'english-only';
    const labelEn = document.createElement('label'); labelEn.className = 'label'; labelEn.textContent = 'المحتوى (EN)';
    const textareaEn = document.createElement('textarea'); textareaEn.className='input'; textareaEn.rows=8; textareaEn.value = data?.body_en || '';
    enWrap.append(labelEn, textareaEn);
    toggleTranslationFields(hasTranslation.checked);
    const saveBtn = document.createElement('button'); saveBtn.className='btn btn-primary'; saveBtn.textContent='حفظ القسم';
    saveBtn.addEventListener('click', async ()=>{
      setLoading(saveBtn, true);
      try{
          // Section banner image is managed once in newsletter_sections (top uploader).
          const payload = { newsletter_section_id: section.id, body_ar: textarea.value, body_en: hasTranslation.checked ? (textareaEn.value || null) : null };
        // upsert: delete existing then insert (simpler)
        if (data) await supabase.from(table).update(payload).eq('id', data.id);
        else await supabase.from(table).insert(payload);
        showToast('تم حفظ القسم');
      }catch(e){ showToast(e.message||e,'error'); }
      setLoading(saveBtn, false);
    });
      container.append(labelAr, textarea, enWrap, saveBtn);
  } else if (slug === 'news'){
    // news items list
    const { data } = await supabase.from('section_news_items').select('*').eq('newsletter_section_id', section.id).order('sort_order',{ascending:true});
    const list = document.createElement('div'); list.className='repeat-list';
    (data||[]).forEach(it=> list.append(createNewsItemRow(it, section)));
    const addBtn = document.createElement('button'); addBtn.textContent = '+ إضافة خبر'; addBtn.className='btn'; addBtn.addEventListener('click', ()=> list.append(createNewsItemRow(null, section)));
    container.append(list, addBtn);
  } else if (slug === 'articles'){
    const { data } = await supabase.from('section_article_items').select('*').eq('newsletter_section_id', section.id).order('sort_order',{ascending:true});
    const list = document.createElement('div'); list.className='repeat-list';
    (data||[]).forEach(it=> list.append(createArticleItemRow(it, section)));
    const addBtn = document.createElement('button'); addBtn.textContent = '+ إضافة مقال'; addBtn.className='btn'; addBtn.addEventListener('click', ()=> list.append(createArticleItemRow(null, section)));
    container.append(list, addBtn);
  } else if (slug === 'podcast'){
    const { data } = await supabase.from('section_podcast').select('*').eq('newsletter_section_id', section.id).maybeSingle();
    const titleArLabel = document.createElement('label'); titleArLabel.className='label'; titleArLabel.textContent='عنوان البودكاست (عربي)';
    const title = document.createElement('input'); title.className='input'; title.value = data?.title_ar || '';
    const titleEnWrap = document.createElement('div'); titleEnWrap.className='english-only';
    const titleEnLabel = document.createElement('label'); titleEnLabel.className='label'; titleEnLabel.textContent='عنوان البودكاست (EN)';
    const titleEn = document.createElement('input'); titleEn.className='input'; titleEn.value = data?.title_en || '';
    titleEnWrap.append(titleEnLabel, titleEn);
    const descArLabel = document.createElement('label'); descArLabel.className='label'; descArLabel.textContent='وصف البودكاست (عربي)';
    const desc = document.createElement('textarea'); desc.className='input'; desc.rows=4; desc.value = data?.description_ar || '';
    const descEnWrap = document.createElement('div'); descEnWrap.className='english-only';
    const descEnLabel = document.createElement('label'); descEnLabel.className='label'; descEnLabel.textContent='وصف البودكاست (EN)';
    const descEn = document.createElement('textarea'); descEn.className='input'; descEn.rows=4; descEn.value = data?.description_en || '';
    descEnWrap.append(descEnLabel, descEn);
    toggleTranslationFields(hasTranslation.checked);
    const audioFile = document.createElement('input'); audioFile.type='file'; audioFile.accept='audio/*';
    const saveBtn = document.createElement('button'); saveBtn.textContent='حفظ'; saveBtn.className='btn btn-primary';
    saveBtn.addEventListener('click', async ()=>{
      setLoading(saveBtn, true);
      try{
        let audioUrl = data?.audio_url || null;
        const f = audioFile.files && audioFile.files[0];
        if (f){
          const prog = document.createElement('progress'); prog.max = 1; prog.value = 0; container.appendChild(prog);
          const note = showToast('جاري رفع ملف الصوت…', 'pending', 0);
          const pub = await uploadFileWithProgress(f, `sections/${section.id}`, (r)=>{ if (r>=0) prog.value = r; });
          prog.value = 1; note.dismiss(); audioUrl = pub;
        }
        const payload = {
          newsletter_section_id: section.id,
          title_ar: title.value,
          title_en: hasTranslation.checked ? (titleEn.value || null) : null,
          description_ar: desc.value,
          description_en: hasTranslation.checked ? (descEn.value || null) : null,
          audio_url: audioUrl
        };
        if (data) await supabase.from('section_podcast').update(payload).eq('id', data.id);
        else await supabase.from('section_podcast').insert(payload);
        showToast('تم حفظ البودكاست');
      }catch(e){ showToast(e.message||e,'error'); }
      setLoading(saveBtn, false);
    });
    container.append(titleArLabel, title, titleEnWrap, descArLabel, desc, descEnWrap, audioFile, saveBtn);
  } else if (slug === 'translation'){
    const { data } = await supabase.from('section_translation').select('*').eq('newsletter_section_id', section.id).maybeSingle();
    const origTitle = document.createElement('input'); origTitle.className='input'; origTitle.value = data?.original_title || '';
    const origAuthor = document.createElement('input'); origAuthor.className='input'; origAuthor.value = data?.original_author || '';
    const trBody = document.createElement('textarea'); trBody.className='input'; trBody.rows=8; trBody.value = data?.translated_body_ar || '';
    const saveBtn = document.createElement('button'); saveBtn.textContent='حفظ'; saveBtn.className='btn btn-primary';
    saveBtn.addEventListener('click', async ()=>{
      setLoading(saveBtn, true);
      try{
        const payload = { newsletter_section_id: section.id, original_title: origTitle.value, original_author: origAuthor.value, translated_body_ar: trBody.value };
        if (data) await supabase.from('section_translation').update(payload).eq('id', data.id);
        else await supabase.from('section_translation').insert(payload);
        showToast('تم حفظ الترجمة');
      }catch(e){ showToast(e.message||e,'error'); }
      setLoading(saveBtn, false);
    });
    container.append(origTitle, origAuthor, trBody, saveBtn);
  } else {
    container.append(document.createElement('div')).textContent = 'نوع القسم غير مدعوم بعد.';
  }

  sectionEditorArea.appendChild(container);
}

function createNewsItemRow(item, section){
  const row = document.createElement('div'); row.className='repeat-item';
  const titleArLabel = document.createElement('label'); titleArLabel.className='label'; titleArLabel.textContent='عنوان الخبر (عربي)';
  const title = document.createElement('input'); title.className='input'; title.placeholder='عنوان الخبر'; title.value = item?.title_ar || item?.title || '';
  const titleEnWrap = document.createElement('div'); titleEnWrap.className='english-only';
  const titleEnLabel = document.createElement('label'); titleEnLabel.className='label'; titleEnLabel.textContent='عنوان الخبر (EN)';
  const titleEn = document.createElement('input'); titleEn.className='input'; titleEn.placeholder='News title'; titleEn.value = item?.title_en || '';
  titleEnWrap.append(titleEnLabel, titleEn);
  const summaryArLabel = document.createElement('label'); summaryArLabel.className='label'; summaryArLabel.textContent='ملخص الخبر (عربي)';
  const summary = document.createElement('textarea'); summary.className='input'; summary.rows=3; summary.placeholder='الملخص'; summary.value = item?.summary_ar || '';
  const summaryEnWrap = document.createElement('div'); summaryEnWrap.className='english-only';
  const summaryEnLabel = document.createElement('label'); summaryEnLabel.className='label'; summaryEnLabel.textContent='ملخص الخبر (EN)';
  const summaryEn = document.createElement('textarea'); summaryEn.className='input'; summaryEn.rows=3; summaryEn.placeholder='Summary'; summaryEn.value = item?.summary_en || '';
  summaryEnWrap.append(summaryEnLabel, summaryEn);
  const sourceNameArLabel = document.createElement('label'); sourceNameArLabel.className='label'; sourceNameArLabel.textContent='اسم المصدر (عربي)';
  const sourceNameAr = document.createElement('input'); sourceNameAr.className='input'; sourceNameAr.placeholder='اسم المصدر'; sourceNameAr.value = item?.source_name_ar || '';
  const sourceNameEnWrap = document.createElement('div'); sourceNameEnWrap.className='english-only';
  const sourceNameEnLabel = document.createElement('label'); sourceNameEnLabel.className='label'; sourceNameEnLabel.textContent='اسم المصدر (EN)';
  const sourceNameEn = document.createElement('input'); sourceNameEn.className='input'; sourceNameEn.placeholder='Source name'; sourceNameEn.value = item?.source_name_en || '';
  sourceNameEnWrap.append(sourceNameEnLabel, sourceNameEn);
  const sourceUrlLabel = document.createElement('label'); sourceUrlLabel.className='label'; sourceUrlLabel.textContent='رابط المصدر';
  const source = document.createElement('input'); source.className='input'; source.placeholder='مصدر/رابط'; source.value = item?.source_url || '';
  toggleTranslationFields(hasTranslation.checked);
  const save = document.createElement('button'); save.className='btn btn-primary'; save.textContent='حفظ خبر';
  save.addEventListener('click', async ()=>{
    if (!title.value || !title.value.trim()) return showToast('العنوان مطلوب','error');
    setLoading(save, true);
    try{
      const payload = {
        newsletter_section_id: section.id,
        title_ar: title.value.trim(),
        title_en: hasTranslation.checked ? (titleEn.value || null) : null,
        summary_ar: summary.value,
        summary_en: hasTranslation.checked ? (summaryEn.value || null) : null,
        source_name_ar: sourceNameAr.value || null,
        source_name_en: hasTranslation.checked ? (sourceNameEn.value || null) : null,
        source_url: source.value,
        sort_order: 0
      };
      if (item && item.id) await supabase.from('section_news_items').update(payload).eq('id', item.id);
      else await supabase.from('section_news_items').insert(payload);
      showToast('تم حفظ الخبر');
      await loadNewsletterSections(newsletter.id);
    }catch(e){ showToast(e.message||e,'error'); }
    setLoading(save, false);
  });
  const del = document.createElement('button'); del.className='btn'; del.textContent='حذف'; del.addEventListener('click', async ()=>{
    if (!item || !item.id) { row.remove(); return; }
    const ok = await showConfirm('حذف الخبر؟'); if (!ok) return;
    const { error } = await supabase.from('section_news_items').delete().eq('id', item.id); if (error) return showToast(error.message,'error'); row.remove(); await loadNewsletterSections(newsletter.id); showToast('تم الحذف');
  });
  row.append(titleArLabel, title, titleEnWrap, summaryArLabel, summary, summaryEnWrap, sourceNameArLabel, sourceNameAr, sourceNameEnWrap, sourceUrlLabel, source, save, del); return row;
}

function createArticleItemRow(item, section){
  const row = document.createElement('div'); row.className='repeat-item';
  const titleArLabel = document.createElement('label'); titleArLabel.className='label'; titleArLabel.textContent='عنوان المقال (عربي)';
  const title = document.createElement('input'); title.className='input'; title.placeholder='عنوان'; title.value = item?.title_ar || '';
  const titleEnWrap = document.createElement('div'); titleEnWrap.className='english-only';
  const titleEnLabel = document.createElement('label'); titleEnLabel.className='label'; titleEnLabel.textContent='عنوان المقال (EN)';
  const titleEn = document.createElement('input'); titleEn.className='input'; titleEn.placeholder='Article title'; titleEn.value = item?.title_en || '';
  titleEnWrap.append(titleEnLabel, titleEn);
  const authorArLabel = document.createElement('label'); authorArLabel.className='label'; authorArLabel.textContent='اسم الكاتب (عربي)';
  const author = document.createElement('input'); author.className='input'; author.placeholder='المؤلف'; author.value = item?.author_name_ar || '';
  const authorEnWrap = document.createElement('div'); authorEnWrap.className='english-only';
  const authorEnLabel = document.createElement('label'); authorEnLabel.className='label'; authorEnLabel.textContent='اسم الكاتب (EN)';
  const authorEn = document.createElement('input'); authorEn.className='input'; authorEn.placeholder='Author'; authorEn.value = item?.author_name_en || '';
  authorEnWrap.append(authorEnLabel, authorEn);
  const excerptArLabel = document.createElement('label'); excerptArLabel.className='label'; excerptArLabel.textContent='المقتطف (عربي)';
  const excerpt = document.createElement('textarea'); excerpt.className='input'; excerpt.rows=3; excerpt.placeholder='مقتطف'; excerpt.value = item?.excerpt_ar || '';
  const excerptEnWrap = document.createElement('div'); excerptEnWrap.className='english-only';
  const excerptEnLabel = document.createElement('label'); excerptEnLabel.className='label'; excerptEnLabel.textContent='المقتطف (EN)';
  const excerptEn = document.createElement('textarea'); excerptEn.className='input'; excerptEn.rows=3; excerptEn.placeholder='Excerpt'; excerptEn.value = item?.excerpt_en || '';
  excerptEnWrap.append(excerptEnLabel, excerptEn);
  toggleTranslationFields(hasTranslation.checked);
  const save = document.createElement('button'); save.className='btn btn-primary'; save.textContent='حفظ';
  save.addEventListener('click', async ()=>{
    if (!title.value || !title.value.trim()) return showToast('العنوان مطلوب','error');
    setLoading(save, true);
    try{
      const payload = {
        newsletter_section_id: section.id,
        title_ar: title.value.trim(),
        title_en: hasTranslation.checked ? (titleEn.value || null) : null,
        author_name_ar: author.value,
        author_name_en: hasTranslation.checked ? (authorEn.value || null) : null,
        excerpt_ar: excerpt.value,
        excerpt_en: hasTranslation.checked ? (excerptEn.value || null) : null,
        sort_order: 0
      };
      if (item && item.id) await supabase.from('section_article_items').update(payload).eq('id', item.id);
      else await supabase.from('section_article_items').insert(payload);
      showToast('تم حفظ المقال'); await loadNewsletterSections(newsletter.id);
    }catch(e){ showToast(e.message||e,'error'); }
    setLoading(save, false);
  });
  const del = document.createElement('button'); del.className='btn'; del.textContent='حذف'; del.addEventListener('click', async ()=>{
    if (!item || !item.id) { row.remove(); return; }
    const ok = await showConfirm('حذف المقال؟'); if (!ok) return;
    const { error } = await supabase.from('section_article_items').delete().eq('id', item.id); if (error) return showToast(error.message,'error'); row.remove(); await loadNewsletterSections(newsletter.id); showToast('تم الحذف');
  });
  row.append(titleArLabel, title, titleEnWrap, authorArLabel, author, authorEnWrap, excerptArLabel, excerpt, excerptEnWrap, save, del); return row;
}

// cover upload
coverFile.addEventListener('change', async ()=>{
  const f = coverFile.files && coverFile.files[0]; if (!f) return;
  coverStatus.textContent = 'جاري رفع الصورة…';
  // create inline progress bar
  let pbar = document.getElementById('cover-progress');
  if (!pbar){ pbar = document.createElement('progress'); pbar.id = 'cover-progress'; pbar.max = 1; pbar.value = 0; pbar.style.width = '100%'; coverPreview.appendChild(pbar); }
  const note = showToast('جاري رفع صورة الغلاف…', 'pending', 0);
  try{
    const publicUrl = await uploadFileWithProgress(f, `newsletters/${newsletter?.id||'temp'}`, (ratio)=>{
      if (ratio >= 0 && ratio <= 1){ pbar.value = ratio; coverStatus.textContent = `جاري الرفع ${Math.round(ratio*100)}%`; }
    });
    pbar.value = 1; coverStatus.textContent = 'تم الرفع';
    coverPreview.innerHTML = `<img src='${publicUrl}' style='max-width:260px'>`;
    // if newsletter exists, update
    if (newsletter && newsletter.id){ await supabase.from('newsletters').update({ cover_image_url: publicUrl }).eq('id', newsletter.id); note.dismiss(); showToast('تم تحديث صورة الغلاف'); }
    else { newsletter = newsletter || {}; newsletter.cover_image_url = publicUrl; note.dismiss(); }
  }catch(e){ coverStatus.textContent = ''; if (pbar && pbar.parentElement) pbar.remove(); note.dismiss(); showToast(e.message||e,'error'); }
});

// Toggle translation input row
hasTranslation.addEventListener('change', ()=>{
  const enabled = hasTranslation.checked;
  toggleTranslationFields(enabled);
  if (!enabled) {
    titleEn.value = '';
    readingTimeEn.value = '';
    welcomeMessageEn.value = '';
  }
});

// Save meta
saveMetaBtn.addEventListener('click', async ()=>{
  if (!titleAr.value || !titleAr.value.trim()) return showToast('عنوان النشرة مطلوب','error');
  setLoading(saveMetaBtn, true);
  try{
    const payload = {
      title_ar: titleAr.value.trim(),
      title_en: hasTranslation.checked ? (titleEn.value || null) : null,
      edition_number: edition.value ? Number(edition.value) : null,
      issue_date: issueDate.value || null,
      reading_time: readingTime.value || null,
      reading_time_en: hasTranslation.checked ? (readingTimeEn.value || null) : null,
      welcome_message: welcomeMessage.value || null,
      welcome_message_en: hasTranslation.checked ? (welcomeMessageEn.value || null) : null,
      has_translation: hasTranslation.checked,
      translated_content: null,
      status: isPublished.checked ? 'published' : 'draft',
      category_id: categorySel.value || null,
      cover_image_url: newsletter?.cover_image_url || null
    };
    const fallbackPayload = { ...payload };
    delete fallbackPayload.has_translation;
    delete fallbackPayload.translated_content;
    delete fallbackPayload.reading_time_en;
    delete fallbackPayload.welcome_message_en;

    if (newsletter && newsletter.id){
      const { error } = await supabase.from('newsletters').update(payload).eq('id', newsletter.id);
      if (error) {
        if (error.code === '42703') {
          const { error: fallbackError } = await supabase.from('newsletters').update(fallbackPayload).eq('id', newsletter.id);
          if (fallbackError) throw fallbackError;
          showToast('تم تحديث بيانات النشرة (بدون حقول الترجمة - يلزم تشغيل ترحيل قاعدة البيانات)');
        } else {
          throw error;
        }
      } else {
        showToast('تم تحديث بيانات النشرة');
      }
    }
    else {
      const { data, error } = await supabase.from('newsletters').insert(payload).select().maybeSingle();
      if (error) {
        if (error.code === '42703') {
          const { data: fallbackData, error: fallbackError } = await supabase.from('newsletters').insert(fallbackPayload).select().maybeSingle();
          if (fallbackError) throw fallbackError;
          newsletter = fallbackData;
          history.replaceState(null, '', `?id=${newsletter.id}`);
          showToast('تم إنشاء النشرة (بدون حقول الترجمة - يلزم تشغيل ترحيل قاعدة البيانات)');
        } else {
          throw error;
        }
      } else {
        newsletter = data;
        history.replaceState(null, '', `?id=${newsletter.id}`);
        showToast('تم إنشاء النشرة');
      }
    }
    await loadNewsletterSections(newsletter.id);
  }catch(e){ showToast(e.message||e,'error'); }
  setLoading(saveMetaBtn, false);
});

// Delete newsletter
deleteNewsBtn.addEventListener('click', async ()=>{
  if (!newsletter || !newsletter.id) return showToast('لا يوجد عدد للحذف','error');
  const ok = await showConfirm('حذف العدد؟ هذا الإجراء نهائي'); if (!ok) return;
  const { error } = await supabase.from('newsletters').delete().eq('id', newsletter.id);
  if (error) return showToast(error.message,'error');
  showToast('تم حذف العدد'); window.setTimeout(()=> window.location.href = '/admin_cms/dashboard.html', 1000);
});

publishAllBtn.addEventListener('click', async ()=>{
  if (!newsletter?.id) return showToast('احفظ بيانات النشرة أولاً','error');
  // For now, reload sections and show success
  await loadNewsletter(newsletter.id);
  showToast('تم مزامنة التغييرات');
});

init();
