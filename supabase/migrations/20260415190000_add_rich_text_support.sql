-- Rich text support for section body fields (idempotent)
-- Date: 2026-04-15

ALTER TABLE public.section_illumination
  ADD COLUMN IF NOT EXISTS body_ar text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS body_en text;

ALTER TABLE public.section_illumination
  ALTER COLUMN body_ar TYPE text,
  ALTER COLUMN body_en TYPE text;

ALTER TABLE public.section_inspiring
  ADD COLUMN IF NOT EXISTS body_ar text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS body_en text;

ALTER TABLE public.section_inspiring
  ALTER COLUMN body_ar TYPE text,
  ALTER COLUMN body_en TYPE text;
