-- =========================================================================================
-- full_schema.sql — Unified Newsletter System + Audit Log System
-- Includes: all domain tables, audit logging, realtime, hardened user identity,
--           updated_at stamps, storage bucket, indexes, views, RLS policies.
--
-- Execution order (dependency-safe):
--   1.  Domain tables (FK order)
--   2.  Audit log table
--   3.  Trigger functions (set_updated_at, audit_trigger_fn)
--   4.  BEFORE triggers  (updated_at stamp — fires first)
--   5.  AFTER  triggers  (audit log     — fires after row is committed)
--   6.  Storage bucket
--   7.  Realtime publication + REPLICA IDENTITY
--   8.  Indexes
--   9.  Dashboard views
--   10. Row-Level Security
--
-- Safe to re-run on an existing database:
--   CREATE TABLE IF NOT EXISTS  /  CREATE OR REPLACE FUNCTION
--   DROP TRIGGER IF EXISTS before each CREATE TRIGGER
--   ON CONFLICT DO NOTHING on seed inserts
--   EXCEPTION WHEN duplicate_object THEN NULL on policies
-- =========================================================================================


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 1 — DOMAIN TABLES
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. categories ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar    VARCHAR(255) NOT NULL UNIQUE,
  name_en    VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Seed canonical categories (skipped if any row already exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.categories) THEN
    INSERT INTO public.categories (name_ar, name_en) VALUES
      ('علم البيانات',     'Data Science'),
      ('الذكاء الاصطناعي', 'Artificial Intelligence'),
      ('الامن السيبراني',  'Cybersecurity'),
      ('هندسة الحاسب',    'Computer Engineering'),
      ('هندسة البرمجيات',  'Software Engineering'),
      ('المجتمع التقني',   'Tech Community'),
      ('الحوسبة',          'Computing');
  END IF;
END $$;


-- ── 2. section_types ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_types (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text        NOT NULL UNIQUE,
  name_ar          text        NOT NULL,
  name_en          text        NOT NULL,
  icon             text,
  has_header_image boolean     NOT NULL DEFAULT false,
  is_optional      boolean     NOT NULL DEFAULT false,
  sort_order       int         NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.section_types
  (slug, name_ar, name_en, icon, has_header_image, is_optional, sort_order)
VALUES
  ('illumination', 'إضاءة',     'Illumination', '💡', true,  false, 1),
  ('inspiring',    'ملهم',      'Inspiring',    '✨', true,  false, 2),
  ('news',         'الأخبار',   'News',         '📰', false, false, 3),
  ('articles',     'المقالات',  'Articles',     '📝', false, false, 4),
  ('podcast',      'البودكاست', 'Podcast',      '🎙', false, true,  5),
  ('translation',  'الترجمة',   'Translation',  '🔤', false, false, 6)
ON CONFLICT (slug) DO NOTHING;


-- ── 3. newsletters ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.newsletters (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid        REFERENCES public.categories(id) ON DELETE SET NULL,
  title_ar        text        NOT NULL DEFAULT '',
  title_en        text,
  edition_number  int,
  issue_date      date,
  cover_image_url text,
  reading_time    varchar(255),
  welcome_message text        DEFAULT 'Welcome to the Hasoobi newsletter... / اهلا بك في نشرة الحاسوبي',
  has_translation boolean     NOT NULL DEFAULT false,
  translated_content text,
  nav_type        text        NOT NULL DEFAULT 'filter'
                              CHECK (nav_type IN ('tabs', 'filter')),
  status          text        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'published', 'archived')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Backfill columns for pre-existing databases (CREATE TABLE IF NOT EXISTS will not add new columns)
ALTER TABLE public.newsletters
  ADD COLUMN IF NOT EXISTS reading_time varchar(255),
  ADD COLUMN IF NOT EXISTS welcome_message text DEFAULT 'Welcome to the Hasoobi newsletter... / اهلا بك في نشرة الحاسوبي',
  ADD COLUMN IF NOT EXISTS has_translation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS translated_content text;


-- ── 4. newsletter_sections ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.newsletter_sections (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id   uuid        REFERENCES public.newsletters(id) ON DELETE CASCADE,
  section_type_id uuid        NOT NULL REFERENCES public.section_types(id),
  header_image_url text,
  header_image_alt_ar text,
  is_visible      boolean     NOT NULL DEFAULT true,
  sort_order      int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (newsletter_id, section_type_id)
);

-- Backfill columns for pre-existing databases
ALTER TABLE public.newsletter_sections
  ADD COLUMN IF NOT EXISTS header_image_url text,
  ADD COLUMN IF NOT EXISTS header_image_alt_ar text;


-- ── 5. section_illumination ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_illumination (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL UNIQUE
                                    REFERENCES public.newsletter_sections(id) ON DELETE CASCADE,
  header_image_url      text,
  header_image_alt_ar   text,
  body_ar               text        NOT NULL DEFAULT '',
  body_en               text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);


-- ── 6. section_inspiring ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_inspiring (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL UNIQUE
                                    REFERENCES public.newsletter_sections(id) ON DELETE CASCADE,
  header_image_url      text,
  header_image_alt_ar   text,
  body_ar               text        NOT NULL DEFAULT '',
  body_en               text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);


-- ── 7. section_news_items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_news_items (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL
                                    REFERENCES public.newsletter_sections(id) ON DELETE CASCADE,
  title_ar              text        NOT NULL DEFAULT '',
  title_en              text,
  summary_ar            text,
  source_name_ar        text,
  source_url            text,
  image_url             text,
  sort_order            int         NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);


-- ── 8. section_article_items ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_article_items (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL
                                    REFERENCES public.newsletter_sections(id) ON DELETE CASCADE,
  title_ar              text        NOT NULL DEFAULT '',
  title_en              text,
  author_name_ar        text,
  excerpt_ar            text,
  article_url           text,
  image_url             text,
  sort_order            int         NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);


-- ── 9. section_podcast ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_podcast (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL UNIQUE
                                    REFERENCES public.newsletter_sections(id) ON DELETE CASCADE,
  title_ar              text        NOT NULL DEFAULT '',
  title_en              text,
  description_ar        text,
  audio_url             text        NOT NULL DEFAULT '',
  cover_image_url       text,
  duration_seconds      int,
  external_link         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);


-- ── 10. section_translation ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.section_translation (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_section_id uuid        NOT NULL UNIQUE
                                    REFERENCES public.newsletter_sections(id) ON DELETE CASCADE,
  header_image_url      text,
  header_image_alt_ar   text,
  original_title        text,
  original_author       text,
  original_url          text,
  original_language     text        NOT NULL DEFAULT 'en',
  translated_body_ar    text        NOT NULL DEFAULT '',
  translator_note_ar    text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);


-- ── 11. join_requests ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.join_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT        NOT NULL,
  phone           TEXT,
  email           TEXT        NOT NULL,
  club_member     TEXT,
  committee       TEXT,
  tech_interest   TEXT,
  read_newsletter TEXT,
  attraction      TEXT[],
  skills          TEXT[],
  commitment      TEXT,
  motivation      TEXT,
  tech_field      TEXT,
  suggestion      TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  confirmed       BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safely migrate legacy subscribers table if it still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscribers'
  ) THEN
    IF NOT EXISTS (SELECT 1 FROM public.join_requests) THEN
      INSERT INTO public.join_requests (
        id, name, phone, email, club_member, committee, tech_interest,
        read_newsletter, attraction, skills, commitment, motivation,
        tech_field, suggestion, metadata, confirmed, created_at
      )
      SELECT
        id,
        COALESCE(name, 'Unknown'),
        phone, email, club_member, committee, tech_interest,
        read_newsletter, attraction, skills, commitment, motivation,
        tech_field, suggestion,
        COALESCE(metadata, '{}'::jsonb),
        COALESCE(confirmed, false),
        created_at
      FROM public.subscribers;
    END IF;
    DROP TABLE IF EXISTS public.subscribers;
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 2 — AUDIT LOG TABLE
-- Defined before any trigger functions so the function body can reference it.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 12. audit_logs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (

  -- Identity
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- What changed
  schema_name    text        NOT NULL DEFAULT 'public',
  table_name     text        NOT NULL,
  record_id      text,
  -- ^ PK of the affected row cast to text; NULL for bulk ops with no single PK
  action         text        NOT NULL
                             CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),

  -- Data snapshots
  old_data       jsonb,      -- NULL on INSERT
  new_data       jsonb,      -- NULL on DELETE
  changed_fields text[],     -- populated on UPDATE only

  -- Who performed the action (from Supabase Auth JWT)
  user_id        uuid,       -- auth.uid()         — NULL when anonymous
  user_email     text,       -- JWT claim "email"  — NULL when anonymous
  user_role      text,       -- 'authenticated' | 'anon' | 'service_role'

  -- HTTP request context (populated by Supabase PostgREST / Edge Functions)
  client_ip      text,       -- x-forwarded-for header
  user_agent     text,       -- user-agent header
  request_id     text        -- x-request-id header
);

-- audit_logs is append-only — no client may INSERT, UPDATE, or DELETE directly.
-- The SECURITY DEFINER trigger function bypasses this revoke.
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 3 — TRIGGER FUNCTIONS
-- Both functions must exist before any trigger references them.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 13. set_updated_at() ──────────────────────────────────────────────────────
-- Stamps updated_at = now() on every BEFORE UPDATE.
-- Runs BEFORE the row is committed so the AFTER audit snapshot sees the final value.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ── 14. audit_trigger_fn() ────────────────────────────────────────────────────
-- Captures INSERT / UPDATE / DELETE on every domain table.
--
-- SECURITY DEFINER — runs as table owner so it can always write to audit_logs
--   regardless of the calling user's role.
-- SET search_path = public — prevents search-path injection attacks.
--
-- User-identity strategy (priority order):
--   1. request.jwt.claims GUC  — set by Supabase PostgREST for every API call;
--      the most reliable source and survives the SECURITY DEFINER role switch.
--   2. auth.uid() / auth.jwt() helpers — fallback for older Supabase versions.
--   3. Graceful NULL            — SQL Editor / direct psql have no JWT.
CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old         jsonb;
  _new         jsonb;
  _changed     text[];
  _record_id   text;

  _jwt_claims  jsonb;
  _user_id     uuid;
  _user_email  text;
  _user_role   text;

  _req_headers jsonb;
  _client_ip   text;
  _user_agent  text;
  _request_id  text;

  _col         text;
BEGIN

  -- ── 1. Read raw JWT claims GUC ───────────────────────────────────────────
  -- Supabase sets request.jwt.claims to the full decoded JWT payload before
  -- every PostgREST / Edge Function call. This GUC survives SECURITY DEFINER.
  BEGIN
    _jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN
    _jwt_claims := NULL;
  END;

  -- ── 2. Extract user identity ──────────────────────────────────────────────
  BEGIN
    IF _jwt_claims IS NOT NULL THEN
      -- "sub" is the Supabase Auth user UUID
      _user_id    := (_jwt_claims ->> 'sub')::uuid;
      -- "email" is a top-level claim in every Supabase JWT
      _user_email := _jwt_claims ->> 'email';
      -- "role" is always present: 'authenticated' | 'anon' | 'service_role'
      _user_role  := _jwt_claims ->> 'role';
    ELSE
      -- Fallback: auth helper functions (older Supabase / local dev)
      _user_id    := auth.uid();
      _user_email := auth.jwt() ->> 'email';
      _user_role  := auth.role();
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Direct postgres connection, migrations runner, etc. — no JWT available
    _user_id    := NULL;
    _user_email := NULL;
    _user_role  := 'unknown';
  END;

  -- ── 3. Request headers ────────────────────────────────────────────────────
  BEGIN
    _req_headers := current_setting('request.headers', true)::jsonb;
    _client_ip   := _req_headers ->> 'x-forwarded-for';
    _user_agent  := _req_headers ->> 'user-agent';
    _request_id  := _req_headers ->> 'x-request-id';
  EXCEPTION WHEN OTHERS THEN
    _client_ip   := NULL;
    _user_agent  := NULL;
    _request_id  := NULL;
  END;

  -- ── 4. Build data snapshots ───────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    _old       := NULL;
    _new       := to_jsonb(NEW);
    _changed   := NULL;
    _record_id := _new ->> 'id';

  ELSIF TG_OP = 'UPDATE' THEN
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);

    -- Collect only columns whose value actually changed
    _changed := ARRAY[]::text[];
    FOR _col IN SELECT key FROM jsonb_each(_new) LOOP
      IF (_old ->> _col) IS DISTINCT FROM (_new ->> _col) THEN
        _changed := _changed || _col;
      END IF;
    END LOOP;

    -- Skip no-op UPDATEs entirely (e.g. ORM touching a row without changes)
    IF array_length(_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    _record_id := _new ->> 'id';

  ELSIF TG_OP = 'DELETE' THEN
    _old       := to_jsonb(OLD);
    _new       := NULL;
    _changed   := NULL;
    _record_id := _old ->> 'id';
  END IF;

  -- ── 5. Write the log entry ────────────────────────────────────────────────
  INSERT INTO public.audit_logs (
    schema_name, table_name, record_id, action,
    old_data, new_data, changed_fields,
    user_id, user_email, user_role,
    client_ip, user_agent, request_id
  ) VALUES (
    TG_TABLE_SCHEMA, TG_TABLE_NAME, _record_id, TG_OP,
    _old, _new, _changed,
    _user_id, _user_email, _user_role,
    _client_ip, _user_agent, _request_id
  );

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 4 — TRIGGERS
-- BEFORE triggers fire first  → row gets updated_at stamp
-- AFTER  triggers fire second → audit snapshot sees the final committed state
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 15. BEFORE UPDATE — stamp updated_at ──────────────────────────────────────
-- Only on tables that have an updated_at column.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'newsletters',
    'newsletter_sections',
    'section_illumination',
    'section_inspiring',
    'section_podcast',
    'section_translation'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at ON public.%I', tbl
    );
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      tbl
    );
  END LOOP;
END $$;


-- ── 16. AFTER INSERT / UPDATE / DELETE — write audit log ──────────────────────
-- Covers all 11 domain tables.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    -- Lookup / config
    'categories',
    'section_types',
    -- Newsletter structure
    'newsletters',
    'newsletter_sections',
    -- Section content (all six types)
    'section_illumination',
    'section_inspiring',
    'section_news_items',
    'section_article_items',
    'section_podcast',
    'section_translation',
    -- Submissions
    'join_requests'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_audit ON public.%I', tbl
    );
    EXECUTE format(
      'CREATE TRIGGER trg_audit
       AFTER INSERT OR UPDATE OR DELETE
       ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn()',
      tbl
    );
  END LOOP;
END $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 5 — STORAGE BUCKET
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('newsletter-media', 'newsletter-media', true)
ON CONFLICT (id) DO NOTHING;


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 6 — REALTIME
-- audit_logs must be added to the supabase_realtime publication so the
-- Supabase Realtime engine broadcasts every new row to subscribed clients.
--
-- REPLICA IDENTITY FULL ensures the full row payload is included in the
-- replication stream — without it only the PK is streamed and every other
-- column arrives as NULL on the client.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.audit_logs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_publication_tables
    WHERE  pubname    = 'supabase_realtime'
      AND  schemaname = 'public'
      AND  tablename  = 'audit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 7 — PERFORMANCE INDEXES
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Newsletter / section indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_newsletters_category_id
  ON public.newsletters (category_id);

CREATE INDEX IF NOT EXISTS idx_newsletter_sections_newsletter
  ON public.newsletter_sections (newsletter_id);

CREATE INDEX IF NOT EXISTS idx_newsletter_sections_type
  ON public.newsletter_sections (section_type_id);

CREATE INDEX IF NOT EXISTS idx_section_news_items_section
  ON public.section_news_items (newsletter_section_id);

CREATE INDEX IF NOT EXISTS idx_section_article_items_section
  ON public.section_article_items (newsletter_section_id);

-- ── Join requests indexes ─────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS join_requests_email_lower_idx
  ON public.join_requests (lower(email));

CREATE INDEX IF NOT EXISTS join_requests_created_at_idx
  ON public.join_requests (created_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS join_requests_phone_idx
  ON public.join_requests (phone);

CREATE INDEX IF NOT EXISTS join_requests_committee_idx
  ON public.join_requests (lower(committee));

CREATE INDEX IF NOT EXISTS join_requests_attraction_gin
  ON public.join_requests USING GIN (attraction);

CREATE INDEX IF NOT EXISTS join_requests_skills_gin
  ON public.join_requests USING GIN (skills);

CREATE INDEX IF NOT EXISTS join_requests_fts_idx
  ON public.join_requests USING GIN (
    to_tsvector('simple',
      coalesce(name,        '') || ' ' ||
      coalesce(motivation,  '') || ' ' ||
      coalesce(tech_field,  '') || ' ' ||
      coalesce(suggestion,  '')
    )
  );

-- ── Audit log indexes ─────────────────────────────────────────────────────────

-- 1. Most common: recent activity feed
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at DESC NULLS LAST);

-- 2. Filter by table (most-used dashboard filter)
CREATE INDEX IF NOT EXISTS audit_logs_table_name_created_at_idx
  ON public.audit_logs (table_name, created_at DESC NULLS LAST);

-- 3. Filter by action type (INSERT / UPDATE / DELETE)
CREATE INDEX IF NOT EXISTS audit_logs_action_created_at_idx
  ON public.audit_logs (action, created_at DESC NULLS LAST);

-- 4. Filter by user UUID
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx
  ON public.audit_logs (user_id, created_at DESC NULLS LAST);

-- 5. Filter by user email (case-insensitive)
CREATE INDEX IF NOT EXISTS audit_logs_user_email_idx
  ON public.audit_logs (lower(user_email), created_at DESC NULLS LAST);

-- 6. Full timeline of one specific record
CREATE INDEX IF NOT EXISTS audit_logs_record_idx
  ON public.audit_logs (table_name, record_id);

-- 7. Full-text / containment search inside JSONB snapshots
CREATE INDEX IF NOT EXISTS audit_logs_old_data_gin
  ON public.audit_logs USING GIN (old_data jsonb_path_ops);

CREATE INDEX IF NOT EXISTS audit_logs_new_data_gin
  ON public.audit_logs USING GIN (new_data jsonb_path_ops);

-- 8. Filter / search which fields changed
CREATE INDEX IF NOT EXISTS audit_logs_changed_fields_gin
  ON public.audit_logs USING GIN (changed_fields);


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 8 — DASHBOARD VIEWS  (read-only, authenticated only)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 17. v_audit_dashboard — main feed ─────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_audit_dashboard AS
SELECT
  -- Identity
  al.id,
  al.created_at,
  to_char(
    al.created_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD HH24:MI:SS UTC'
  )                                                       AS created_at_display,

  -- What changed
  al.table_name,
  al.record_id,
  al.action,
  CASE al.action
    WHEN 'INSERT' THEN 'Created'
    WHEN 'UPDATE' THEN 'Updated'
    WHEN 'DELETE' THEN 'Deleted'
    ELSE al.action
  END                                                     AS action_label,

  -- Changed field list (UPDATE only)
  al.changed_fields,
  array_length(al.changed_fields, 1)                      AS changed_field_count,

  -- Full row snapshots
  al.old_data,
  al.new_data,

  -- Field-level diff: { "field": { "before": …, "after": … } }
  -- Populated on UPDATE only; NULL for INSERT and DELETE.
  CASE
    WHEN al.action = 'UPDATE' AND al.changed_fields IS NOT NULL THEN (
      SELECT jsonb_object_agg(
        k,
        jsonb_build_object(
          'before', al.old_data -> k,
          'after',  al.new_data -> k
        )
      )
      FROM unnest(al.changed_fields) AS k
    )
    ELSE NULL
  END                                                     AS diff,

  -- Who performed the action
  al.user_id,
  al.user_email,
  al.user_role,
  COALESCE(
    al.user_email,
    'Anonymous (' || COALESCE(al.user_role, 'unknown') || ')'
  )                                                       AS actor,

  -- HTTP request context
  al.client_ip,
  al.user_agent,
  al.request_id

FROM  public.audit_logs al
ORDER BY al.created_at DESC;

GRANT SELECT ON public.v_audit_dashboard TO authenticated;


-- ── 18. v_audit_summary_by_table — events per table per day ───────────────────
CREATE OR REPLACE VIEW public.v_audit_summary_by_table AS
SELECT
  date_trunc('day', created_at) AS day,
  table_name,
  action,
  COUNT(*)                      AS event_count
FROM  public.audit_logs
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;

GRANT SELECT ON public.v_audit_summary_by_table TO authenticated;


-- ── 19. v_audit_summary_by_user — per-actor totals ────────────────────────────
CREATE OR REPLACE VIEW public.v_audit_summary_by_user AS
SELECT
  COALESCE(user_email, 'anonymous')                 AS actor,
  user_role,
  COUNT(*)                                          AS total_events,
  COUNT(*) FILTER (WHERE action = 'INSERT')         AS inserts,
  COUNT(*) FILTER (WHERE action = 'UPDATE')         AS updates,
  COUNT(*) FILTER (WHERE action = 'DELETE')         AS deletes,
  MAX(created_at)                                   AS last_action_at
FROM  public.audit_logs
GROUP BY 1, 2
ORDER BY total_events DESC;

GRANT SELECT ON public.v_audit_summary_by_user TO authenticated;


-- ── 20. v_audit_record_history — full timeline of one record ──────────────────
-- Filter by table_name + record_id from your app to show a record's full history.
-- Example:
--   SELECT * FROM public.v_audit_record_history
--   WHERE  table_name = 'newsletters' AND record_id = '<uuid>';
CREATE OR REPLACE VIEW public.v_audit_record_history AS
SELECT
  created_at,
  table_name,
  record_id,
  action,
  changed_fields,
  diff,
  actor,
  user_role,
  client_ip
FROM  public.v_audit_dashboard;

GRANT SELECT ON public.v_audit_record_history TO authenticated;


-- ── 21. v_audit_recent_deletes — last 500 deletions ───────────────────────────
-- old_data contains the full deleted row snapshot — useful for recovery audits.
CREATE OR REPLACE VIEW public.v_audit_recent_deletes AS
SELECT
  created_at,
  table_name,
  record_id,
  old_data,
  actor,
  client_ip
FROM  public.v_audit_dashboard
WHERE action = 'DELETE'
ORDER BY created_at DESC
LIMIT 500;

GRANT SELECT ON public.v_audit_recent_deletes TO authenticated;


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 9 — ROW-LEVEL SECURITY
-- Applied last so every table and view already exists before policies run.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE tbl text;
BEGIN

  -- Enable RLS on all domain tables and audit_logs
  FOREACH tbl IN ARRAY ARRAY[
    'categories',
    'section_types',
    'newsletters',
    'newsletter_sections',
    'section_illumination',
    'section_inspiring',
    'section_news_items',
    'section_article_items',
    'section_podcast',
    'section_translation',
    'join_requests',
    'audit_logs'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl
    );
  END LOOP;


  -- ── categories ──────────────────────────────────────────────────────────────
  -- Public: SELECT only. Authenticated admins: full access.
  BEGIN
    CREATE POLICY "categories_public_select"
      ON public.categories FOR SELECT USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "categories_auth_all"
      ON public.categories FOR ALL USING (auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;


  -- ── section_types ───────────────────────────────────────────────────────────
  BEGIN
    CREATE POLICY "section_types_public_select"
      ON public.section_types FOR SELECT USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "section_types_auth_all"
      ON public.section_types FOR ALL USING (auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;


  -- ── newsletters ─────────────────────────────────────────────────────────────
  -- Public: published newsletters only. Admins: all statuses.
  BEGIN
    CREATE POLICY "newsletters_public_select_published"
      ON public.newsletters FOR SELECT USING (status = 'published');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "newsletters_auth_all"
      ON public.newsletters FOR ALL USING (auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;


  -- ── all section-content tables ──────────────────────────────────────────────
  -- Public: SELECT. Authenticated admins: full access.
  FOREACH tbl IN ARRAY ARRAY[
    'newsletter_sections',
    'section_illumination',
    'section_inspiring',
    'section_news_items',
    'section_article_items',
    'section_podcast',
    'section_translation'
  ] LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY "public_select" ON public.%I FOR SELECT USING (true)', tbl
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY "auth_all" ON public.%I FOR ALL USING (auth.role() = ''authenticated'')',
        tbl
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;


  -- ── join_requests ───────────────────────────────────────────────────────────
  -- Public: INSERT only (form submission). Admins: full access.
  BEGIN
    CREATE POLICY "join_requests_public_insert"
      ON public.join_requests FOR INSERT TO PUBLIC WITH CHECK (true);
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "join_requests_auth_select"
      ON public.join_requests FOR SELECT USING (auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "join_requests_auth_update"
      ON public.join_requests FOR UPDATE USING (auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "join_requests_auth_delete"
      ON public.join_requests FOR DELETE USING (auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;


  -- ── audit_logs ──────────────────────────────────────────────────────────────
  -- Authenticated admins: SELECT only.
  -- Everyone including admins: INSERT / UPDATE / DELETE denied from the client.
  -- The SECURITY DEFINER trigger function is the only writer — it bypasses RLS.
  BEGIN
    CREATE POLICY "audit_logs_auth_select"
      ON public.audit_logs FOR SELECT
      USING (auth.role() = 'authenticated');
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "audit_logs_deny_insert"
      ON public.audit_logs FOR INSERT
      WITH CHECK (false);
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "audit_logs_deny_update"
      ON public.audit_logs FOR UPDATE
      USING (false);
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "audit_logs_deny_delete"
      ON public.audit_logs FOR DELETE
      USING (false);
  EXCEPTION WHEN duplicate_object THEN NULL; END;

END $$;


-- ── Storage bucket policies ────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE POLICY "storage_auth_upload"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'newsletter-media'
      AND auth.role() = 'authenticated'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "storage_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'newsletter-media');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 10 — RETENTION POLICY (configure externally)
-- Supabase Dashboard → Database → Cron Jobs → New cron job:
--
--   Name     : audit-log-retention
--   Schedule : 0 3 * * *       (03:00 UTC daily)
--   Command  :
--     DELETE FROM public.audit_logs
--     WHERE created_at < now() - INTERVAL '365 days';
--
-- Adjust the interval to match your compliance requirements.
-- ══════════════════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════════════════
-- PART 11 — VERIFICATION
-- Un-comment and run each block individually in the SQL Editor.
-- ══════════════════════════════════════════════════════════════════════════════

/*

-- 1. Confirm every trigger is attached (expect 19 rows total):
--    11 × trg_audit      (one per domain table)
--     8 × trg_updated_at (tables that have an updated_at column)
SELECT
  event_object_table  AS table_name,
  trigger_name,
  event_manipulation  AS fires_on,
  action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name IN ('trg_updated_at', 'trg_audit')
ORDER BY event_object_table, trigger_name, fires_on;


-- 2. Confirm audit_logs is in the Realtime publication:
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname   = 'supabase_realtime'
  AND tablename = 'audit_logs';


-- 3. Confirm REPLICA IDENTITY FULL (relreplident must be 'f'):
SELECT relname, relreplident
FROM pg_class
WHERE relname = 'audit_logs';


-- 4. Confirm RLS policies on audit_logs (expect 4 rows):
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'audit_logs'
ORDER BY cmd;


-- 5. Live INSERT test:
INSERT INTO public.categories (name_ar, name_en)
VALUES ('اختبار', 'Test Audit')
ON CONFLICT DO NOTHING;

SELECT table_name, action,
       new_data ->> 'name_en' AS name,
       user_email, actor, created_at
FROM public.v_audit_dashboard
ORDER BY created_at DESC
LIMIT 5;


-- 6. Live UPDATE test — diff should show only the changed field:
UPDATE public.categories
SET name_en = 'Test Audit v2'
WHERE name_en = 'Test Audit';

SELECT action, diff, changed_fields
FROM public.v_audit_dashboard
WHERE table_name = 'categories'
ORDER BY created_at DESC
LIMIT 3;


-- 7. Live DELETE test — old_data should carry the full deleted row:
DELETE FROM public.categories WHERE name_en = 'Test Audit v2';

SELECT old_data ->> 'name_en' AS deleted_name,
       actor,
       created_at
FROM public.v_audit_recent_deletes
ORDER BY created_at DESC
LIMIT 3;

*/
