-- Add missing newsletter and section header columns on existing databases.
-- Safe to run multiple times.

ALTER TABLE public.newsletters
  ADD COLUMN IF NOT EXISTS reading_time varchar(255),
  ADD COLUMN IF NOT EXISTS reading_time_en varchar(255),
  ADD COLUMN IF NOT EXISTS welcome_message text DEFAULT 'Welcome to the Hasoobi newsletter... / اهلا بك في نشرة الحاسوبي',
  ADD COLUMN IF NOT EXISTS welcome_message_en text,
  ADD COLUMN IF NOT EXISTS has_translation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS translated_content text;

ALTER TABLE public.newsletter_sections
  ADD COLUMN IF NOT EXISTS header_image_url text,
  ADD COLUMN IF NOT EXISTS header_image_alt_ar text;

ALTER TABLE public.section_news_items
  ADD COLUMN IF NOT EXISTS summary_en text,
  ADD COLUMN IF NOT EXISTS source_name_en text;

ALTER TABLE public.section_article_items
  ADD COLUMN IF NOT EXISTS author_name_en text,
  ADD COLUMN IF NOT EXISTS excerpt_en text;

ALTER TABLE public.section_podcast
  ADD COLUMN IF NOT EXISTS description_en text;
