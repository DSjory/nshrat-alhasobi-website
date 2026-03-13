-- schema.sql — Newsletter system (from agent)
-- Run in Supabase SQL editor. Safe to re-run.

-- section_types
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

-- newsletters
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

-- newsletter_sections
CREATE TABLE IF NOT EXISTS newsletter_sections (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id   uuid        REFERENCES newsletters(id) ON DELETE CASCADE,
  section_type_id uuid        NOT NULL REFERENCES section_types(id),
  is_visible      boolean     NOT NULL DEFAULT true,
  sort_order      int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (newsletter_id, section_type_id)
);

CREATE INDEX IF NOT EXISTS idx_ns_newsletter ON newsletter_sections(newsletter_id);
CREATE INDEX IF NOT EXISTS idx_ns_type       ON newsletter_sections(section_type_id);

-- section_illumination
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

-- section_inspiring
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

-- section_news_items
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

-- section_article_items
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

-- section_podcast
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

-- section_translation
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

-- updated_at trigger
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

-- Storage bucket insert (id only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('newsletter-media', 'newsletter-media', true)
ON CONFLICT (id) DO NOTHING;
