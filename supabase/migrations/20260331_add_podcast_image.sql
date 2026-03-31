-- Add dedicated podcast image for section_podcast.
-- This image is rendered below podcast text and is independent from section header image.

ALTER TABLE public.section_podcast
  ADD COLUMN IF NOT EXISTS podcast_image_url text;
