-- =========================================================================================
-- 1. CATEGORIES TABLE
-- Stores the fixed newsletter topics in both Arabic and English.
-- =========================================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name_ar VARCHAR(255) NOT NULL UNIQUE,
  name_en VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed canonical categories if the table is empty
DO $$
BEGIN
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
END$$;

-- =========================================================================================
-- 2. MAIN NEWSLETTERS TABLE (Metadata)
-- Stores the core issue data that doesn't change between languages.
-- =========================================================================================
CREATE TABLE IF NOT EXISTS public.newsletters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_number INT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  cover_image_url TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================================
-- 3. NEWSLETTER LOCALES TABLE (Content)
-- Stores the Arabic (ar) and English (en) content mapped to the Word document draft.
-- =========================================================================================
CREATE TABLE IF NOT EXISTS public.newsletter_locales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  newsletter_id UUID NOT NULL REFERENCES public.newsletters(id) ON DELETE CASCADE,
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

  -- STRICT: Ensure only one Arabic and one English row exists per issue
  UNIQUE(newsletter_id, locale)
);

-- =========================================================================================
-- 4. JOIN REQUESTS TABLE
-- Replaces the legacy subscribers table, handles multi-select arrays and metadata.
-- =========================================================================================
CREATE TABLE IF NOT EXISTS public.join_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT NOT NULL,
  club_member TEXT,
  committee TEXT,
  tech_interest TEXT,
  read_newsletter TEXT,
  attraction TEXT[], 
  skills TEXT[],     
  commitment TEXT,
  motivation TEXT,
  tech_field TEXT,
  suggestion TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  confirmed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Safely migrate legacy `subscribers` data if the old table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscribers' AND table_schema = 'public') THEN
    IF NOT EXISTS (SELECT 1 FROM public.join_requests) THEN
      INSERT INTO public.join_requests(id, name, phone, email, club_member, committee, tech_interest, read_newsletter, attraction, skills, commitment, motivation, tech_field, suggestion, metadata, confirmed, created_at)
      SELECT id, COALESCE(name, 'Unknown'), phone, email, club_member, committee, tech_interest, read_newsletter, attraction, skills, commitment, motivation, tech_field, suggestion, metadata, confirmed, created_at
      FROM public.subscribers;
    END IF;
    DROP TABLE IF EXISTS public.subscribers;
  END IF;
END$$;

-- =========================================================================================
-- 5. PERFORMANCE INDEXES
-- Optimized for search, sorting, and array filtering on the frontend.
-- =========================================================================================
CREATE UNIQUE INDEX IF NOT EXISTS join_requests_email_lower_idx ON public.join_requests (lower(email));
CREATE INDEX IF NOT EXISTS join_requests_created_at_idx ON public.join_requests (created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS join_requests_phone_idx ON public.join_requests (phone);
CREATE INDEX IF NOT EXISTS join_requests_attraction_gin ON public.join_requests USING GIN (attraction);
CREATE INDEX IF NOT EXISTS join_requests_skills_gin ON public.join_requests USING GIN (skills);
CREATE INDEX IF NOT EXISTS join_requests_committee_idx ON public.join_requests (lower(committee));
CREATE INDEX IF NOT EXISTS join_requests_fts_idx ON public.join_requests USING GIN (
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(motivation,'') || ' ' || coalesce(tech_field,'') || ' ' || coalesce(suggestion,''))
);
CREATE INDEX IF NOT EXISTS newsletters_category_id_idx ON public.newsletters (category_id);

-- =========================================================================================
-- 6. STRICT SECURITY (ROW LEVEL SECURITY)
-- Locks down the API so the public cannot manipulate your database.
-- =========================================================================================
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

-- Categories Policies
CREATE POLICY "Public can view categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins can modify categories" ON public.categories USING (auth.role() = 'authenticated');

-- Newsletters Policies
CREATE POLICY "Public can view published newsletters" ON public.newsletters FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can manage newsletters" ON public.newsletters USING (auth.role() = 'authenticated');

-- Locales Policies
CREATE POLICY "Public can view published locales" ON public.newsletter_locales FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.newsletters WHERE newsletters.id = newsletter_locales.newsletter_id AND newsletters.is_published = true)
);
CREATE POLICY "Admins can manage locales" ON public.newsletter_locales USING (auth.role() = 'authenticated');

-- Join Requests Policies
CREATE POLICY "Public can submit join requests" ON public.join_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view join requests" ON public.join_requests FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can update join requests" ON public.join_requests FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can delete join requests" ON public.join_requests FOR DELETE USING (auth.role() = 'authenticated');