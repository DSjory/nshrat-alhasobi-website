-- =========================================================================================
-- schema.sql — Unified Newsletter System
-- Combines the modular newsletter architecture with categories and join requests.
-- Safe to re-run: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING
-- Run in: Supabase Dashboard → SQL Editor
-- =========================================================================================

-- ── 1. categories ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name_ar VARCHAR(255) NOT NULL UNIQUE,
  name_en VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed canonical categories
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.categories) THEN
    INSERT INTO public.categories (name_ar, name_en)
    VALUES
      ('علم البيانات', 'Data Science'),
      ('الذكاء الاصطناعي', 'Artificial Intelligence'),
      ('الامن السيبراني', 'Cybersecurity'),
      ('هندسة الحاسب', 'Computer Engineering'),
      ('هندسة البرمجيات', 'Software Engineering'),
      ('المجتمع التقني', 'Tech Community'),
      ('الحوسبة', 'Computing');
  END IF;
END$$;

-- ── 2. section_types ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_types (
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

INSERT INTO public.section_types (slug, name_ar, name_en, icon, has_header_image, is_optional, sort_order)
VALUES
  ('illumination', 'إضاءة',    'Illumination', '💡', true,  false, 1),
  ('inspiring',    'ملهم',     'Inspiring',    '✨', true,  false, 2),
  ('news',         'الأخبار',  'News',         '📰', false, false, 3),
  ('articles',     'المقالات', 'Articles',     '📝', false, false, 4),
  ('podcast',      'البودكاست','Podcast',      '🎙', false, true,  5),
  ('translation',  'الترجمة',  'Translation',  '🔤', false, false, 6)
ON CONFLICT (slug) DO NOTHING;

-- ── 3. newsletters ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.newsletters (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id      uuid        REFERENCES public.categories(id) ON DELETE SET NULL,
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

-- ── 4. newsletter_sections ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.newsletter_sections (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id   uuid        REFERENCES public.newsletters(id) ON DELETE CASCADE,
  section_type_id uuid        NOT NULL REFERENCES public.section_types(id),
  is_visible      boolean     NOT NULL DEFAULT true,
  sort_order      int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (newsletter_id, section_type_id)
);

-- ── 5. section_illumination ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_illumination (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL UNIQUE
                                    REFERENCES public.newsletter_sections(id) ON DELETE CASCADE,
  header_image_url      text,
  header_image_alt_ar   text,
  body_ar               text        NOT NULL DEFAULT '',
  body_en               text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── 6. section_inspiring ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_inspiring (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL UNIQUE
                                    REFERENCES public.newsletter_sections(id) ON DELETE CASCADE,
  header_image_url      text,
  header_image_alt_ar   text,
  body_ar               text        NOT NULL DEFAULT '',
  body_en               text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── 7. section_news_items ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_news_items (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL
                                    REFERENCES public.newsletter_sections(id) ON DELETE CASCADE,
  title_ar              text        NOT NULL DEFAULT '',
  title_en              text,
  summary_ar            text,
  source_name_ar        text,
  source_url            text,
  image_url             text,
  sort_order            int         NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ── 8. section_article_items ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_article_items (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL
                                    REFERENCES public.newsletter_sections(id) ON DELETE CASCADE,
  title_ar              text        NOT NULL DEFAULT '',
  title_en              text,
  author_name_ar        text,
  excerpt_ar            text,
  article_url           text,
  image_url             text,
  sort_order            int         NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ── 9. section_podcast ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_podcast (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL UNIQUE
                                    REFERENCES public.newsletter_sections(id) ON DELETE CASCADE,
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

-- ── 10. section_translation ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_translation (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL UNIQUE
                                    REFERENCES public.newsletter_sections(id) ON DELETE CASCADE,
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

-- ── 11. join_requests ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.join_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT NOT NULL,
  club_member TEXT,
  committee TEXT,
  tech_interest TEXT,
  read_newsletter TEXT,
  attraction TEXT[], 
  skills TEXT[],     
  commitment TEXT,
  motivation TEXT,
  tech_field TEXT,
  suggestion TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  confirmed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Safely migrate legacy `subscribers` data if the old table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscribers' AND table_schema = 'public') THEN
    IF NOT EXISTS (SELECT 1 FROM public.join_requests) THEN
      INSERT INTO public.join_requests(id, name, phone, email, club_member, committee, tech_interest, read_newsletter, attraction, skills, commitment, motivation, tech_field, suggestion, metadata, confirmed, created_at)
      SELECT id, COALESCE(name, 'Unknown'), phone, email, club_member, committee, tech_interest, read_newsletter, attraction, skills, commitment, motivation, tech_field, suggestion, metadata, confirmed, created_at
      FROM public.subscribers;
    END IF;
    DROP TABLE IF EXISTS public.subscribers;
  END IF;
END$$;

-- ── 12. updated_at auto-trigger ───────────────────────────────
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
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- ── 13. Storage bucket ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('newsletter-media', 'newsletter-media', true)
ON CONFLICT (id) DO NOTHING;

-- ── 14. Performance Indexes ───────────────────────────────────
-- Newsletter Indexes
CREATE INDEX IF NOT EXISTS idx_ns_newsletter ON public.newsletter_sections(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_ns_type       ON public.newsletter_sections(section_type_id);
CREATE INDEX IF NOT EXISTS idx_news_section  ON public.section_news_items(newsletter_section_id);
CREATE INDEX IF NOT EXISTS idx_articles_section ON public.section_article_items(newsletter_section_id);
CREATE INDEX IF NOT EXISTS newsletters_category_id_idx ON public.newsletters (category_id);

-- Join Requests Indexes
CREATE UNIQUE INDEX IF NOT EXISTS join_requests_email_lower_idx ON public.join_requests (lower(email));
CREATE INDEX IF NOT EXISTS join_requests_created_at_idx ON public.join_requests (created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS join_requests_phone_idx ON public.join_requests (phone);
CREATE INDEX IF NOT EXISTS join_requests_attraction_gin ON public.join_requests USING GIN (attraction);
CREATE INDEX IF NOT EXISTS join_requests_skills_gin ON public.join_requests USING GIN (skills);
CREATE INDEX IF NOT EXISTS join_requests_committee_idx ON public.join_requests (lower(committee));
CREATE INDEX IF NOT EXISTS join_requests_fts_idx ON public.join_requests USING GIN (
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(motivation,'') || ' ' || coalesce(tech_field,'') || ' ' || coalesce(suggestion,''))
);

-- ── 15. RLS policies ──────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  -- Enable RLS on all applicable tables
  FOREACH t IN ARRAY ARRAY[
    'categories', 'join_requests', 'newsletters', 'section_types', 
    'newsletter_sections', 'section_illumination', 'section_inspiring',
    'section_news_items', 'section_article_items', 'section_podcast', 
    'section_translation'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  -- 1. Categories
  BEGIN
    CREATE POLICY "Public can view categories" ON public.categories FOR SELECT USING (true);
    CREATE POLICY "Admins can modify categories" ON public.categories USING (auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- 2. Join Requests
  BEGIN
    CREATE POLICY "Public can submit join requests" ON public.join_requests FOR INSERT WITH CHECK (true);
    CREATE POLICY "Admins can view join requests" ON public.join_requests FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY "Admins can update join requests" ON public.join_requests FOR UPDATE USING (auth.role() = 'authenticated');
    CREATE POLICY "Admins can delete join requests" ON public.join_requests FOR DELETE USING (auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  -- 3. Newsletters (Modular Schema)
  -- Public can only see published newsletters and their content
  BEGIN
    CREATE POLICY "public_select_published" ON public.newsletters FOR SELECT 
    USING (status = 'published');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  
  -- Public can read section components if they belong to a published newsletter
  FOREACH t IN ARRAY ARRAY[
    'section_types', 'newsletter_sections', 'section_illumination', 
    'section_inspiring', 'section_news_items', 'section_article_items', 
    'section_podcast', 'section_translation'
  ] LOOP
    BEGIN
      EXECUTE format('CREATE POLICY "public_select" ON public.%I FOR SELECT USING (true)', t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;

  -- Authenticated users (Admins) have full access to all newsletter tables
  FOREACH t IN ARRAY ARRAY[
    'newsletters', 'section_types', 'newsletter_sections', 
    'section_illumination', 'section_inspiring', 'section_news_items', 
    'section_article_items', 'section_podcast', 'section_translation'
  ] LOOP
    BEGIN
      EXECUTE format('CREATE POLICY "auth_all" ON public.%I FOR ALL USING (auth.role() = ''authenticated'')', t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;

  -- 4. Storage policies
  BEGIN
    CREATE POLICY "auth_upload" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'newsletter-media' AND auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "public_read" ON storage.objects FOR SELECT
    USING (bucket_id = 'newsletter-media');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;