-- 20260520_quill_alignment_normalize.sql
--
-- Companion to the Quill 2 rich-text editor migration in the admin CMS.
--
-- Two passes, both idempotent and safe to re-run:
--
--   1. Repeat the plain-text → safe-HTML conversion from 20260513 so rows
--      that were inserted between that migration and this one also get
--      their newlines/spacing preserved (see js/rich-text.js → textToSafeHtml).
--
--   2. Defensive normalisation — convert Quill's class-based align/direction
--      markup (`class="ql-align-right"`, `class="ql-direction-rtl"`) into the
--      inline-style form (`style="text-align: right"`, `dir="rtl"`) we now
--      register at editor init. This is a no-op on databases that never held
--      class-based markup, but covers any data imported from external Quill
--      instances.
--
-- The CMS pipeline writes only inline-style markup; this migration exists so
-- the public renderer's CSS-free output stays correct regardless of which
-- code path produced the row.

BEGIN;

-- ── Pass 1: helper functions (session-local, dropped at end) ─────────────────
CREATE OR REPLACE FUNCTION pg_temp._text_to_safe_html(t text) RETURNS text AS $$
DECLARE
  result text;
  mat    text[];
  n      int;
BEGIN
  IF t IS NULL OR t = '' THEN RETURN t; END IF;
  result := t;
  result := replace(result, '&',  '&amp;');
  result := replace(result, '<',  '&lt;');
  result := replace(result, '>',  '&gt;');
  result := replace(result, '"',  '&quot;');
  result := replace(result, '''', '&#39;');
  result := regexp_replace(result, E'\r\n?', E'\n', 'g');
  result := replace(result, E'\n', '<br>');
  result := replace(result, E'\t', '&nbsp;&nbsp;&nbsp;&nbsp;');
  LOOP
    mat := regexp_match(result, '( {2,})');
    EXIT WHEN mat IS NULL;
    n := length(mat[1]);
    result := regexp_replace(result, ' {2,}', repeat('&nbsp;', n), '');
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp._looks_like_html(t text) RETURNS boolean AS $$
  SELECT t IS NOT NULL AND t ~* '<[a-z!/]';
$$ LANGUAGE sql IMMUTABLE;

-- ── Pass 2: Quill class → inline style normaliser ────────────────────────────
-- Converts the four align classes and the direction class into the
-- equivalent inline-style markup. Idempotent: if the input has no `ql-` class
-- the function returns it unchanged.
CREATE OR REPLACE FUNCTION pg_temp._normalize_quill_classes(t text) RETURNS text AS $$
DECLARE r text;
BEGIN
  IF t IS NULL OR position('ql-' in t) = 0 THEN RETURN t; END IF;
  r := t;

  -- Single-class cases: replace the whole `class="ql-..."` attribute.
  r := regexp_replace(r, 'class="ql-align-center"',  'style="text-align: center"',  'gi');
  r := regexp_replace(r, 'class="ql-align-right"',   'style="text-align: right"',   'gi');
  r := regexp_replace(r, 'class="ql-align-justify"', 'style="text-align: justify"', 'gi');
  r := regexp_replace(r, 'class="ql-align-left"',    'style="text-align: left"',    'gi');
  r := regexp_replace(r, 'class="ql-direction-rtl"', 'dir="rtl"',                   'gi');
  r := regexp_replace(r, 'class="ql-direction-ltr"', 'dir="ltr"',                   'gi');

  -- Combined classes (direction + align). Two orderings.
  r := regexp_replace(
        r,
        'class="ql-direction-(rtl|ltr)\s+ql-align-(center|right|justify|left)"',
        'dir="\1" style="text-align: \2"',
        'gi');
  r := regexp_replace(
        r,
        'class="ql-align-(center|right|justify|left)\s+ql-direction-(rtl|ltr)"',
        'style="text-align: \1" dir="\2"',
        'gi');

  RETURN r;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Apply both passes to every rich-text column ──────────────────────────────
DO $$
DECLARE
  _target record;
  _sql    text;
BEGIN
  FOR _target IN
    SELECT * FROM (VALUES
      ('newsletters',           'welcome_message'),
      ('newsletters',           'welcome_message_en'),
      ('section_illumination',  'body_ar'),
      ('section_illumination',  'body_en'),
      ('section_inspiring',     'body_ar'),
      ('section_inspiring',     'body_en'),
      ('section_news_items',    'summary_ar'),
      ('section_news_items',    'summary_en'),
      ('section_article_items', 'excerpt_ar'),
      ('section_article_items', 'excerpt_en'),
      ('section_podcast',       'description_ar'),
      ('section_podcast',       'description_en')
    ) AS t(table_name, column_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = _target.table_name
        AND column_name  = _target.column_name
    ) THEN CONTINUE;
    END IF;

    -- Pass 1: plain-text → HTML for any straggler rows.
    _sql := format(
      'UPDATE public.%I
          SET %I = pg_temp._text_to_safe_html(%I)
        WHERE %I IS NOT NULL
          AND %I <> ''''
          AND NOT pg_temp._looks_like_html(%I)',
      _target.table_name,
      _target.column_name, _target.column_name,
      _target.column_name, _target.column_name, _target.column_name
    );
    EXECUTE _sql;

    -- Pass 2: Quill class → inline-style normalisation.
    _sql := format(
      'UPDATE public.%I
          SET %I = pg_temp._normalize_quill_classes(%I)
        WHERE %I IS NOT NULL
          AND position(''ql-'' in %I) > 0',
      _target.table_name,
      _target.column_name, _target.column_name,
      _target.column_name, _target.column_name
    );
    EXECUTE _sql;
  END LOOP;

  DROP FUNCTION IF EXISTS pg_temp._text_to_safe_html(text);
  DROP FUNCTION IF EXISTS pg_temp._looks_like_html(text);
  DROP FUNCTION IF EXISTS pg_temp._normalize_quill_classes(text);
END $$;

COMMIT;
