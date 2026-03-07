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