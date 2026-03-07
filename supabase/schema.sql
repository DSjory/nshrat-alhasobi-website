DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'newsletter_category') THEN
    CREATE TYPE newsletter_category AS ENUM (
      'علم البيانات', 'الذكاء الاصطناعي', 'الامن السيبراني', 'هندسة الحاسب',
      'هندسة البرمجيات', 'المجتمع التقني', 'الحوسبة'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS newsletters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_number INT NOT NULL,
  category newsletter_category NOT NULL,
  cover_image_url TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS newsletter_locales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  newsletter_id UUID REFERENCES newsletters(id) ON DELETE CASCADE,
  locale VARCHAR(2) NOT NULL CHECK (locale IN ('ar', 'en')),
  welcome_text TEXT DEFAULT 'أهلا بك في نشرة الحاسوبي موعدك الأسبوعي مع كل جديد في عالم التقنية',
  read_time_minutes INT,
  article_title TEXT,
  article_content TEXT,
  article_author TEXT,
  news_items JSONB DEFAULT '[]'::jsonb,
  podcast_description TEXT,
  podcast_youtube_url TEXT,
  spotlight_title TEXT DEFAULT 'إضاءة',
  spotlight_content TEXT,
  spotlight_author TEXT,
  credits_writer TEXT,
  credits_news_hunters TEXT,
  credits_content_writers TEXT,
  credits_designers TEXT,
  credits_member_affairs TEXT,
  credits_leader TEXT,
  credits_co_leader TEXT,
  UNIQUE(newsletter_id, locale)
);

-- Categories table (managed list of newsletter categories)
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  slug TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_label_lower_idx ON public.categories (lower(label));

-- Subscribers / join requests table
-- Stores the form data from `join.html` and supports fast search/filtering
CREATE TABLE IF NOT EXISTS public.subscribers (
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

-- Indexes to help the most common queries over join/subscriber data
-- 1) Fast lookup by email (case-insensitive) and prevent duplicate emails
CREATE UNIQUE INDEX IF NOT EXISTS subscribers_email_lower_idx ON public.subscribers (lower(email));

-- 2) Common ordering/filtering by creation time
CREATE INDEX IF NOT EXISTS subscribers_created_at_idx ON public.subscribers (created_at DESC NULLS LAST);

-- 3) Phone number lookup (normalize externally if needed)
CREATE INDEX IF NOT EXISTS subscribers_phone_idx ON public.subscribers (phone);

-- 4) GIN indexes for array columns to support "contains" queries (e.g., skills @> ARRAY['Translation'])
CREATE INDEX IF NOT EXISTS subscribers_attraction_gin ON public.subscribers USING GIN (attraction);
CREATE INDEX IF NOT EXISTS subscribers_skills_gin ON public.subscribers USING GIN (skills);

-- 5) Full-text search index for quick searching across name, motivation, tech_field, suggestion
CREATE INDEX IF NOT EXISTS subscribers_fts_idx ON public.subscribers USING GIN (
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(motivation,'') || ' ' || coalesce(tech_field,'') || ' ' || coalesce(suggestion,''))
);

-- Notes:
-- - The array columns (`attraction`, `skills`) are typed as TEXT[] so the front-end can insert arrays.
-- - For more advanced search (typo-tolerant), consider enabling the `pg_trgm` extension and adding a trigram index on lower(email) or name.
-- - RLS (Row Level Security) is recommended: allow public INSERT on `subscribers` for sign-ups, but restrict SELECT/DELETE to admin users. Configure policies in the Supabase dashboard to match your auth model.

-- Ensure categories table is populated from the `newsletter_category` enum (if present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'newsletter_category') THEN
    IF NOT EXISTS (SELECT 1 FROM public.categories) THEN
      INSERT INTO public.categories(label, slug)
      SELECT val::text, lower(regexp_replace(val::text, '\\s+', '-', 'g'))
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
    WHERE n.category IS NOT NULL AND c.label = n.category::text AND (n.category_id IS NULL OR n.category_id = '00000000-0000-0000-0000-000000000000');
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