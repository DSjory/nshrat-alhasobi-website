-- Add missing newsletter and section header columns on existing databases.
-- Safe to run multiple times.

ALTER TABLE public.newsletters
  ADD COLUMN IF NOT EXISTS reading_time varchar(255),
  ADD COLUMN IF NOT EXISTS welcome_message text DEFAULT 'Welcome to the Hasoobi newsletter... / اهلا بك في نشرة الحاسوبي',
  ADD COLUMN IF NOT EXISTS has_translation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS translated_content text;

ALTER TABLE public.newsletter_sections
  ADD COLUMN IF NOT EXISTS header_image_url text,
  ADD COLUMN IF NOT EXISTS header_image_alt_ar text;
