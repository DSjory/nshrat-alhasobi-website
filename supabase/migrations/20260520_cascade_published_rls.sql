-- 20260520_cascade_published_rls.sql
--
-- Closes a confidentiality hole: child tables of `newsletters` (sections,
-- editors, illumination/inspiring/news/article/podcast content) currently
-- allow anonymous SELECT with `USING (true)`. The `newsletters` table itself
-- correctly hides drafts (status != 'published'), but the children don't,
-- so a public client can read draft body content by querying the child
-- tables directly.
--
-- This migration replaces every child-table public_select policy with one
-- that EXISTS-joins back to `newsletters` and requires both:
--   • parent newsletter status = 'published'
--   • parent newsletter_sections.is_visible = true  (where applicable)
--
-- The authenticated admin policy (`auth_all`) is left intact, so admins
-- continue to see drafts and hidden sections. Multiple policies OR for the
-- same role, so admins keep full access.
--
-- Safe to re-run: each CREATE POLICY is wrapped in EXCEPTION WHEN
-- duplicate_object, and each DROP is IF EXISTS.

BEGIN;

-- ── newsletter_sections — gate on parent newsletter being published ──────────
DROP POLICY IF EXISTS "public_select"           ON public.newsletter_sections;
DROP POLICY IF EXISTS "public_select_published" ON public.newsletter_sections;
CREATE POLICY "public_select_published" ON public.newsletter_sections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.newsletters n
      WHERE n.id = newsletter_sections.newsletter_id
        AND n.status = 'published'
    )
  );

-- ── newsletter_editors — same cascade ────────────────────────────────────────
DROP POLICY IF EXISTS "public_select"           ON public.newsletter_editors;
DROP POLICY IF EXISTS "public_select_published" ON public.newsletter_editors;
CREATE POLICY "public_select_published" ON public.newsletter_editors
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.newsletters n
      WHERE n.id = newsletter_editors.newsletter_id
        AND n.status = 'published'
    )
  );

-- ── section_* content tables — two-hop cascade ───────────────────────────────
-- Each row joins through newsletter_sections to newsletters. Public reads
-- additionally require the section to be marked visible. Admins (auth_all)
-- bypass this via the OR'd policy.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'section_illumination',
    'section_inspiring',
    'section_news_items',
    'section_article_items',
    'section_podcast'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "public_select"           ON public.%I', tbl);
    EXECUTE format(
      'DROP POLICY IF EXISTS "public_select_published" ON public.%I', tbl);
    EXECUTE format($pol$
      CREATE POLICY "public_select_published" ON public.%I
        FOR SELECT
        USING (
          EXISTS (
            SELECT 1
              FROM public.newsletter_sections ns
              JOIN public.newsletters         n  ON n.id = ns.newsletter_id
             WHERE ns.id = %I.newsletter_section_id
               AND n.status     = 'published'
               AND ns.is_visible = true
          )
        )
    $pol$, tbl, tbl);
  END LOOP;
END $$;


-- ── Supporting index for the cascade lookup ──────────────────────────────────
-- Already declared in PART 7 of schema.sql but repeated here defensively in
-- case the migration is applied to a DB that predates it. CREATE INDEX IF
-- NOT EXISTS is idempotent.
CREATE INDEX IF NOT EXISTS idx_newsletters_status
  ON public.newsletters (status);


-- ── Verification queries (commented; run by hand to confirm) ─────────────────
-- 1. As anon, draft section content must return zero rows:
--      SELECT count(*) FROM section_illumination si
--      JOIN newsletter_sections ns ON ns.id = si.newsletter_section_id
--      JOIN newsletters         n  ON n.id  = ns.newsletter_id
--      WHERE n.status = 'draft';
--    Expected (anon role): 0
--    Expected (authenticated): the real count
--
-- 2. List all policies on a child table to confirm both exist:
--      SELECT policyname, cmd FROM pg_policies
--      WHERE tablename = 'section_illumination';
--    Expected: public_select_published (SELECT) + auth_all (ALL)

COMMIT;
