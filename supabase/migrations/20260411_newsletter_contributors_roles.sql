-- Migration: Add fixed bilingual contributor role fields to newsletter_editors
-- Created: 2026-04-11

ALTER TABLE public.newsletter_editors
  ADD COLUMN IF NOT EXISTS article_writer_ar text,
  ADD COLUMN IF NOT EXISTS news_hunters_ar text,
  ADD COLUMN IF NOT EXISTS content_writers_ar text,
  ADD COLUMN IF NOT EXISTS designers_ar text,
  ADD COLUMN IF NOT EXISTS member_affairs_ar text,
  ADD COLUMN IF NOT EXISTS newsletter_leader_ar text,
  ADD COLUMN IF NOT EXISTS newsletter_deputy_ar text,
  ADD COLUMN IF NOT EXISTS article_writer_en text,
  ADD COLUMN IF NOT EXISTS news_hunters_en text,
  ADD COLUMN IF NOT EXISTS content_writers_en text,
  ADD COLUMN IF NOT EXISTS designers_en text,
  ADD COLUMN IF NOT EXISTS member_affairs_en text,
  ADD COLUMN IF NOT EXISTS newsletter_leader_en text,
  ADD COLUMN IF NOT EXISTS newsletter_deputy_en text;

-- Backfill from legacy columns when available (safe across different older schemas)
DO $$
DECLARE
  has_writer_ar boolean;
  has_writer_en boolean;
  has_news_ar boolean;
  has_news_en boolean;
  has_design_ar boolean;
  has_design_en boolean;
  has_leader_ar boolean;
  has_leader_en boolean;
  has_deputy_ar boolean;
  has_deputy_en boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'newsletter_editors' AND column_name = 'writer_ar'
  ) INTO has_writer_ar;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'newsletter_editors' AND column_name = 'writer_en'
  ) INTO has_writer_en;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'newsletter_editors' AND column_name = 'news_ar'
  ) INTO has_news_ar;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'newsletter_editors' AND column_name = 'news_en'
  ) INTO has_news_en;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'newsletter_editors' AND column_name = 'design_ar'
  ) INTO has_design_ar;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'newsletter_editors' AND column_name = 'design_en'
  ) INTO has_design_en;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'newsletter_editors' AND column_name = 'leader_ar'
  ) INTO has_leader_ar;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'newsletter_editors' AND column_name = 'leader_en'
  ) INTO has_leader_en;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'newsletter_editors' AND column_name = 'deputy_ar'
  ) INTO has_deputy_ar;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'newsletter_editors' AND column_name = 'deputy_en'
  ) INTO has_deputy_en;

  IF has_writer_ar THEN
    EXECUTE 'UPDATE public.newsletter_editors SET article_writer_ar = COALESCE(article_writer_ar, writer_ar)';
  END IF;
  IF has_writer_en THEN
    EXECUTE 'UPDATE public.newsletter_editors SET article_writer_en = COALESCE(article_writer_en, writer_en)';
  END IF;
  IF has_news_ar THEN
    EXECUTE 'UPDATE public.newsletter_editors SET news_hunters_ar = COALESCE(news_hunters_ar, news_ar)';
  END IF;
  IF has_news_en THEN
    EXECUTE 'UPDATE public.newsletter_editors SET news_hunters_en = COALESCE(news_hunters_en, news_en)';
  END IF;
  IF has_design_ar THEN
    EXECUTE 'UPDATE public.newsletter_editors SET designers_ar = COALESCE(designers_ar, design_ar)';
  END IF;
  IF has_design_en THEN
    EXECUTE 'UPDATE public.newsletter_editors SET designers_en = COALESCE(designers_en, design_en)';
  END IF;
  IF has_leader_ar THEN
    EXECUTE 'UPDATE public.newsletter_editors SET newsletter_leader_ar = COALESCE(newsletter_leader_ar, leader_ar)';
  END IF;
  IF has_leader_en THEN
    EXECUTE 'UPDATE public.newsletter_editors SET newsletter_leader_en = COALESCE(newsletter_leader_en, leader_en)';
  END IF;
  IF has_deputy_ar THEN
    EXECUTE 'UPDATE public.newsletter_editors SET newsletter_deputy_ar = COALESCE(newsletter_deputy_ar, deputy_ar)';
  END IF;
  IF has_deputy_en THEN
    EXECUTE 'UPDATE public.newsletter_editors SET newsletter_deputy_en = COALESCE(newsletter_deputy_en, deputy_en)';
  END IF;
END $$;
