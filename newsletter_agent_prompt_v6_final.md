# AI Code Agent — Newsletter System Full Implementation
## Stack: Vanilla HTML + CSS + Vanilla JS · Supabase (Postgres + Storage)
## Admin lives at /admin · Site language: Arabic, RTL-first

---

## ⚡ EXECUTION MODE

**Implement everything end-to-end. Never stop to ask for approval.**

When you encounter an ambiguity:
1. Use the codebase evidence from STEP 0 to resolve it.
2. Write a one-line `// AGENT DECISION:` comment above the affected code.
3. Move on immediately.

The only things you must not do are in the **CRITICAL RULES** section at the end.

---

## STEP 0 — Read the codebase first. Do not write a single line of code before finishing this step.

Execute in order:

```
1. List every file in the project root and /admin/
2. Read every .html file
3. Read every .js file that contains .from( — these are Supabase queries
4. Search for any .sql file or supabase/migrations/ directory
5. Find where Supabase is initialised (look for createClient). Note:
      - The JS file that contains it
      - The variable name assigned to createClient(...) — typically 'supabase'
      - The SUPABASE_URL and SUPABASE_ANON_KEY values (or env var names)
6. List every table name found in .from('...') calls
7. Note the URL pattern used to load a newsletter page (e.g. /newsletter.html?id=UUID)
8. Note the Storage bucket name used for images (.storage.from('...'))
   If none exists, use 'newsletter-media'
9. Note how admin auth is guarded (look for auth.getSession / auth.getUser / redirects)
10. Note whether a rich-text editor library (Quill, TipTap, CKEditor) is already loaded
```

Write this block before making any change:

```
=== CODEBASE SUMMARY ===
Tables found            : [list]
Newsletter URL pattern  : [e.g. /newsletter.html?id=UUID]
Supabase init file      : [e.g. js/supabase.js]
Supabase variable name  : [e.g. const supabase or window._sb]
Storage bucket          : [e.g. newsletter-media]
Admin auth pattern      : [paste the 3–5 relevant lines verbatim]
Rich-text editor        : [library + version, or NONE]
Files under /admin/     : [list]
Must not break          : [list working features + their URLs]
Name mismatches         : [e.g. table 'posts' → will be used as 'newsletters']
========================
```

---

## STEP 1 — Deliverables

You will create or edit exactly these files. The order below is the implementation order — follow it.

```
1.  schema.sql                         create  — full database schema
2.  js/supabase-client.js              create  — shared Supabase init (or edit existing)
3.  js/newsletter-data.js              create  — all DB read/write helpers
4.  js/newsletter-render.js            create  — public page rendering
5.  admin/js/admin-auth.js             create  — shared admin auth guard
6.  admin/css/editor.css               create  — admin editor styles
7.  admin/newsletter-list.html         create  — admin: list of newsletters
8.  admin/newsletter-list.js           create  — admin list logic
9.  admin/newsletter-editor.html       create  — admin: single-entry form
10. admin/newsletter-editor.js         create  — admin form logic + save
11. css/newsletter.css                 create  — public page styles (append if file exists)
12. [public newsletter page]           edit    — wire to new render system (path from Step 0)
```

---

## STEP 2 — schema.sql

This file is placed in the project root. Run it once in the Supabase SQL editor. It is safe to re-run.

**If the existing codebase has a table named differently from `newsletters`** (e.g. `posts`), keep using that name everywhere. Find the `-- ADAPT:` comments below and substitute accordingly.

```sql
-- =============================================================
-- schema.sql — Newsletter system
-- Safe to re-run: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING
-- Run in: Supabase Dashboard → SQL Editor
-- =============================================================

-- ── 1. section_types ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS section_types (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text        UNIQUE NOT NULL,
  name_ar          text        NOT NULL,
  name_en          text        NOT NULL,
  icon             text,
  has_header_image boolean     NOT NULL DEFAULT false,
  is_optional      boolean     NOT NULL DEFAULT false,
  sort_order       int         NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO section_types (slug, name_ar, name_en, icon, has_header_image, is_optional, sort_order)
VALUES
  ('illumination', 'إضاءة',    'Illumination', '💡', true,  false, 1),
  ('inspiring',    'ملهم',     'Inspiring',    '✨', true,  false, 2),
  ('news',         'الأخبار',  'News',         '📰', false, false, 3),
  ('articles',     'المقالات', 'Articles',     '📝', false, false, 4),
  ('podcast',      'البودكاست','Podcast',      '🎙', false, true,  5),
  ('translation',  'الترجمة',  'Translation',  '🔤', false, false, 6)
ON CONFLICT (slug) DO NOTHING;

-- ── 2. newsletters ────────────────────────────────────────────
-- ADAPT: replace 'newsletters' with the actual table name if different.
CREATE TABLE IF NOT EXISTS newsletters (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title_ar         text        NOT NULL DEFAULT '',
  title_en         text,
  edition_number   int,
  issue_date       date,
  cover_image_url  text,
  nav_type         text        NOT NULL DEFAULT 'filter'
                               CHECK (nav_type IN ('tabs','filter')),
  status           text        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft','published','archived')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Safe additions for projects where 'newsletters' already exists:
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS title_en        text;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS edition_number  int;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS issue_date      date;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS nav_type        text DEFAULT 'filter';
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS status          text DEFAULT 'draft';
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS updated_at      timestamptz DEFAULT now();
-- If the existing table has 'title' (not 'title_ar'), uncomment:
-- ALTER TABLE newsletters RENAME COLUMN title TO title_ar;

-- ── 3. newsletter_sections ────────────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter_sections (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id   uuid        REFERENCES newsletters(id) ON DELETE CASCADE,
  -- NULL is allowed: a standalone section not tied to any edition
  section_type_id uuid        NOT NULL REFERENCES section_types(id),
  is_visible      boolean     NOT NULL DEFAULT true,
  sort_order      int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Prevent duplicate sections of the same type in one newsletter:
  UNIQUE NULLS NOT DISTINCT (newsletter_id, section_type_id)
);
CREATE INDEX IF NOT EXISTS idx_ns_newsletter ON newsletter_sections(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_ns_type       ON newsletter_sections(section_type_id);

-- ── 4. section_illumination ───────────────────────────────────
CREATE TABLE IF NOT EXISTS section_illumination (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL UNIQUE
                                    REFERENCES newsletter_sections(id) ON DELETE CASCADE,
  header_image_url      text,
  header_image_alt_ar   text,
  body_ar               text        NOT NULL DEFAULT '',
  body_en               text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── 5. section_inspiring ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS section_inspiring (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL UNIQUE
                                    REFERENCES newsletter_sections(id) ON DELETE CASCADE,
  header_image_url      text,
  header_image_alt_ar   text,
  body_ar               text        NOT NULL DEFAULT '',
  body_en               text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── 6. section_news_items ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS section_news_items (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL
                                    REFERENCES newsletter_sections(id) ON DELETE CASCADE,
  title_ar              text        NOT NULL DEFAULT '',
  title_en              text,
  summary_ar            text,
  source_name_ar        text,
  source_url            text,
  image_url             text,
  sort_order            int         NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_section ON section_news_items(newsletter_section_id);

-- ── 7. section_article_items ──────────────────────────────────
CREATE TABLE IF NOT EXISTS section_article_items (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL
                                    REFERENCES newsletter_sections(id) ON DELETE CASCADE,
  title_ar              text        NOT NULL DEFAULT '',
  title_en              text,
  author_name_ar        text,
  excerpt_ar            text,
  article_url           text,
  image_url             text,
  sort_order            int         NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_articles_section ON section_article_items(newsletter_section_id);

-- ── 8. section_podcast ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS section_podcast (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL UNIQUE
                                    REFERENCES newsletter_sections(id) ON DELETE CASCADE,
  title_ar              text        NOT NULL DEFAULT '',
  title_en              text,
  description_ar        text,
  audio_url             text        NOT NULL DEFAULT '',
  cover_image_url       text,
  duration_seconds      int,
  external_link         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── 9. section_translation ────────────────────────────────────
CREATE TABLE IF NOT EXISTS section_translation (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL UNIQUE
                                    REFERENCES newsletter_sections(id) ON DELETE CASCADE,
  header_image_url      text,
  header_image_alt_ar   text,
  original_title        text,
  original_author       text,
  original_url          text,
  original_language     text        NOT NULL DEFAULT 'en',
  translated_body_ar    text        NOT NULL DEFAULT '',
  translator_note_ar    text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── 10. updated_at auto-trigger ───────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'newsletters', 'newsletter_sections',
    'section_illumination', 'section_inspiring',
    'section_podcast', 'section_translation'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- ── 11. Storage bucket ────────────────────────────────────────
-- Skip if bucket already exists (check Storage tab in Supabase dashboard first).
INSERT INTO storage.buckets (id, name, public)
VALUES ('newsletter-media', 'newsletter-media', true)
ON CONFLICT (id) DO NOTHING;

-- ── 12. RLS policies ──────────────────────────────────────────
-- Only run this block if the existing tables use RLS.
-- Safe across Postgres versions — uses exception handling instead of IF NOT EXISTS.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'section_types', 'newsletter_sections',
    'section_illumination', 'section_inspiring',
    'section_news_items', 'section_article_items',
    'section_podcast', 'section_translation'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    BEGIN
      EXECUTE format(
        'CREATE POLICY "public_select" ON %I FOR SELECT USING (true)', t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY "auth_all" ON %I FOR ALL
         USING (auth.role() = ''authenticated'')', t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;

  -- Storage policies
  BEGIN
    CREATE POLICY "auth_upload" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'newsletter-media' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "public_read" ON storage.objects FOR SELECT
    USING (bucket_id = 'newsletter-media');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
```

---

## STEP 3 — js/supabase-client.js

**If a Supabase init file already exists**, edit it to add `window._supabase = supabase` (or whatever the existing variable is) so all scripts can share it via `window`. Do not create a second Supabase client.

**If no init file exists**, create this file:

```js
// js/supabase-client.js
// Shared Supabase client. Loaded before every other script on every page.
// AGENT: fill SUPABASE_URL and SUPABASE_ANON_KEY from the existing codebase.
// Look for them in: .env, config.js, or hardcoded in existing JS files.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL      = 'REPLACE_WITH_PROJECT_URL';   // e.g. https://xyz.supabase.co
const SUPABASE_ANON_KEY = 'REPLACE_WITH_ANON_KEY';

window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

**If the project uses a `<script src="...supabase...">` CDN tag instead of ESM**, replace the import with the equivalent:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  window.supabase = supabase.createClient('REPLACE_URL', 'REPLACE_KEY');
</script>
```

In every HTML file below, include supabase-client.js as the **first** script tag.

---

## STEP 4 — admin/js/admin-auth.js

Create this file. Every admin page calls this once on load.

```js
// admin/js/admin-auth.js
// Shared admin authentication guard.
// Usage: await requireAdminAuth();

async function requireAdminAuth() {
  const { data: { session }, error } = await window.supabase.auth.getSession();
  if (error || !session) {
    // AGENT DECISION: redirect target. If the project has a login page at a
    // different path, update this line and add a comment.
    window.location.href = '/admin/login.html';
    throw new Error('Not authenticated — redirecting');
  }
  return session;
}
```

---

## STEP 5 — js/newsletter-data.js

Create this file. It contains every Supabase read/write function for both public and admin pages.

```js
// js/newsletter-data.js
// All database helpers for the newsletter system.
// Requires: window.supabase (from js/supabase-client.js)

const STORAGE_BUCKET = 'newsletter-media';
// AGENT DECISION: if Step 0 found a different bucket name, replace the value above.

// ─────────────────────────────────────────────────────────────
// IMAGE UPLOAD
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// SECTION TYPES
// ─────────────────────────────────────────────────────────────

async function fetchSectionTypes() {
  const { data, error } = await window.supabase
    .from('section_types')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────
// NEWSLETTERS — list + single
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// SECTIONS — fetch for a newsletter
// ─────────────────────────────────────────────────────────────

async function fetchSectionsForNewsletter(newsletterId, visibleOnly = false) {
  let query = window.supabase
    .from('newsletter_sections')
    .select(`
      id, is_visible, sort_order,
      section_type:section_types(id, slug, name_ar, name_en, icon, has_header_image, is_optional)
    `)
    .eq('newsletter_id', newsletterId)
    .order('sort_order');

  if (visibleOnly) query = query.eq('is_visible', true);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ─────────────────────────────────────────────────────────────
// SECTION CONTENT — read from dedicated tables
// ─────────────────────────────────────────────────────────────

// Maps each slug to its table name.
const SINGLE_ROW_TABLE = {
  illumination : 'section_illumination',
  inspiring    : 'section_inspiring',
  podcast      : 'section_podcast',
  translation  : 'section_translation',
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

// ─────────────────────────────────────────────────────────────
// FULL NEWSLETTER — public page
// ─────────────────────────────────────────────────────────────

async function fetchPublishedNewsletter(newsletterId) {
  const newsletter = await fetchNewsletterById(newsletterId);
  if (newsletter.status !== 'published') return null;

  const sections          = await fetchSectionsForNewsletter(newsletterId, true);
  const sectionsWithContent = await Promise.all(
    sections.map(async sec => ({
      ...sec,
      content: await fetchSectionContent(sec.id, sec.section_type.slug),
    }))
  );
  return { newsletter, sections: sectionsWithContent };
}

// ─────────────────────────────────────────────────────────────
// FULL NEWSLETTER — admin editor (all sections, all visibility)
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// SAVE — upsert everything from one admin form submission
// ─────────────────────────────────────────────────────────────

/*
  formData shape:
  {
    id: uuid|null,
    title_ar, title_en, edition_number, issue_date, cover_image_url, nav_type,
    sections: [
      {
        id: uuid|null,
        section_type_id: uuid,
        slug: string,
        is_visible: boolean,
        sort_order: number,
        content: { ... }   // varies per slug — see upsertSectionContent()
      }
    ]
  }
  Returns: the newsletter uuid.
*/
async function saveNewsletter(formData) {
  // 1. Newsletter row
  let newsletterId = formData.id;
  if (!newsletterId) {
    const { data, error } = await window.supabase
      .from('newsletters')
      .insert({
        title_ar:        formData.title_ar       || '',
        title_en:        formData.title_en        || null,
        edition_number:  formData.edition_number  || null,
        issue_date:      formData.issue_date       || null,
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
        cover_image_url: formData.cover_image_url  || null,
        nav_type:        formData.nav_type         || 'filter',
      })
      .eq('id', newsletterId);
    if (error) throw error;
  }

  // 2. Sections
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
        audio_url:        content.audio_url        || '',
        cover_image_url:  content.cover_image_url  || null,
        duration_seconds: content.duration_seconds || null,
        external_link:    content.external_link    || null,
      };
    } else if (slug === 'translation') {
      payload = {
        ...payload,
        header_image_url:    content.header_image_url    || null,
        header_image_alt_ar: content.header_image_alt_ar || null,
        original_title:      content.original_title      || null,
        original_author:     content.original_author     || null,
        original_url:        content.original_url        || null,
        original_language:   content.original_language   || 'en',
        translated_body_ar:  content.translated_body_ar  || '',
        translator_note_ar:  content.translator_note_ar  || null,
      };
    }

    const { error } = await window.supabase
      .from(SINGLE_ROW_TABLE[slug])
      .upsert(payload, { onConflict: 'newsletter_section_id' });
    if (error) throw error;
    return;
  }

  // Multi-row: delete-and-reinsert
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
        source_name_ar:  item.source_name_ar  || null,
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
        excerpt_ar:     item.excerpt_ar     || null,
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

// ─────────────────────────────────────────────────────────────
// STATUS — publish / archive / revert to draft
// ─────────────────────────────────────────────────────────────

async function setNewsletterStatus(id, status) {
  const { error } = await window.supabase
    .from('newsletters')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// CROSS-PAGE QUERIES — section reuse
// ─────────────────────────────────────────────────────────────

/** All illumination content from published newsletters, newest first. */
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

/**
 * Latest N news items from the most recently published newsletter.
 * Uses separate queries to avoid unsupported filter-on-join behaviour
 * in the Supabase JS SDK.
 */
async function fetchLatestNewsItems(limit = 4) {
  // Step 1: get the news section_type id
  const { data: newsType, error: typeErr } = await window.supabase
    .from('section_types')
    .select('id')
    .eq('slug', 'news')
    .single();
  if (typeErr || !newsType) return [];

  // Step 2: get the most recently published newsletter
  const { data: latest, error: nlErr } = await window.supabase
    .from('newsletters')
    .select('id')
    .eq('status', 'published')
    .order('issue_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (nlErr || !latest) return [];

  // Step 3: get the news section for that newsletter
  const { data: sec, error: secErr } = await window.supabase
    .from('newsletter_sections')
    .select('id')
    .eq('newsletter_id', latest.id)
    .eq('section_type_id', newsType.id)
    .eq('is_visible', true)
    .maybeSingle();
  if (secErr || !sec) return [];

  // Step 4: get the items
  const { data: items, error: itemErr } = await window.supabase
    .from('section_news_items')
    .select('*')
    .eq('newsletter_section_id', sec.id)
    .order('sort_order')
    .limit(limit);
  if (itemErr) throw itemErr;
  return items || [];
}

// ─────────────────────────────────────────────────────────────
// DATA MIGRATION — run once from the browser console
// ─────────────────────────────────────────────────────────────

/*
  Call migrateOldData() from the browser console after running schema.sql.
  It reads every existing newsletter row and creates the new child records.

  AGENT: before running, review the column names inside and map them to
  whatever columns the old 'newsletters' table actually has. Add or remove
  blocks for each section type as needed.
*/
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

      // Map old column → new table. Adjust column names to match old schema:
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
      if (st.slug === 'translation' && nl.translation_body) {
        await window.supabase.from('section_translation').insert({
          newsletter_section_id: sec.id, translated_body_ar: nl.translation_body,
        });
      }
    }
  }
  console.log('Migration complete');
}
```

---

## STEP 6 — js/newsletter-render.js

```js
// js/newsletter-render.js
// Public newsletter page renderer.
// Requires: window.supabase, newsletter-data.js

/**
 * Entry point. Call from the public newsletter page script.
 * Reads ?id=UUID from the URL, fetches the newsletter, and renders it.
 * AGENT: if the project uses a different URL param name (e.g. ?nid=), pass it here.
 */
async function initNewsletterPage(idParam = 'id') {
  const params        = new URLSearchParams(location.search);
  const newsletterId  = params.get(idParam);
  const container     = document.getElementById('newsletter-sections');

  if (!newsletterId) {
    if (container) container.innerHTML = '<p class="nl-error">لم يتم تحديد النشرة.</p>';
    return;
  }

  try {
    const result = await fetchPublishedNewsletter(newsletterId);
    if (!result) {
      if (container) container.innerHTML = '<p class="nl-error">النشرة غير موجودة أو غير منشورة.</p>';
      return;
    }

    const { newsletter, sections } = result;

    // Page <title>
    document.title = newsletter.title_ar || document.title;

    // Hero heading
    const h1 = document.querySelector('.newsletter-title');
    if (h1) h1.textContent = newsletter.title_ar;

    // Cover image
    const cover = document.querySelector('.newsletter-cover');
    if (cover && newsletter.cover_image_url) {
      cover.src = newsletter.cover_image_url;
      cover.classList.remove('hidden');
    }

    // Navigation
    buildNav(newsletter.nav_type || 'filter', sections);

    // Sections
    if (container) sections.forEach(sec => container.appendChild(renderSection(sec)));

  } catch (err) {
    console.error(err);
    if (container) container.innerHTML = '<p class="nl-error">حدث خطأ أثناء تحميل النشرة.</p>';
  }
}

// ─── Navigation ───────────────────────────────────────────────

function buildNav(navType, sections) {
  if (navType === 'tabs') buildTabsNav(sections);
  else                     buildFilterNav(sections);
}

function buildTabsNav(sections) {
  const nav = document.querySelector('.newsletter-nav');
  if (!nav) return;
  nav.innerHTML = '';

  const allBtn = makeEl('button', 'tab active', 'كل النشرة');
  allBtn.dataset.target = 'all';
  nav.appendChild(allBtn);
  sections.forEach(s => {
    const btn = makeEl('button', 'tab', `${s.section_type.icon} ${s.section_type.name_ar}`);
    btn.dataset.target = s.id;
    nav.appendChild(btn);
  });

  nav.addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    nav.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.target;
    document.querySelectorAll('.newsletter-section').forEach(sec => {
      sec.hidden = target !== 'all' && sec.id !== `sec-${target}`;
    });
  });
}

function buildFilterNav(sections) {
  const bar = document.querySelector('.filter-bar');
  if (!bar) return;
  bar.innerHTML = '';

  const allPill = makeEl('button', 'filter-pill active', 'الكل');
  allPill.dataset.target = 'all';
  bar.appendChild(allPill);
  sections.forEach(s => {
    const pill = makeEl('button', 'filter-pill', `${s.section_type.icon} ${s.section_type.name_ar}`);
    pill.dataset.target = s.id;
    bar.appendChild(pill);
  });

  bar.addEventListener('click', e => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    bar.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const target = pill.dataset.target;
    document.querySelectorAll('.newsletter-section').forEach(sec => {
      sec.style.display = target === 'all' || sec.id === `sec-${target}` ? '' : 'none';
    });
    if (target !== 'all') {
      document.getElementById(`sec-${target}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

// ─── Section renderer ─────────────────────────────────────────

function renderSection(sec) {
  const el = document.createElement('section');
  el.id        = `sec-${sec.id}`;
  el.className = `newsletter-section section-${sec.section_type.slug}`;
  el.dir       = 'rtl';

  el.innerHTML = `
    <div class="section-header">
      <span class="section-icon">${sec.section_type.icon}</span>
      <h2 class="section-title">${htmlEsc(sec.section_type.name_ar)}</h2>
    </div>`;

  const body = document.createElement('div');
  body.className = 'section-body';

  const slug = sec.section_type.slug;
  const c    = sec.content || {};

  switch (slug) {
    case 'illumination':
    case 'inspiring':
      if (c.header_image_url)
        body.innerHTML += `<img src="${c.header_image_url}" alt="${htmlEsc(c.header_image_alt_ar)}" class="section-hero-img" loading="lazy">`;
      if (c.body_ar)
        body.innerHTML += `<div class="section-text">${c.body_ar}</div>`;
      break;

    case 'news':
      (c.items || []).forEach(item => {
        body.innerHTML += `
          <div class="news-item">
            ${item.image_url ? `<img src="${item.image_url}" class="news-thumb" loading="lazy" alt="">` : ''}
            <div class="news-item-body">
              <h3 class="news-title">${item.source_url
                ? `<a href="${htmlEsc(item.source_url)}" target="_blank" rel="noopener">${htmlEsc(item.title_ar)}</a>`
                : htmlEsc(item.title_ar)}</h3>
              ${item.source_name_ar ? `<span class="news-source">${htmlEsc(item.source_name_ar)}</span>` : ''}
              ${item.summary_ar    ? `<p class="news-summary">${htmlEsc(item.summary_ar)}</p>`          : ''}
            </div>
          </div>`;
      });
      break;

    case 'articles':
      (c.items || []).forEach(item => {
        body.innerHTML += `
          <div class="article-item">
            ${item.image_url ? `<img src="${item.image_url}" class="article-thumb" loading="lazy" alt="">` : ''}
            <div class="article-item-body">
              <h3 class="article-title">${item.article_url
                ? `<a href="${htmlEsc(item.article_url)}" target="_blank" rel="noopener">${htmlEsc(item.title_ar)}</a>`
                : htmlEsc(item.title_ar)}</h3>
              ${item.author_name_ar ? `<span class="article-author">${htmlEsc(item.author_name_ar)}</span>` : ''}
              ${item.excerpt_ar     ? `<p class="article-excerpt">${htmlEsc(item.excerpt_ar)}</p>`          : ''}
            </div>
          </div>`;
      });
      break;

    case 'podcast':
      if (c.audio_url) {
        body.innerHTML += `
          <div class="podcast-player">
            ${c.cover_image_url ? `<img src="${c.cover_image_url}" class="podcast-cover" loading="lazy" alt="">` : ''}
            <div class="podcast-info">
              <h3 class="podcast-title">${htmlEsc(c.title_ar)}</h3>
              ${c.description_ar   ? `<p class="podcast-desc">${htmlEsc(c.description_ar)}</p>`                          : ''}
              ${c.duration_seconds ? `<span class="podcast-dur">${Math.floor(c.duration_seconds/60)} دقيقة</span>`       : ''}
            </div>
            <audio controls src="${htmlEsc(c.audio_url)}" class="podcast-audio"></audio>
            ${c.external_link ? `<a href="${htmlEsc(c.external_link)}" class="podcast-ext-link" target="_blank" rel="noopener">استمع على المنصة</a>` : ''}
          </div>`;
      }
      break;

    case 'translation':
      if (c.header_image_url)
        body.innerHTML += `<img src="${c.header_image_url}" alt="${htmlEsc(c.header_image_alt_ar)}" class="section-hero-img" loading="lazy">`;
      if (c.original_title) {
        body.innerHTML += `<p class="translation-source">${c.original_url
          ? `<a href="${htmlEsc(c.original_url)}" target="_blank" rel="noopener">${htmlEsc(c.original_title)}</a>`
          : htmlEsc(c.original_title)}${c.original_author ? ` — ${htmlEsc(c.original_author)}` : ''}</p>`;
      }
      if (c.translated_body_ar)
        body.innerHTML += `<div class="section-text">${c.translated_body_ar}</div>`;
      if (c.translator_note_ar)
        body.innerHTML += `<aside class="translator-note">${htmlEsc(c.translator_note_ar)}</aside>`;
      break;
  }

  el.appendChild(body);
  return el;
}

// ─── Utilities ────────────────────────────────────────────────

function htmlEsc(str) {
  return (str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  el.className   = className;
  el.textContent = text;
  return el;
}
```

---

## STEP 7 — admin/newsletter-list.html

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>النشرات — لوحة التحكم</title>
  <!-- AGENT: add the project's existing admin stylesheet(s) here if any -->
  <link rel="stylesheet" href="css/editor.css">
</head>
<body>

<div class="admin-page">
  <header class="topbar">
    <span class="topbar-title">النشرات</span>
    <a href="newsletter-editor.html" class="btn btn-primary">+ نشرة جديدة</a>
  </header>

  <main class="page-main">
    <div id="list-wrap">
      <table class="nl-table" id="nl-table">
        <thead>
          <tr>
            <th>العدد</th>
            <th>العنوان</th>
            <th>التاريخ</th>
            <th>الحالة</th>
            <th>الإجراءات</th>
          </tr>
        </thead>
        <tbody id="nl-tbody">
          <tr><td colspan="5" class="loading-cell">جاري التحميل…</td></tr>
        </tbody>
      </table>
    </div>
  </main>
</div>

<div id="toast" class="toast hidden"></div>

<!-- Script order: supabase → data helpers → auth → page logic -->
<script type="module">
  import '/js/supabase-client.js';
</script>
<script src="/js/newsletter-data.js"></script>
<script src="/admin/js/admin-auth.js"></script>
<script src="newsletter-list.js"></script>
</body>
</html>
```

---

## STEP 8 — admin/newsletter-list.js

```js
// admin/newsletter-list.js

document.addEventListener('DOMContentLoaded', async () => {
  await requireAdminAuth();

  const tbody = document.getElementById('nl-tbody');

  let newsletters;
  try {
    newsletters = await fetchNewsletterList();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="error-cell">فشل التحميل: ${err.message}</td></tr>`;
    return;
  }

  if (!newsletters.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">لا توجد نشرات بعد.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  const statusAr = { draft: 'مسودة', published: 'منشور', archived: 'مؤرشف' };

  newsletters.forEach(nl => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${nl.edition_number ?? '—'}</td>
      <td>${htmlEsc(nl.title_ar)}</td>
      <td>${nl.issue_date ? new Date(nl.issue_date).toLocaleDateString('ar-SA') : '—'}</td>
      <td><span class="badge badge-${nl.status}">${statusAr[nl.status] ?? nl.status}</span></td>
      <td class="actions">
        <a href="newsletter-editor.html?id=${nl.id}" class="btn btn-sm">تعديل</a>
        <button class="btn btn-sm btn-danger" data-id="${nl.id}">حذف</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.addEventListener('click', async e => {
    const deleteBtn = e.target.closest('[data-id]');
    if (!deleteBtn) return;
    if (!confirm('سيتم حذف هذه النشرة وكل محتواها نهائياً. هل أنت متأكد؟')) return;

    const id = deleteBtn.dataset.id;
    deleteBtn.disabled = true;

    const { error } = await window.supabase.from('newsletters').delete().eq('id', id);
    if (error) {
      showToast('فشل الحذف: ' + error.message, 'error');
      deleteBtn.disabled = false;
    } else {
      deleteBtn.closest('tr').remove();
    }
  });
});

function htmlEsc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast toast-${type}`;
  setTimeout(() => t.classList.add('hidden'), 3500);
}
```

---

## STEP 9 — admin/newsletter-editor.html

```html
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>محرر النشرة</title>
  <!-- AGENT: add existing admin stylesheet(s) here -->
  <link rel="stylesheet" href="css/editor.css">
</head>
<body>

<div class="admin-page" id="editor-page">

  <!-- Top bar -->
  <header class="topbar">
    <a href="newsletter-list.html" class="back-link">← النشرات</a>
    <span class="topbar-title" id="page-title">نشرة جديدة</span>
    <div class="topbar-actions">
      <button id="btn-draft"   class="btn btn-secondary" disabled>حفظ مسودة</button>
      <button id="btn-publish" class="btn btn-primary"   disabled>نشر</button>
    </div>
  </header>

  <main class="editor-main">

    <!-- ═══ Metadata ═══════════════════════════════════════════ -->
    <div class="editor-card" id="card-meta">
      <div class="card-head"><h2 class="card-title">معلومات النشرة</h2></div>
      <div class="card-body">
        <div class="field-row">
          <label class="field-label">العنوان (عربي) <span class="req">*</span></label>
          <input id="f-title-ar" type="text" class="field-input" dir="rtl" placeholder="عنوان النشرة">
        </div>
        <div class="field-row">
          <label class="field-label">العنوان (English)</label>
          <input id="f-title-en" type="text" class="field-input" dir="ltr" placeholder="Newsletter title">
        </div>
        <div class="field-split">
          <div class="field-col">
            <label class="field-label">رقم الإصدار</label>
            <input id="f-edition" type="number" class="field-input" placeholder="47">
          </div>
          <div class="field-col">
            <label class="field-label">تاريخ الإصدار</label>
            <input id="f-date" type="date" class="field-input">
          </div>
        </div>
        <div class="field-row">
          <label class="field-label">صورة الغلاف</label>
          <div class="upload-zone" id="cover-zone">
            <input id="f-cover-file" type="file" accept="image/*" class="upload-file-input">
            <img  id="cover-preview" class="upload-preview hidden" alt="">
            <span id="cover-ph"      class="upload-ph">اضغط لاختيار صورة</span>
          </div>
          <input id="f-cover-url" type="hidden">
        </div>
        <div class="field-row">
          <label class="field-label">التنقل في النشرة</label>
          <div class="radio-row">
            <label class="radio-lbl"><input type="radio" name="nav" value="filter" checked> فلتر (أزرار)</label>
            <label class="radio-lbl"><input type="radio" name="nav" value="tabs">   تبويبات</label>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Opening section (Illumination / Inspiring) ═════════ -->
    <div class="editor-card" id="card-opening">
      <div class="card-head">
        <h2 class="card-title">القسم الافتتاحي</h2>
        <div class="type-sw" id="opening-sw">
          <button class="type-btn active" data-slug="illumination">💡 إضاءة</button>
          <button class="type-btn"        data-slug="inspiring">✨ ملهم</button>
        </div>
      </div>

      <!-- Illumination -->
      <div class="card-body opening-panel" id="panel-illumination">
        <div class="field-row">
          <label class="field-label">صورة الرأس</label>
          <div class="upload-zone">
            <input type="file" accept="image/*" class="upload-file-input sec-img-file" data-sec="illumination">
            <img class="upload-preview hidden sec-img-preview" data-sec="illumination" alt="">
            <span class="upload-ph">اضغط لاختيار صورة</span>
          </div>
          <input type="hidden" class="sec-img-url" data-sec="illumination">
        </div>
        <div class="field-row">
          <label class="field-label">المحتوى <span class="req">*</span></label>
          <textarea id="illum-body" class="field-textarea" rows="10" dir="rtl" placeholder="اكتب الإضاءة هنا…"></textarea>
        </div>
      </div>

      <!-- Inspiring -->
      <div class="card-body opening-panel hidden" id="panel-inspiring">
        <div class="field-row">
          <label class="field-label">صورة الرأس</label>
          <div class="upload-zone">
            <input type="file" accept="image/*" class="upload-file-input sec-img-file" data-sec="inspiring">
            <img class="upload-preview hidden sec-img-preview" data-sec="inspiring" alt="">
            <span class="upload-ph">اضغط لاختيار صورة</span>
          </div>
          <input type="hidden" class="sec-img-url" data-sec="inspiring">
        </div>
        <div class="field-row">
          <label class="field-label">المحتوى <span class="req">*</span></label>
          <textarea id="insp-body" class="field-textarea" rows="10" dir="rtl" placeholder="اكتب ملهم هنا…"></textarea>
        </div>
      </div>
    </div>

    <!-- ═══ News ════════════════════════════════════════════════ -->
    <div class="editor-card" id="card-news">
      <div class="card-head">
        <h2 class="card-title">📰 الأخبار</h2>
        <label class="toggle-sw"><input type="checkbox" id="tog-news" checked><span class="slider"></span></label>
      </div>
      <div class="card-body" id="body-news">
        <div id="news-list"></div>
        <button type="button" class="btn btn-add" id="add-news">+ إضافة خبر</button>
      </div>
    </div>

    <!-- ═══ Articles ════════════════════════════════════════════ -->
    <div class="editor-card" id="card-articles">
      <div class="card-head">
        <h2 class="card-title">📝 المقالات</h2>
        <label class="toggle-sw"><input type="checkbox" id="tog-articles" checked><span class="slider"></span></label>
      </div>
      <div class="card-body" id="body-articles">
        <div id="articles-list"></div>
        <button type="button" class="btn btn-add" id="add-article">+ إضافة مقال</button>
      </div>
    </div>

    <!-- ═══ Podcast ═════════════════════════════════════════════ -->
    <div class="editor-card" id="card-podcast">
      <div class="card-head">
        <h2 class="card-title">🎙 البودكاست <span class="badge-optional">اختياري</span></h2>
        <label class="toggle-sw"><input type="checkbox" id="tog-podcast"><span class="slider"></span></label>
      </div>
      <div class="card-body hidden" id="body-podcast">
        <div class="field-row">
          <label class="field-label">عنوان الحلقة <span class="req">*</span></label>
          <input id="pod-title" type="text" class="field-input" dir="rtl">
        </div>
        <div class="field-row">
          <label class="field-label">الوصف</label>
          <textarea id="pod-desc" class="field-textarea" rows="3" dir="rtl"></textarea>
        </div>
        <div class="field-row">
          <label class="field-label">ملف الصوت <span class="req">*</span></label>
          <div class="upload-zone">
            <input id="pod-audio-file" type="file" accept="audio/*" class="upload-file-input">
            <span id="pod-audio-name" class="upload-ph">اضغط لاختيار ملف صوتي</span>
          </div>
          <input id="pod-audio-url" type="hidden">
        </div>
        <div class="field-row">
          <label class="field-label">رابط خارجي (Spotify / Apple Podcasts)</label>
          <input id="pod-ext" type="url" class="field-input" dir="ltr" placeholder="https://…">
        </div>
      </div>
    </div>

    <!-- ═══ Translation ═════════════════════════════════════════ -->
    <div class="editor-card" id="card-translation">
      <div class="card-head">
        <h2 class="card-title">🔤 الترجمة</h2>
        <label class="toggle-sw"><input type="checkbox" id="tog-translation" checked><span class="slider"></span></label>
      </div>
      <div class="card-body" id="body-translation">
        <div class="field-split">
          <div class="field-col">
            <label class="field-label">عنوان المقال الأصلي</label>
            <input id="tr-orig-title"  type="text" class="field-input" dir="ltr">
          </div>
          <div class="field-col">
            <label class="field-label">الكاتب</label>
            <input id="tr-orig-author" type="text" class="field-input" dir="ltr">
          </div>
        </div>
        <div class="field-row">
          <label class="field-label">رابط المصدر</label>
          <input id="tr-orig-url" type="url" class="field-input" dir="ltr" placeholder="https://…">
        </div>
        <div class="field-row">
          <label class="field-label">صورة الرأس</label>
          <div class="upload-zone">
            <input type="file" accept="image/*" class="upload-file-input sec-img-file" data-sec="translation">
            <img class="upload-preview hidden sec-img-preview" data-sec="translation" alt="">
            <span class="upload-ph">اضغط لاختيار صورة</span>
          </div>
          <input type="hidden" class="sec-img-url" data-sec="translation">
        </div>
        <div class="field-row">
          <label class="field-label">نص الترجمة <span class="req">*</span></label>
          <textarea id="tr-body" class="field-textarea" rows="12" dir="rtl" placeholder="الترجمة العربية…"></textarea>
        </div>
        <div class="field-row">
          <label class="field-label">ملاحظة المترجم</label>
          <textarea id="tr-note" class="field-textarea" rows="3" dir="rtl"></textarea>
        </div>
      </div>
    </div>

    <!-- ═══ Bottom actions ═════════════════════════════════════ -->
    <div class="editor-bottom">
      <button id="btn-draft-bot"   class="btn btn-secondary" disabled>حفظ مسودة</button>
      <button id="btn-publish-bot" class="btn btn-primary"   disabled>نشر</button>
    </div>

  </main>
</div>

<div id="toast" class="toast hidden"></div>

<!-- Script load order matters: supabase → data → auth → page logic -->
<script type="module">
  import '/js/supabase-client.js';
</script>
<script src="/js/newsletter-data.js"></script>
<script src="/admin/js/admin-auth.js"></script>
<script src="newsletter-editor.js"></script>
</body>
</html>
```

---

## STEP 10 — admin/newsletter-editor.js

```js
// admin/newsletter-editor.js
// Requires: window.supabase, newsletter-data.js, admin-auth.js

// ─── State ────────────────────────────────────────────────────
const S = {
  id:            null,   // current newsletter uuid, null = new
  sectionIds:    {},     // { slug: uuid } — set after first save or on edit load
  typeIds:       {},     // { slug: uuid } — loaded from section_types table
  activeOpening: 'illumination',
};

// ─── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await requireAdminAuth();

  // Load section type IDs
  const types = await fetchSectionTypes();
  types.forEach(t => { S.typeIds[t.slug] = t.id; });

  // Check for edit mode
  const editId = new URLSearchParams(location.search).get('id');
  if (editId) {
    S.id = editId;
    document.getElementById('page-title').textContent = 'تعديل النشرة';
    await loadForEditing(editId);
  }

  enableSaveButtons();
  bindAllEvents();
});

// ─── Load for editing ─────────────────────────────────────────
async function loadForEditing(id) {
  showToast('جاري التحميل…', 'info');
  try {
    const { newsletter, sections } = await fetchNewsletterForEditing(id);
    fillMetadata(newsletter);
    sections.forEach(sec => fillSection(sec));
    hideToast();
  } catch (err) {
    showToast('فشل التحميل: ' + err.message, 'error');
  }
}

function fillMetadata(nl) {
  val('f-title-ar', nl.title_ar);
  val('f-title-en', nl.title_en);
  val('f-edition',  nl.edition_number);
  val('f-date',     nl.issue_date);
  val('f-cover-url',nl.cover_image_url);
  if (nl.cover_image_url) setPreview('cover-preview', 'cover-ph', nl.cover_image_url);
  document.querySelectorAll('input[name="nav"]').forEach(r => {
    r.checked = r.value === (nl.nav_type || 'filter');
  });
}

function fillSection(sec) {
  const slug = sec.section_type.slug;
  S.sectionIds[slug] = sec.id;
  const c = sec.content || {};

  switch (slug) {
    case 'illumination':
      if (!sec.is_visible) return; // inspiring is active — skip populating illum fields
      setSecImage('illumination', c.header_image_url);
      val('illum-body', c.body_ar);
      break;

    case 'inspiring':
      if (!sec.is_visible) return;
      activateOpening('inspiring');
      setSecImage('inspiring', c.header_image_url);
      val('insp-body', c.body_ar);
      break;

    case 'news':
      checked('tog-news', sec.is_visible);
      toggleBody('body-news', sec.is_visible);
      renderNewsItems(c.items || []);
      break;

    case 'articles':
      checked('tog-articles', sec.is_visible);
      toggleBody('body-articles', sec.is_visible);
      renderArticleItems(c.items || []);
      break;

    case 'podcast':
      checked('tog-podcast', sec.is_visible);
      toggleBody('body-podcast', sec.is_visible);
      val('pod-title',     c.title_ar);
      val('pod-desc',      c.description_ar);
      val('pod-audio-url', c.audio_url);
      val('pod-ext',       c.external_link);
      if (c.audio_url) document.getElementById('pod-audio-name').textContent = 'ملف صوتي محمّل ✓';
      break;

    case 'translation':
      checked('tog-translation', sec.is_visible);
      toggleBody('body-translation', sec.is_visible);
      val('tr-orig-title',  c.original_title);
      val('tr-orig-author', c.original_author);
      val('tr-orig-url',    c.original_url);
      val('tr-body',        c.translated_body_ar);
      val('tr-note',        c.translator_note_ar);
      setSecImage('translation', c.header_image_url);
      break;
  }
}

// ─── Collect form → formData ───────────────────────────────────
function collectFormData() {
  const titleAr = g('f-title-ar').value.trim();
  if (!titleAr) { showToast('العنوان العربي مطلوب', 'error'); return null; }

  return {
    id:              S.id,
    title_ar:        titleAr,
    title_en:        g('f-title-en').value.trim() || null,
    edition_number:  parseInt(g('f-edition').value) || null,
    issue_date:      g('f-date').value || null,
    cover_image_url: g('f-cover-url').value || null,
    nav_type:        document.querySelector('input[name="nav"]:checked')?.value || 'filter',
    sections: [
      {
        id: S.sectionIds.illumination || null,
        section_type_id: S.typeIds.illumination,
        slug: 'illumination',
        is_visible: S.activeOpening === 'illumination',
        sort_order: 1,
        content: {
          header_image_url: getSecImgUrl('illumination'),
          body_ar: g('illum-body').value,
        },
      },
      {
        id: S.sectionIds.inspiring || null,
        section_type_id: S.typeIds.inspiring,
        slug: 'inspiring',
        is_visible: S.activeOpening === 'inspiring',
        sort_order: 2,
        content: {
          header_image_url: getSecImgUrl('inspiring'),
          body_ar: g('insp-body').value,
        },
      },
      {
        id: S.sectionIds.news || null,
        section_type_id: S.typeIds.news,
        slug: 'news',
        is_visible: g('tog-news').checked,
        sort_order: 3,
        content: { items: collectNewsItems() },
      },
      {
        id: S.sectionIds.articles || null,
        section_type_id: S.typeIds.articles,
        slug: 'articles',
        is_visible: g('tog-articles').checked,
        sort_order: 4,
        content: { items: collectArticleItems() },
      },
      {
        id: S.sectionIds.podcast || null,
        section_type_id: S.typeIds.podcast,
        slug: 'podcast',
        is_visible: g('tog-podcast').checked,
        sort_order: 5,
        content: {
          title_ar:       g('pod-title').value,
          description_ar: g('pod-desc').value,
          audio_url:      g('pod-audio-url').value,
          external_link:  g('pod-ext').value || null,
        },
      },
      {
        id: S.sectionIds.translation || null,
        section_type_id: S.typeIds.translation,
        slug: 'translation',
        is_visible: g('tog-translation').checked,
        sort_order: 6,
        content: {
          header_image_url:   getSecImgUrl('translation'),
          original_title:     g('tr-orig-title').value  || null,
          original_author:    g('tr-orig-author').value || null,
          original_url:       g('tr-orig-url').value    || null,
          translated_body_ar: g('tr-body').value,
          translator_note_ar: g('tr-note').value || null,
        },
      },
    ],
  };
}

// ─── Save ─────────────────────────────────────────────────────
async function handleSave(publishAfterSave) {
  const formData = collectFormData();
  if (!formData) return;

  disableSaveButtons(true);
  showToast('جاري الحفظ…', 'info');

  try {
    const id = await saveNewsletter(formData);
    S.id = id;

    // Reload section IDs so subsequent saves update rather than insert
    const { sections } = await fetchNewsletterForEditing(id);
    sections.forEach(sec => { S.sectionIds[sec.section_type.slug] = sec.id; });

    if (publishAfterSave) await setNewsletterStatus(id, 'published');

    history.replaceState({}, '', `?id=${id}`);
    document.getElementById('page-title').textContent = 'تعديل النشرة';
    showToast(publishAfterSave ? 'تم النشر ✓' : 'تم الحفظ ✓', 'success');
  } catch (err) {
    console.error(err);
    showToast('خطأ: ' + err.message, 'error');
  } finally {
    disableSaveButtons(false);
  }
}

// ─── News items ────────────────────────────────────────────────
function renderNewsItems(items) {
  const list = document.getElementById('news-list');
  list.innerHTML = '';
  items.forEach((item, i) => list.appendChild(buildNewsItemEl(item, i)));
}

function buildNewsItemEl(item = {}, idx = 0) {
  const d = document.createElement('div');
  d.className = 'repeat-item';
  d.innerHTML = `
    <div class="repeat-head">
      <span class="repeat-label">خبر ${idx + 1}</span>
      <button type="button" class="btn-rm" title="حذف">✕</button>
    </div>
    <div class="field-row">
      <label class="field-label">العنوان <span class="req">*</span></label>
      <input type="text" class="field-input ni-title" value="${e(item.title_ar)}" dir="rtl">
    </div>
    <div class="field-split">
      <div class="field-col">
        <label class="field-label">المصدر</label>
        <input type="text" class="field-input ni-source" value="${e(item.source_name_ar)}" dir="rtl">
      </div>
      <div class="field-col">
        <label class="field-label">الرابط</label>
        <input type="url" class="field-input ni-url" value="${e(item.source_url)}" dir="ltr" placeholder="https://…">
      </div>
    </div>
    <div class="field-row">
      <label class="field-label">الملخص</label>
      <textarea class="field-textarea ni-summary" rows="2" dir="rtl">${e(item.summary_ar)}</textarea>
    </div>`;
  d.querySelector('.btn-rm').addEventListener('click', () => d.remove());
  return d;
}

function collectNewsItems() {
  return [...document.querySelectorAll('#news-list .repeat-item')].map(el => ({
    title_ar:       el.querySelector('.ni-title').value.trim(),
    source_name_ar: el.querySelector('.ni-source').value.trim() || null,
    source_url:     el.querySelector('.ni-url').value.trim()    || null,
    summary_ar:     el.querySelector('.ni-summary').value.trim()|| null,
  }));
}

// ─── Article items ─────────────────────────────────────────────
function renderArticleItems(items) {
  const list = document.getElementById('articles-list');
  list.innerHTML = '';
  items.forEach((item, i) => list.appendChild(buildArticleItemEl(item, i)));
}

function buildArticleItemEl(item = {}, idx = 0) {
  const d = document.createElement('div');
  d.className = 'repeat-item';
  d.innerHTML = `
    <div class="repeat-head">
      <span class="repeat-label">مقال ${idx + 1}</span>
      <button type="button" class="btn-rm" title="حذف">✕</button>
    </div>
    <div class="field-row">
      <label class="field-label">العنوان <span class="req">*</span></label>
      <input type="text" class="field-input ai-title" value="${e(item.title_ar)}" dir="rtl">
    </div>
    <div class="field-split">
      <div class="field-col">
        <label class="field-label">الكاتب</label>
        <input type="text" class="field-input ai-author" value="${e(item.author_name_ar)}" dir="rtl">
      </div>
      <div class="field-col">
        <label class="field-label">رابط المقال</label>
        <input type="url" class="field-input ai-url" value="${e(item.article_url)}" dir="ltr" placeholder="https://…">
      </div>
    </div>
    <div class="field-row">
      <label class="field-label">مقتطف</label>
      <textarea class="field-textarea ai-excerpt" rows="2" dir="rtl">${e(item.excerpt_ar)}</textarea>
    </div>`;
  d.querySelector('.btn-rm').addEventListener('click', () => d.remove());
  return d;
}

function collectArticleItems() {
  return [...document.querySelectorAll('#articles-list .repeat-item')].map(el => ({
    title_ar:      el.querySelector('.ai-title').value.trim(),
    author_name_ar:el.querySelector('.ai-author').value.trim() || null,
    article_url:   el.querySelector('.ai-url').value.trim()    || null,
    excerpt_ar:    el.querySelector('.ai-excerpt').value.trim()|| null,
  }));
}

// ─── Image upload helper ───────────────────────────────────────
function bindUpload(fileInput, previewEl, phEl, hiddenInput, prefix) {
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    phEl.textContent = 'جاري الرفع…';
    try {
      const url = await uploadFile(file, prefix);
      hiddenInput.value = url;
      previewEl.src = url;
      previewEl.classList.remove('hidden');
      phEl.classList.add('hidden');
    } catch (err) {
      phEl.textContent = 'فشل الرفع — حاول مرة أخرى';
      console.error(err);
    }
  });
}

function getSecImgUrl(sec) {
  return document.querySelector(`.sec-img-url[data-sec="${sec}"]`)?.value || null;
}

function setSecImage(sec, url) {
  if (!url) return;
  const img = document.querySelector(`.sec-img-preview[data-sec="${sec}"]`);
  const ph  = document.querySelector(`.sec-img-file[data-sec="${sec}"]`)
                        ?.closest('.upload-zone')
                        ?.querySelector('.upload-ph');
  const hid = document.querySelector(`.sec-img-url[data-sec="${sec}"]`);
  if (img) { img.src = url; img.classList.remove('hidden'); }
  if (ph)  { ph.classList.add('hidden'); }
  if (hid) { hid.value = url; }
}

// ─── Opening panel switcher ────────────────────────────────────
function activateOpening(slug) {
  S.activeOpening = slug;
  document.querySelectorAll('.type-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.slug === slug));
  document.getElementById('panel-illumination').classList.toggle('hidden', slug !== 'illumination');
  document.getElementById('panel-inspiring').classList.toggle('hidden',    slug !== 'inspiring');
}

// ─── Bind all events ──────────────────────────────────────────
function bindAllEvents() {
  // Save buttons
  g('btn-draft').addEventListener('click',       () => handleSave(false));
  g('btn-publish').addEventListener('click',     () => handleSave(true));
  g('btn-draft-bot').addEventListener('click',   () => handleSave(false));
  g('btn-publish-bot').addEventListener('click', () => handleSave(true));

  // Opening switcher
  document.querySelectorAll('.type-btn').forEach(btn =>
    btn.addEventListener('click', () => activateOpening(btn.dataset.slug)));

  // Section toggle → show/hide card body
  [
    ['tog-news',        'body-news'],
    ['tog-articles',    'body-articles'],
    ['tog-podcast',     'body-podcast'],
    ['tog-translation', 'body-translation'],
  ].forEach(([togId, bodyId]) =>
    g(togId).addEventListener('change', e => toggleBody(bodyId, e.target.checked)));

  // Add repeatable items
  g('add-news').addEventListener('click', () => {
    const list = document.getElementById('news-list');
    list.appendChild(buildNewsItemEl({}, list.querySelectorAll('.repeat-item').length));
  });
  g('add-article').addEventListener('click', () => {
    const list = document.getElementById('articles-list');
    list.appendChild(buildArticleItemEl({}, list.querySelectorAll('.repeat-item').length));
  });

  // Cover image
  bindUpload(
    g('f-cover-file'),
    g('cover-preview'),
    g('cover-ph'),
    g('f-cover-url'),
    'covers'
  );

  // Section images (illumination, inspiring, translation)
  document.querySelectorAll('.sec-img-file').forEach(fileInput => {
    const sec     = fileInput.dataset.sec;
    const zone    = fileInput.closest('.upload-zone');
    const preview = zone.querySelector('.upload-preview');
    const ph      = zone.querySelector('.upload-ph');
    const hidden  = document.querySelector(`.sec-img-url[data-sec="${sec}"]`);
    bindUpload(fileInput, preview, ph, hidden, sec);
  });

  // Podcast audio
  g('pod-audio-file').addEventListener('change', async () => {
    const file = g('pod-audio-file').files[0];
    if (!file) return;
    g('pod-audio-name').textContent = 'جاري الرفع…';
    try {
      const url = await uploadFile(file, 'podcast');
      g('pod-audio-url').value = url;
      g('pod-audio-name').textContent = file.name + ' ✓';
    } catch (err) {
      g('pod-audio-name').textContent = 'فشل الرفع — حاول مرة أخرى';
    }
  });
}

// ─── Utilities ────────────────────────────────────────────────
const g   = id => document.getElementById(id);
const val = (id, v) => { const el = g(id); if (el) el.value = v ?? ''; };
const checked = (id, v) => { const el = g(id); if (el) el.checked = !!v; };

function e(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toggleBody(bodyId, show) {
  g(bodyId)?.classList.toggle('hidden', !show);
}

function setPreview(imgId, phId, url) {
  const img = g(imgId); const ph = g(phId);
  if (img) { img.src = url; img.classList.remove('hidden'); }
  if (ph)  { ph.classList.add('hidden'); }
}

function enableSaveButtons() {
  ['btn-draft','btn-publish','btn-draft-bot','btn-publish-bot'].forEach(id => {
    const el = g(id); if (el) el.disabled = false;
  });
}

function disableSaveButtons(disabled) {
  ['btn-draft','btn-publish','btn-draft-bot','btn-publish-bot'].forEach(id => {
    const el = g(id); if (el) el.disabled = disabled;
  });
}

function showToast(msg, type = 'info') {
  const t = g('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast toast-${type}`;
  if (type !== 'info') setTimeout(hideToast, 3500);
}
function hideToast() {
  g('toast')?.classList.add('hidden');
}
```

---

## STEP 11 — admin/css/editor.css

```css
/* admin/css/editor.css — RTL admin editor */
*, *::before, *::after { box-sizing: border-box; }

:root {
  --border:   #e5e7eb;
  --bg:       #fff;
  --bg2:      #f9fafb;
  --text:     #111827;
  --muted:    #6b7280;
  --primary:  #2563eb;
  --primary-h:#1d4ed8;
  --danger:   #dc2626;
  --green:    #16a34a;
  --r:        10px;
  direction: rtl;
}
body { margin:0; font-family:'Cairo','Tajawal',system-ui,sans-serif;
       background:var(--bg2); color:var(--text); font-size:14px; }

/* Topbar */
.topbar {
  display:flex; align-items:center; gap:12px; padding:12px 24px;
  background:var(--bg); border-bottom:1px solid var(--border);
  position:sticky; top:0; z-index:100;
}
.topbar-title { font-size:16px; font-weight:600; flex:1; }
.topbar-actions { display:flex; gap:8px; }
.back-link { color:var(--muted); text-decoration:none; font-size:13px; }
.back-link:hover { color:var(--text); }

/* Layout */
.editor-main, .page-main { max-width:800px; margin:0 auto; padding:24px 16px; }
.page-main { max-width:960px; }

/* Card */
.editor-card { background:var(--bg); border:1px solid var(--border);
                border-radius:var(--r); margin-bottom:20px; overflow:hidden; }
.card-head { display:flex; align-items:center; gap:12px; padding:14px 18px;
             background:var(--bg2); border-bottom:1px solid var(--border); }
.card-title { font-size:15px; font-weight:600; margin:0; flex:1; }
.card-body { padding:18px; }
.card-body.hidden { display:none; }

/* Fields */
.field-row    { margin-bottom:16px; }
.field-split  { display:flex; gap:12px; margin-bottom:16px; }
.field-col    { flex:1; min-width:0; }
.field-label  { display:block; font-size:12px; color:var(--muted); margin-bottom:5px; }
.req          { color:var(--danger); }
.field-input  {
  width:100%; padding:9px 12px; border:1px solid var(--border); border-radius:8px;
  font-size:14px; font-family:inherit; color:var(--text); background:var(--bg);
}
.field-input:focus { outline:none; border-color:var(--primary); }
.field-textarea {
  width:100%; padding:9px 12px; border:1px solid var(--border); border-radius:8px;
  font-size:14px; font-family:inherit; resize:vertical; color:var(--text); background:var(--bg);
}
.field-textarea:focus { outline:none; border-color:var(--primary); }

/* Upload zone */
.upload-zone {
  border:1.5px dashed var(--border); border-radius:8px; padding:16px;
  text-align:center; cursor:pointer; position:relative; transition:border-color .15s;
}
.upload-zone:hover { border-color:var(--primary); }
.upload-file-input {
  position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; height:100%;
}
.upload-preview { width:100%; max-height:200px; object-fit:cover; border-radius:6px; display:block; }
.upload-ph { font-size:13px; color:var(--muted); }

/* Radio */
.radio-row  { display:flex; gap:20px; }
.radio-lbl  { font-size:14px; display:flex; align-items:center; gap:6px; cursor:pointer; }

/* Type switcher */
.type-sw  { display:flex; gap:3px; background:var(--border); border-radius:8px; padding:3px; }
.type-btn {
  padding:5px 14px; border:none; background:transparent;
  border-radius:6px; font-size:13px; font-family:inherit; cursor:pointer;
}
.type-btn.active { background:var(--bg); font-weight:600; box-shadow:0 1px 3px rgba(0,0,0,.1); }

/* Opening panels */
.opening-panel.hidden { display:none; }

/* Toggle switch — RTL-aware */
.toggle-sw { position:relative; width:40px; height:22px; flex-shrink:0; }
.toggle-sw input { opacity:0; width:0; height:0; position:absolute; }
.toggle-sw .slider {
  position:absolute; inset:0; background:var(--border); border-radius:22px;
  cursor:pointer; transition:background .2s;
}
.toggle-sw .slider::after {
  content:''; position:absolute;
  top:3px; right:3px;          /* RTL: thumb starts on the right */
  width:16px; height:16px; border-radius:50%; background:#fff;
  transition:transform .2s;
}
.toggle-sw input:checked + .slider { background:#22c55e; }
.toggle-sw input:checked + .slider::after {
  transform:translateX(-18px); /* RTL: thumb moves LEFT when on */
}

/* Repeatable items */
.repeat-item {
  border:1px solid var(--border); border-radius:8px;
  padding:14px; margin-bottom:10px; background:var(--bg2);
}
.repeat-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.repeat-label { font-size:13px; font-weight:600; color:var(--muted); }
.btn-rm { background:none; border:none; cursor:pointer; font-size:16px; color:var(--muted); padding:2px 6px; }
.btn-rm:hover { color:var(--danger); }

/* Buttons */
.btn {
  padding:9px 18px; border-radius:8px; font-size:14px; font-family:inherit;
  cursor:pointer; border:1px solid var(--border); background:var(--bg); color:var(--text);
  transition:background .15s, opacity .15s;
}
.btn:hover    { background:var(--bg2); }
.btn:disabled { opacity:.45; cursor:not-allowed; pointer-events:none; }
.btn-primary  { background:var(--primary); color:#fff; border-color:var(--primary); }
.btn-primary:hover { background:var(--primary-h); }
.btn-secondary { border-color:var(--border); }
.btn-danger   { color:var(--danger); border-color:var(--danger); }
.btn-sm       { padding:5px 12px; font-size:13px; }
.btn-add      { width:100%; margin-top:6px; }

/* Badges */
.badge-optional {
  font-size:11px; padding:2px 7px; background:var(--bg2);
  border:1px solid var(--border); border-radius:4px; color:var(--muted);
}
.badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:12px; }
.badge-draft     { background:#fef9c3; color:#854d0e; }
.badge-published { background:#dcfce7; color:#166534; }
.badge-archived  { background:var(--bg2); color:var(--muted); }

/* Bottom actions */
.editor-bottom { display:flex; gap:10px; justify-content:flex-end; padding-top:8px; }

/* Toast */
.toast {
  position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
  padding:10px 22px; border-radius:8px; font-size:14px;
  background:var(--text); color:#fff; z-index:9999; white-space:nowrap;
}
.toast.hidden { display:none; }
.toast-success { background:var(--green); }
.toast-error   { background:var(--danger); }
.toast-info    { background:#374151; }

/* List table */
.nl-table { width:100%; border-collapse:collapse; font-size:14px; }
.nl-table th, .nl-table td {
  padding:10px 14px; border-bottom:1px solid var(--border); text-align:right;
}
.nl-table th { background:var(--bg2); font-weight:600; font-size:13px; }
.nl-table tr:hover td { background:var(--bg2); }
.actions { display:flex; gap:6px; }
.loading-cell, .empty-cell, .error-cell {
  text-align:center; color:var(--muted); padding:32px; font-size:15px;
}
.error-cell { color:var(--danger); }
```

---

## STEP 12 — Public newsletter page

Locate the existing public newsletter HTML file (path found in Step 0). Edit it in place. Preserve `<head>`, the site navigation, and footer. Replace only the newsletter content region.

The content region must contain exactly these elements. Insert them where the old newsletter content was:

```html
<!-- Newsletter content region — replace whatever was here before -->
<div class="nl-page" dir="rtl">
  <img id="nl-cover" class="newsletter-cover hidden" alt="">
  <h1 class="newsletter-title"></h1>
  <!-- Filter pills shown when nav_type = 'filter' -->
  <div class="filter-bar"></div>
  <!-- Tab bar shown when nav_type = 'tabs' -->
  <nav class="newsletter-nav" role="tablist" aria-label="أقسام النشرة"></nav>
  <!-- Section content injected here -->
  <div id="newsletter-sections"></div>
</div>
```

At the bottom of the file, before `</body>`, add these script tags — **replacing** any old newsletter-loading scripts:

```html
<link rel="stylesheet" href="/css/newsletter.css">
<script type="module">
  import '/js/supabase-client.js';
</script>
<script src="/js/newsletter-data.js"></script>
<script src="/js/newsletter-render.js"></script>
<script>
  // AGENT DECISION: the URL param name is taken from what Step 0 found.
  // If the old page used ?id=, keep 'id'. If it used ?nid= or ?slug=, change this.
  initNewsletterPage('id');
</script>
```

---

## STEP 13 — css/newsletter.css

Append to the existing public CSS file if one exists, or create a new file:

```css
/* css/newsletter.css — public newsletter page */

.nl-page        { direction:rtl; max-width:720px; margin:0 auto; padding:0 16px; }
.newsletter-cover { width:100%; border-radius:12px; margin-bottom:24px; }
.newsletter-title { font-size:26px; font-weight:700; margin:0 0 20px; }

/* Filter bar */
.filter-bar {
  display:flex; flex-wrap:wrap; gap:8px; padding:12px 0;
  position:sticky; top:0; background:#fff; z-index:10;
}
.filter-pill {
  padding:6px 14px; border-radius:20px; border:1px solid #e5e7eb;
  background:transparent; font-size:13px; font-family:inherit;
  cursor:pointer; transition:background .15s, color .15s;
}
.filter-pill.active { background:#111; color:#fff; border-color:transparent; }

/* Tab bar */
.newsletter-nav { display:flex; border-bottom:1px solid #e5e7eb; overflow-x:auto; scrollbar-width:none; }
.newsletter-nav::-webkit-scrollbar { display:none; }
.tab {
  padding:10px 18px; background:none; border:none; border-bottom:2px solid transparent;
  font-size:14px; font-family:inherit; cursor:pointer; white-space:nowrap;
  color:#6b7280; transition:color .15s, border-color .15s;
}
.tab.active { border-bottom-color:#111; color:#111; font-weight:600; }

/* Sections */
.newsletter-section      { padding:32px 0; border-bottom:1px solid #e5e7eb; }
.newsletter-section:last-child { border-bottom:none; }
.section-header { display:flex; align-items:center; gap:8px; margin-bottom:20px; }
.section-icon   { font-size:20px; }
.section-title  { font-size:22px; font-weight:700; margin:0; }
.section-hero-img { width:100%; border-radius:12px; margin-bottom:20px; object-fit:cover; }
.section-text   { font-size:16px; line-height:1.9; }

/* News */
.news-item      { display:flex; gap:12px; padding:14px 0; border-bottom:1px solid #e5e7eb; }
.news-item:last-child { border-bottom:none; }
.news-thumb     { width:80px; height:60px; object-fit:cover; border-radius:6px; flex-shrink:0; }
.news-item-body { flex:1; }
.news-title     { font-size:15px; font-weight:600; margin:0 0 4px; }
.news-title a   { color:inherit; text-decoration:none; }
.news-title a:hover { text-decoration:underline; }
.news-source    { font-size:12px; color:#6b7280; }
.news-summary   { font-size:13px; margin:6px 0 0; line-height:1.6; }

/* Articles */
.article-item      { display:flex; gap:12px; padding:16px 0; border-bottom:1px solid #e5e7eb; }
.article-item:last-child { border-bottom:none; }
.article-thumb     { width:100px; height:72px; object-fit:cover; border-radius:6px; flex-shrink:0; }
.article-item-body { flex:1; }
.article-title     { font-size:15px; font-weight:600; margin:0 0 4px; }
.article-title a   { color:inherit; text-decoration:none; }
.article-title a:hover { text-decoration:underline; }
.article-author    { font-size:12px; color:#6b7280; }
.article-excerpt   { font-size:13px; margin:6px 0 0; line-height:1.6; }

/* Podcast */
.podcast-player  { display:flex; flex-wrap:wrap; gap:16px; align-items:flex-start; }
.podcast-cover   { width:120px; height:120px; object-fit:cover; border-radius:10px; flex-shrink:0; }
.podcast-info    { flex:1; min-width:200px; }
.podcast-title   { font-size:17px; font-weight:700; margin:0 0 6px; }
.podcast-desc    { font-size:14px; line-height:1.6; margin:0 0 8px; }
.podcast-dur     { font-size:12px; color:#6b7280; }
.podcast-audio   { width:100%; margin-top:12px; }
.podcast-ext-link { display:inline-block; margin-top:8px; font-size:13px; text-decoration:underline; }

/* Translation */
.translation-source     { font-size:13px; color:#6b7280; margin-bottom:16px; }
.translation-source a   { color:inherit; }
.translator-note {
  margin-top:24px; padding:12px 16px;
  border-right:3px solid #e5e7eb;  /* RTL: accent border on the right */
  font-size:14px; font-style:italic; color:#6b7280;
}

/* Error */
.nl-error { text-align:center; color:#dc2626; padding:40px; font-size:15px; }
```

---

## STEP 14 — Final checklist

Do not mark the work complete until every box passes.

**Database**
- [ ] `schema.sql` ran without errors in Supabase SQL editor
- [ ] All 8 section tables exist in the Supabase table editor
- [ ] `newsletter_sections` has UNIQUE constraint on `(newsletter_id, section_type_id)`
- [ ] Storage bucket `newsletter-media` exists and is public
- [ ] `set_updated_at` trigger exists on all relevant tables
- [ ] RLS policies applied if the project uses RLS

**Supabase client**
- [ ] `js/supabase-client.js` contains real SUPABASE_URL and SUPABASE_ANON_KEY values
- [ ] `window.supabase` is accessible from browser console on every page

**Admin — list page** (`/admin/newsletter-list.html`)
- [ ] Auth guard redirects unauthenticated users to login
- [ ] Existing newsletters render in the table
- [ ] Edit button opens editor pre-filled with correct data
- [ ] Delete button removes the newsletter and all CASCADE children

**Admin — editor page** (`/admin/newsletter-editor.html`)
- [ ] New newsletter: pressing Save creates rows in newsletters + newsletter_sections + all applicable section tables
- [ ] Edit newsletter: all existing content loads into the correct fields on page load
- [ ] Illumination/Inspiring switcher: activating one sets `is_visible = false` on the other; both rows are still written to the DB
- [ ] News items: add + remove inline; all rows persisted on Save
- [ ] Article items: add + remove inline; all rows persisted on Save
- [ ] Podcast toggle starts OFF (is_optional = true); toggling ON expands the card
- [ ] Cover image upload writes the URL to `newsletters.cover_image_url`
- [ ] Section header image uploads write URLs to `section_illumination.header_image_url` etc.
- [ ] Podcast audio upload writes URL to `section_podcast.audio_url`
- [ ] Save Draft → `status = 'draft'`; Publish → `status = 'published'`
- [ ] URL updates to `?id=UUID` after first save with no page reload
- [ ] Toast confirms save/publish/error

**Public newsletter page**
- [ ] `?id=UUID` of a published newsletter renders the full page
- [ ] `nav_type = 'filter'` → filter pills; `nav_type = 'tabs'` → tab bar
- [ ] Only `is_visible = true` sections appear in nav and on page
- [ ] Invisible podcast section → no pill or tab rendered
- [ ] All 6 section types render their content correctly
- [ ] `dir="rtl"` on the root container; layout is correct throughout

**Cross-page queries (verify in browser console)**
- [ ] `await fetchAllIlluminations()` returns rows from published newsletters only
- [ ] `await fetchLatestNewsItems(4)` returns the correct 4 items from the newest published newsletter

---

## CRITICAL RULES

1. **RTL everywhere.** `dir="rtl"` is the default. `dir="ltr"` appears only on inputs explicitly marked for English or URL text.

2. **RTL toggle switch.** Thumb starts at `right: 3px`. Moves with `translateX(-18px)`. A standard LTR snippet copied without this change produces a broken toggle.

3. **RTL decorative border.** The translator's note uses `border-right`, not `border-left`.

4. **Separate tables are mandatory.** Do not collapse section tables back into a generic `content_blocks` table. The architecture requires each section type to be independently queryable.

5. **One Supabase client.** Do not call `createClient` more than once. All scripts share `window.supabase`.

6. **Script load order.** Every HTML page must load scripts in this order: supabase-client → newsletter-data → (admin-auth if admin page) → page-specific script.

7. **`fetchLatestNewsItems` uses three separate queries.** Do not replace them with a single `.filter('section_type.slug', 'eq', 'news')` call — filtering on a joined table column is not supported in the Supabase JS SDK and silently returns wrong results.

8. **Do not break existing URLs.** The newsletter display URL pattern found in Step 0 must continue to work after the migration.

9. **Implement fully and autonomously.** All 12 deliverables from STEP 1 must exist and be complete. Never stop to ask for confirmation.
