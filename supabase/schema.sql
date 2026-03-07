-- ==========================================
-- 1. Categories Table (bilingual)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name_ar VARCHAR(255) NOT NULL UNIQUE,
  name_en VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- seed canonical categories if table empty
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'categories') THEN
    IF NOT EXISTS (SELECT 1 FROM public.categories) THEN
      INSERT INTO public.categories (name_ar, name_en)
      VALUES
        ('علم البيانات', 'Data Science'),
        ('الذكاء الاصطناعي', 'Artificial Intelligence'),
        ('الامن السيبراني', 'Cybersecurity'),
        ('هندسة الحاسب', 'Computer Engineering'),
        ('هندسة البرمجيات', 'Software Engineering'),
        ('المجتمع التقني', 'Tech Community'),
        ('الحوسبة', 'Computing');
    END IF;
  END IF;
END$$;

-- ==========================================
-- 2. Main Newsletters Table (Metadata)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.newsletters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_number INT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT,
  cover_image_url TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 3. Newsletter Locales Table (Ar/En Content)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.newsletter_locales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  newsletter_id UUID REFERENCES public.newsletters(id) ON DELETE CASCADE,
  locale VARCHAR(2) NOT NULL CHECK (locale IN ('ar', 'en')),

  -- Header & Hero Section
  newsletter_title TEXT,
  article_main_title TEXT,
  welcome_text TEXT DEFAULT 'أهلا بك في نشرة الحاسوبي موعدك الأسبوعي مع كل جديد في عالم التقنية',
  read_time_text VARCHAR(255),

  -- Main Article Section
  article_content TEXT,
  article_author TEXT,

  -- News Section
  news_header TEXT DEFAULT 'أسبوعك معانا',
  news_items JSONB DEFAULT '[]'::jsonb,

  -- Podcast Section (Optional)
  podcast_header TEXT DEFAULT 'بودكاست حاسوبي',
  podcast_description TEXT,
  podcast_youtube_url TEXT,

  -- Spotlight / Inspiration Section
  spotlight_header TEXT DEFAULT 'إضاءة',
  spotlight_content TEXT,
  spotlight_author TEXT,

  -- Credits Section
  credits_article_writer TEXT,
  credits_news_hunters TEXT,
  credits_content_writers TEXT,
  credits_designers TEXT,
  credits_member_affairs TEXT,
  credits_leader TEXT,
  credits_co_leader TEXT,

  UNIQUE(newsletter_id, locale)
);

-- Subscribers / join requests table
-- Create a dedicated `join_requests` table (replaces the older `subscribers` name).
-- This table stores join requests submitted from `join.html`.
CREATE TABLE IF NOT EXISTS public.join_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  phone TEXT,
  email TEXT NOT NULL,
  club_member TEXT,
  committee TEXT,
  tech_interest TEXT,
  read_newsletter TEXT,
  attraction TEXT[], -- multi-select checkboxes
  skills TEXT[],     -- multi-select checkboxes
  commitment TEXT,
  motivation TEXT,
  tech_field TEXT,
  suggestion TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  confirmed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- If an older `subscribers` table exists, migrate its data into `join_requests` and drop it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscribers' AND table_schema = 'public') THEN
    -- Copy data (only if join_requests is empty to avoid duplicates)
    IF NOT EXISTS (SELECT 1 FROM public.join_requests) THEN
      INSERT INTO public.join_requests(id, name, phone, email, club_member, committee, tech_interest, read_newsletter, attraction, skills, commitment, motivation, tech_field, suggestion, metadata, confirmed, created_at)
      SELECT id, name, phone, email, club_member, committee, tech_interest, read_newsletter, attraction, skills, commitment, motivation, tech_field, suggestion, metadata, confirmed, created_at
      FROM public.subscribers;
    END IF;
    -- drop legacy table now that data is preserved
    DROP TABLE IF EXISTS public.subscribers;
  END IF;
END$$;

-- Indexes to help the most common queries over join/subscriber data
-- 1) Fast lookup by email (case-insensitive) and prevent duplicate emails
CREATE UNIQUE INDEX IF NOT EXISTS join_requests_email_lower_idx ON public.join_requests (lower(email));

-- 2) Common ordering/filtering by creation time
CREATE INDEX IF NOT EXISTS join_requests_created_at_idx ON public.join_requests (created_at DESC NULLS LAST);

-- 3) Phone number lookup (normalize externally if needed)
CREATE INDEX IF NOT EXISTS join_requests_phone_idx ON public.join_requests (phone);

-- 4) GIN indexes for array columns to support "contains" queries (e.g., skills @> ARRAY['Translation'])
CREATE INDEX IF NOT EXISTS join_requests_attraction_gin ON public.join_requests USING GIN (attraction);
CREATE INDEX IF NOT EXISTS join_requests_skills_gin ON public.join_requests USING GIN (skills);

-- 5) Index to speed filtering by committee
CREATE INDEX IF NOT EXISTS join_requests_committee_idx ON public.join_requests (lower(committee));

-- 5) Full-text search index for quick searching across name, motivation, tech_field, suggestion
CREATE INDEX IF NOT EXISTS join_requests_fts_idx ON public.join_requests USING GIN (
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(motivation,'') || ' ' || coalesce(tech_field,'') || ' ' || coalesce(suggestion,''))
);

-- SECURITY: Enable Row Level Security on join_requests and create safe policies.
-- Allow public INSERTs (so the public website can submit join requests without exposing data).
-- Allow SELECT/UPDATE/DELETE only to authenticated users (admin accounts).
ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

-- Public insert policy (allow web submissions)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'allow_public_insert_join_requests' AND polrelid = 'public.join_requests'::regclass) THEN
    CREATE POLICY allow_public_insert_join_requests ON public.join_requests FOR INSERT WITH CHECK (true);
  END IF;
END$$;

-- Allow authenticated users to SELECT
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'allow_authenticated_select_join_requests' AND polrelid = 'public.join_requests'::regclass) THEN
    CREATE POLICY allow_authenticated_select_join_requests ON public.join_requests FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END$$;

-- Allow authenticated users to UPDATE/DELETE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'allow_authenticated_modify_join_requests' AND polrelid = 'public.join_requests'::regclass) THEN
    CREATE POLICY allow_authenticated_modify_join_requests ON public.join_requests FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
    CREATE POLICY allow_authenticated_delete_join_requests ON public.join_requests FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END$$;

-- Notes:
-- - The array columns (`attraction`, `skills`) are typed as TEXT[] so the front-end can insert arrays.
-- - For more advanced search (typo-tolerant), consider enabling the `pg_trgm` extension and adding a trigram index on lower(email) or name.
-- - RLS (Row Level Security) is recommended: allow public INSERT on `subscribers` for sign-ups, but restrict SELECT/DELETE to admin users. Configure policies in the Supabase dashboard to match your auth model.

-- Ensure categories table is populated from the `newsletter_category` enum (if present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'newsletter_category') THEN
    IF NOT EXISTS (SELECT 1 FROM public.categories) THEN
      INSERT INTO public.categories(name_ar, name_en)
      SELECT val::text, val::text
      FROM unnest(enum_range(NULL::newsletter_category)) AS val;
    END IF;
  END IF;
END$$;

-- Link newsletters to categories by adding `category_id` column and foreign key if missing
DO $$
BEGIN
  -- add column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='newsletters' AND column_name='category_id'
  ) THEN
    ALTER TABLE public.newsletters ADD COLUMN category_id UUID;
  END IF;

  -- populate category_id from existing enum-based `category` column where possible
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='newsletters' AND column_name='category') THEN
    UPDATE public.newsletters n
    SET category_id = c.id
    FROM public.categories c
    WHERE n.category IS NOT NULL AND (c.name_ar = n.category::text OR c.name_en = n.category::text) AND (n.category_id IS NULL OR n.category_id = '00000000-0000-0000-0000-000000000000');
  END IF;

  -- add FK constraint if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'newsletters_category_id_fkey') THEN
    ALTER TABLE public.newsletters ADD CONSTRAINT newsletters_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;
  END IF;

  -- index to speed filtering by category
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='newsletters' AND indexname='newsletters_category_id_idx') THEN
    CREATE INDEX newsletters_category_id_idx ON public.newsletters (category_id);
  END IF;
END$$;