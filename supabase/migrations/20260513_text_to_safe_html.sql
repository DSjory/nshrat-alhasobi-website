-- 20260513_text_to_safe_html.sql
-- One-time migration: convert legacy plain-text content in rich-text columns
-- to safe HTML so newlines and runs of spaces are preserved on render.
--
-- Skips any value that already contains an HTML tag (idempotent — safe to re-run).
-- Mirrors the logic of js/rich-text.js → textToSafeHtml(...).
--
-- After this runs, the affected columns store HTML. The public renderer already
-- sanitizes on read via DOMPurify (defense in depth).

BEGIN;

-- Temporary helper. Dropped at the end of this migration.
CREATE OR REPLACE FUNCTION _text_to_safe_html(t text) RETURNS text AS $$
DECLARE
  result text;
  mat    text[];
  n      int;
BEGIN
  IF t IS NULL OR t = '' THEN
    RETURN t;
  END IF;

  -- HTML entity escape (order matters: & first)
  result := t;
  result := replace(result, '&',  '&amp;');
  result := replace(result, '<',  '&lt;');
  result := replace(result, '>',  '&gt;');
  result := replace(result, '"',  '&quot;');
  result := replace(result, '''', '&#39;');

  -- Normalise line endings, then convert
  result := regexp_replace(result, E'\r\n?', E'\n', 'g');
  result := replace(result, E'\n', '<br>');
  result := replace(result, E'\t', '&nbsp;&nbsp;&nbsp;&nbsp;');

  -- Convert each run of 2+ spaces into the same number of &nbsp;
  -- (Postgres regexp_replace has no length-aware substitution, so loop.)
  LOOP
    mat := regexp_match(result, '( {2,})');
    EXIT WHEN mat IS NULL;
    n := length(mat[1]);
    result := regexp_replace(result, ' {2,}', repeat('&nbsp;', n), '');
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper: looks-like-HTML predicate.  Same heuristic as looksLikeHtml() in JS.
CREATE OR REPLACE FUNCTION _looks_like_html(t text) RETURNS boolean AS $$
  SELECT t IS NOT NULL AND t ~* '<[a-z!/]';
$$ LANGUAGE sql IMMUTABLE;

-- ─── newsletters ────────────────────────────────────────────────────────────
UPDATE public.newsletters
   SET welcome_message = _text_to_safe_html(welcome_message)
 WHERE welcome_message IS NOT NULL
   AND welcome_message <> ''
   AND NOT _looks_like_html(welcome_message);

UPDATE public.newsletters
   SET welcome_message_en = _text_to_safe_html(welcome_message_en)
 WHERE welcome_message_en IS NOT NULL
   AND welcome_message_en <> ''
   AND NOT _looks_like_html(welcome_message_en);

-- ─── section_illumination ───────────────────────────────────────────────────
UPDATE public.section_illumination
   SET body_ar = _text_to_safe_html(body_ar)
 WHERE body_ar IS NOT NULL
   AND body_ar <> ''
   AND NOT _looks_like_html(body_ar);

UPDATE public.section_illumination
   SET body_en = _text_to_safe_html(body_en)
 WHERE body_en IS NOT NULL
   AND body_en <> ''
   AND NOT _looks_like_html(body_en);

-- ─── section_inspiring ──────────────────────────────────────────────────────
UPDATE public.section_inspiring
   SET body_ar = _text_to_safe_html(body_ar)
 WHERE body_ar IS NOT NULL
   AND body_ar <> ''
   AND NOT _looks_like_html(body_ar);

UPDATE public.section_inspiring
   SET body_en = _text_to_safe_html(body_en)
 WHERE body_en IS NOT NULL
   AND body_en <> ''
   AND NOT _looks_like_html(body_en);

-- ─── section_news_items ─────────────────────────────────────────────────────
UPDATE public.section_news_items
   SET summary_ar = _text_to_safe_html(summary_ar)
 WHERE summary_ar IS NOT NULL
   AND summary_ar <> ''
   AND NOT _looks_like_html(summary_ar);

UPDATE public.section_news_items
   SET summary_en = _text_to_safe_html(summary_en)
 WHERE summary_en IS NOT NULL
   AND summary_en <> ''
   AND NOT _looks_like_html(summary_en);

-- ─── section_article_items ──────────────────────────────────────────────────
UPDATE public.section_article_items
   SET excerpt_ar = _text_to_safe_html(excerpt_ar)
 WHERE excerpt_ar IS NOT NULL
   AND excerpt_ar <> ''
   AND NOT _looks_like_html(excerpt_ar);

UPDATE public.section_article_items
   SET excerpt_en = _text_to_safe_html(excerpt_en)
 WHERE excerpt_en IS NOT NULL
   AND excerpt_en <> ''
   AND NOT _looks_like_html(excerpt_en);

-- ─── section_podcast ────────────────────────────────────────────────────────
UPDATE public.section_podcast
   SET description_ar = _text_to_safe_html(description_ar)
 WHERE description_ar IS NOT NULL
   AND description_ar <> ''
   AND NOT _looks_like_html(description_ar);

UPDATE public.section_podcast
   SET description_en = _text_to_safe_html(description_en)
 WHERE description_en IS NOT NULL
   AND description_en <> ''
   AND NOT _looks_like_html(description_en);

-- Clean up temporary helpers.
DROP FUNCTION _text_to_safe_html(text);
DROP FUNCTION _looks_like_html(text);

COMMIT;
