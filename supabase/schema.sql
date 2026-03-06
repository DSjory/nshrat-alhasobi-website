-- 1. Create the custom ENUM for your specific categories
CREATE TYPE newsletter_category AS ENUM (
  'علم البيانات',
  'الذكاء الاصطناعي',
  'الامن السيبراني',
  'هندسة الحاسب',
  'هندسة البرمجيات',
  'المجتمع التقني',
  'الحوسبة'
);

-- 2. Create the Main Newsletters Table (Metadata)
CREATE TABLE newsletters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  issue_number INT NOT NULL, -- [cite: 2, 28, 59]
  category newsletter_category NOT NULL,
  cover_image_url TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create the Locales Table (Ar/En Content)
CREATE TABLE newsletter_locales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  newsletter_id UUID REFERENCES newsletters(id) ON DELETE CASCADE,
  locale VARCHAR(2) NOT NULL CHECK (locale IN ('ar', 'en')),
  
  -- Hero Section
  welcome_text TEXT DEFAULT 'أهلا بك في نشرة الحاسوبي موعدك الأسبوعي مع كل جديد في عالم التقنية', -- [cite: 27, 67]
  read_time_minutes INT, -- Storing just the number to format "0-0 دقائق" in the frontend [cite: 3, 29]
  
  -- Article Section
  article_title TEXT,
  article_content TEXT, -- [cite: 31]
  article_author TEXT, -- [cite: 5, 33]
  
  -- News Section
  -- Using JSONB because the number of news items varies. 
  -- Format expected: [{"news_text": "...", "sources": ["link1", "link2"]}]
  news_items JSONB DEFAULT '[]'::jsonb, -- [cite: 36, 42, 44]
  
  -- Podcast Section (Optional)
  podcast_description TEXT, -- [cite: 47]
  podcast_youtube_url TEXT, -- Used to extract the ID for the thumbnail algorithm [cite: 13, 16]
  
  -- Spotlight / Inspiration Section
  spotlight_title TEXT DEFAULT 'إضاءة', -- [cite: 19]
  spotlight_content TEXT, -- [cite: 53]
  spotlight_author TEXT, -- [cite: 55]
  
  -- Credits Section (Names separated by " - " in the frontend)
  credits_writer TEXT, -- [cite: 23, 57]
  credits_news_hunters TEXT, -- [cite: 23, 57]
  credits_content_writers TEXT, -- [cite: 23, 57]
  credits_designers TEXT, -- [cite: 23, 57]
  credits_member_affairs TEXT, -- [cite: 23, 57]
  credits_leader TEXT, -- [cite: 23, 58]
  credits_co_leader TEXT, -- [cite: 23, 58]

  -- Ensure we only have one 'ar' and one 'en' row per newsletter
  UNIQUE(newsletter_id, locale)
);

-- 4. Set up Row Level Security (RLS) basics (Optional but recommended)
ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_locales ENABLE ROW LEVEL SECURITY;

-- Allow public read access to published newsletters
CREATE POLICY "Public can view published newsletters" ON newsletters
  FOR SELECT USING (is_published = TRUE);

CREATE POLICY "Public can view published locales" ON newsletter_locales
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM newsletters 
      WHERE newsletters.id = newsletter_locales.newsletter_id 
      AND newsletters.is_published = TRUE
    )
  );