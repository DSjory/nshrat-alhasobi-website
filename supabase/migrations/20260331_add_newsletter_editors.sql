-- Migration: Add newsletter_editors table
-- Purpose: Store newsletter editors/contributors with their names and roles
-- Created: 2026-03-31

CREATE TABLE IF NOT EXISTS public.newsletter_editors (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id   uuid        NOT NULL REFERENCES public.newsletters(id) ON DELETE CASCADE,
  name_ar         text        NOT NULL DEFAULT '',
  role_ar         text        NOT NULL DEFAULT '',
  name_en         text,
  role_en         text,
  sort_order      int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_newsletter_editors_newsletter_id 
  ON public.newsletter_editors(newsletter_id);

-- Add trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS set_newsletter_editors_updated_at ON public.newsletter_editors;
CREATE TRIGGER set_newsletter_editors_updated_at
  BEFORE UPDATE ON public.newsletter_editors
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Add audit logging trigger
DROP TRIGGER IF EXISTS audit_newsletter_editors ON public.newsletter_editors;
CREATE TRIGGER audit_newsletter_editors
  AFTER INSERT OR UPDATE OR DELETE ON public.newsletter_editors
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_trigger_fn();
