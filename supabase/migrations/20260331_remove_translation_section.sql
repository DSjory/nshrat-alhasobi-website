-- Migration: Remove 'translation' section type and all associated newsletter sections
-- Created: 2026-03-31
-- Description: Removes the الترجمة (translation) section from the newsletter system since it's not a standalone section type.

BEGIN;

-- Step 1: Delete all newsletter_sections entries that reference the 'translation' section type
DELETE FROM public.newsletter_sections
WHERE section_type_id = (
  SELECT id FROM public.section_types WHERE slug = 'translation'
);

-- Step 2: Delete the 'translation' section_type record itself
DELETE FROM public.section_types
WHERE slug = 'translation';

-- Commit transaction
COMMIT;
