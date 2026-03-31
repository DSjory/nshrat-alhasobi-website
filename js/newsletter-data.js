// js/newsletter-data.js
// All database helpers for the newsletter system.
// Requires: window.supabase (from js/supabase-client.js)

const STORAGE_BUCKET = 'newsletter-media';

async function uploadFile(file, pathPrefix) {
  const ext      = file.name.split('.').pop().toLowerCase();
  const filename = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await window.supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filename, file, { upsert: false });
  if (uploadError) throw uploadError;

  const { data } = window.supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filename);
  return data.publicUrl;
}

async function fetchSectionTypes() {
  const { data, error } = await window.supabase
    .from('section_types')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return data;
}

async function fetchNewsletterList() {
  const { data, error } = await window.supabase
    .from('newsletters')
    .select('id, title_ar, title_en, edition_number, issue_date, status, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function fetchNewsletterById(id) {
  const { data, error } = await window.supabase
    .from('newsletters')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function fetchSectionsForNewsletter(newsletterId, visibleOnly = false) {
  let query = window.supabase
    .from('newsletter_sections')
    .select(`
      id, is_visible, sort_order, header_image_url,
      section_type:section_types(id, slug, name_ar, name_en, icon, has_header_image, is_optional)
    `)
    .eq('newsletter_id', newsletterId)
    .order('sort_order');

  if (visibleOnly) query = query.eq('is_visible', true);

  const { data, error } = await query;
  if (!error) return data;

  // Handle stale schema cache / old DBs where section header columns do not exist yet.
  if (error.code === '42703') {
    let fallbackQuery = window.supabase
      .from('newsletter_sections')
      .select(`
        id, is_visible, sort_order,
        section_type:section_types(id, slug, name_ar, name_en, icon, has_header_image, is_optional)
      `)
      .eq('newsletter_id', newsletterId)
      .order('sort_order');

    if (visibleOnly) fallbackQuery = fallbackQuery.eq('is_visible', true);

    const { data: fallbackData, error: fallbackError } = await fallbackQuery;
    if (fallbackError) throw fallbackError;

    return (fallbackData || []).map((row) => ({
      ...row,
      header_image_url: null,
    }));
  }

  throw error;
}

const SINGLE_ROW_TABLE = {
  illumination : 'section_illumination',
  inspiring    : 'section_inspiring',
  podcast      : 'section_podcast',
};
const MULTI_ROW_TABLE = {
  news     : 'section_news_items',
  articles : 'section_article_items',
};

async function fetchSectionContent(sectionId, slug) {
  if (SINGLE_ROW_TABLE[slug]) {
    const { data, error } = await window.supabase
      .from(SINGLE_ROW_TABLE[slug])
      .select('*')
      .eq('newsletter_section_id', sectionId)
      .maybeSingle();
    if (error) throw error;
    return data || {};
  }

  if (MULTI_ROW_TABLE[slug]) {
    const { data, error } = await window.supabase
      .from(MULTI_ROW_TABLE[slug])
      .select('*')
      .eq('newsletter_section_id', sectionId)
      .order('sort_order');
    if (error) throw error;
    return { items: data || [] };
  }

  return {};
}

async function fetchNewsletterEditors(newsletterId) {
  const { data, error } = await window.supabase
    .from('newsletter_editors')
    .select('*')
    .eq('newsletter_id', newsletterId)
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

async function fetchPublishedNewsletter(newsletterId) {
  // Step A: fetch the newsletter row
  const { data: newsletter, error: nlErr } = await window.supabase
    .from('newsletters')
    .select('*')
    .eq('id', newsletterId)
    .eq('status', 'published')
    .maybeSingle();

  if (nlErr) {
    console.error("Supabase Error fetching newsletter:", nlErr);
    throw nlErr;
  }
  if (!newsletter) return null;

  // Step B & C
  const sections          = await fetchSectionsForNewsletter(newsletterId, true);
  const sectionsWithContent = await Promise.all(
    sections.map(async sec => ({
      ...sec,
      content: await fetchSectionContent(sec.id, sec.section_type.slug),
    }))
  );
  
  // Step D: Fetch editors
  const editors = await fetchNewsletterEditors(newsletterId);
  
  return { newsletter, sections: sectionsWithContent, editors };
}

async function fetchNewsletterForEditing(newsletterId) {
  const newsletter        = await fetchNewsletterById(newsletterId);
  const sections          = await fetchSectionsForNewsletter(newsletterId, false);
  const sectionsWithContent = await Promise.all(
    sections.map(async sec => ({
      ...sec,
      content: await fetchSectionContent(sec.id, sec.section_type.slug),
    }))
  );
  return { newsletter, sections: sectionsWithContent };
}

async function saveNewsletter(formData) {
  let newsletterId = formData.id;
  if (!newsletterId) {
    const { data, error } = await window.supabase
      .from('newsletters')
      .insert({
        title_ar:        formData.title_ar       || '',
        title_en:        formData.title_en        || null,
        edition_number:  formData.edition_number  || null,
        issue_date:      formData.issue_date       || null,
        reading_time:    formData.reading_time     || null,
        reading_time_en: formData.reading_time_en  || null,
        welcome_message: formData.welcome_message || null,
        welcome_message_en: formData.welcome_message_en || null,
        has_translation: formData.has_translation  || false,
        translated_content: formData.translated_content || null,
        cover_image_url: formData.cover_image_url  || null,
        nav_type:        formData.nav_type         || 'filter',
        status:          'draft',
      })
      .select('id')
      .single();
    if (error) throw error;
    newsletterId = data.id;
  } else {
    const { error } = await window.supabase
      .from('newsletters')
      .update({
        title_ar:        formData.title_ar       || '',
        title_en:        formData.title_en        || null,
        edition_number:  formData.edition_number  || null,
        issue_date:      formData.issue_date       || null,
        reading_time:    formData.reading_time     || null,
        reading_time_en: formData.reading_time_en  || null,
        welcome_message: formData.welcome_message || null,
        welcome_message_en: formData.welcome_message_en || null,
        has_translation: formData.has_translation  || false,
        translated_content: formData.translated_content || null,
        cover_image_url: formData.cover_image_url  || null,
        nav_type:        formData.nav_type         || 'filter',
      })
      .eq('id', newsletterId);
    if (error) throw error;
  }

  for (const sec of formData.sections) {
    let sectionId = sec.id;

    if (!sectionId) {
      const { data, error } = await window.supabase
        .from('newsletter_sections')
        .insert({
          newsletter_id:   newsletterId,
          section_type_id: sec.section_type_id,
          is_visible:      sec.is_visible,
          sort_order:      sec.sort_order,
        })
        .select('id')
        .single();
      if (error) throw error;
      sectionId = data.id;
    } else {
      const { error } = await window.supabase
        .from('newsletter_sections')
        .update({ is_visible: sec.is_visible, sort_order: sec.sort_order })
        .eq('id', sectionId);
      if (error) throw error;
    }

    await upsertSectionContent(sec.slug, sectionId, sec.content);
  }

  return newsletterId;
}

async function upsertSectionContent(slug, sectionId, content) {
  if (SINGLE_ROW_TABLE[slug]) {
    let payload = { newsletter_section_id: sectionId };

    if (slug === 'illumination' || slug === 'inspiring') {
      payload = {
        ...payload,
        header_image_url:    content.header_image_url    || null,
        header_image_alt_ar: content.header_image_alt_ar || null,
        body_ar:             content.body_ar             || '',
        body_en:             content.body_en             || null,
      };
    } else if (slug === 'podcast') {
      payload = {
        ...payload,
        title_ar:         content.title_ar         || '',
        title_en:         content.title_en         || null,
        description_ar:   content.description_ar   || null,
        description_en:   content.description_en   || null,
        audio_url:        content.audio_url        || '',
        cover_image_url:  content.cover_image_url  || null,
        podcast_image_url: content.podcast_image_url || null,
        duration_seconds: content.duration_seconds || null,
        external_link:    content.external_link    || null,
      };
    }

    const { error } = await window.supabase
      .from(SINGLE_ROW_TABLE[slug])
      .upsert(payload, { onConflict: 'newsletter_section_id' });
    if (error) throw error;
    return;
  }

  if (MULTI_ROW_TABLE[slug]) {
    const { error: delError } = await window.supabase
      .from(MULTI_ROW_TABLE[slug])
      .delete()
      .eq('newsletter_section_id', sectionId);
    if (delError) throw delError;

    const rows = (content.items || []).filter(item => (item.title_ar || '').trim());
    if (!rows.length) return;

    let insertRows;
    if (slug === 'news') {
      insertRows = rows.map((item, i) => ({
        newsletter_section_id: sectionId,
        title_ar:       (item.title_ar       || '').trim(),
        title_en:        item.title_en        || null,
        summary_ar:      item.summary_ar      || null,
        summary_en:      item.summary_en      || null,
        source_name_ar:  item.source_name_ar  || null,
        source_name_en:  item.source_name_en  || null,
        source_url:      item.source_url      || null,
        image_url:       item.image_url       || null,
        sort_order: i,
      }));
    } else {
      insertRows = rows.map((item, i) => ({
        newsletter_section_id: sectionId,
        title_ar:      (item.title_ar      || '').trim(),
        title_en:       item.title_en       || null,
        author_name_ar: item.author_name_ar || null,
        author_name_en: item.author_name_en || null,
        excerpt_ar:     item.excerpt_ar     || null,
        excerpt_en:     item.excerpt_en     || null,
        article_url:    item.article_url    || null,
        image_url:      item.image_url      || null,
        sort_order: i,
      }));
    }

    const { error } = await window.supabase
      .from(MULTI_ROW_TABLE[slug])
      .insert(insertRows);
    if (error) throw error;
  }
}

async function setNewsletterStatus(id, status) {
  const { error } = await window.supabase
    .from('newsletters')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

async function fetchAllIlluminations() {
  const { data, error } = await window.supabase
    .from('section_illumination')
    .select(`
      *,
      ns:newsletter_sections(
        id, is_visible,
        nl:newsletters(id, title_ar, edition_number, issue_date, status)
      )
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).filter(
    r => r.ns?.is_visible && r.ns?.nl?.status === 'published'
  );
}

async function fetchLatestNewsItems(limit = 4) {
  const { data: newsType, error: typeErr } = await window.supabase
    .from('section_types')
    .select('id')
    .eq('slug', 'news')
    .single();
  if (typeErr || !newsType) return [];

  const { data: latest, error: nlErr } = await window.supabase
    .from('newsletters')
    .select('id')
    .eq('status', 'published')
    .order('issue_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (nlErr || !latest) return [];

  const { data: sec, error: secErr } = await window.supabase
    .from('newsletter_sections')
    .select('id')
    .eq('newsletter_id', latest.id)
    .eq('section_type_id', newsType.id)
    .eq('is_visible', true)
    .maybeSingle();
  if (secErr || !sec) return [];

  const { data: items, error: itemErr } = await window.supabase
    .from('section_news_items')
    .select('*')
    .eq('newsletter_section_id', sec.id)
    .order('sort_order')
    .limit(limit);
  if (itemErr) throw itemErr;
  return items || [];
}

async function migrateOldData() {
  console.log('Starting migration…');

  const { data: newsletters } = await window.supabase.from('newsletters').select('*');
  const { data: types }       = await window.supabase.from('section_types').select('*');

  for (const nl of newsletters) {
    for (const st of types) {
      const { data: existing } = await window.supabase
        .from('newsletter_sections')
        .select('id')
        .eq('newsletter_id', nl.id)
        .eq('section_type_id', st.id)
        .maybeSingle();
      if (existing) continue;

      const { data: sec, error } = await window.supabase
        .from('newsletter_sections')
        .insert({
          newsletter_id:   nl.id,
          section_type_id: st.id,
          is_visible:      true,
          sort_order:      st.sort_order,
        })
        .select('id')
        .single();
      if (error) { console.error('section insert failed', error); continue; }

      if (st.slug === 'illumination' && nl.illumination_body) {
        await window.supabase.from('section_illumination').insert({
          newsletter_section_id: sec.id,
          header_image_url: nl.illumination_image || null,
          body_ar: nl.illumination_body,
        });
      }
      if (st.slug === 'news' && nl.news_content) {
        await window.supabase.from('section_news_items').insert({
          newsletter_section_id: sec.id,
          title_ar: 'أخبار', summary_ar: nl.news_content, sort_order: 0,
        });
      }
      if (st.slug === 'podcast' && nl.podcast_url) {
        await window.supabase.from('section_podcast').insert({
          newsletter_section_id: sec.id,
          title_ar: nl.podcast_title || 'بودكاست', audio_url: nl.podcast_url,
        });
      }
    }
  }
  console.log('Migration complete');
}

// Exports
window.newsletterData = {
  uploadFile, fetchSectionTypes, fetchNewsletterList, fetchNewsletterById,
  fetchSectionsForNewsletter, fetchSectionContent, fetchPublishedNewsletter,
  fetchNewsletterForEditing, saveNewsletter, setNewsletterStatus,
  fetchAllIlluminations, fetchLatestNewsItems, migrateOldData
};
