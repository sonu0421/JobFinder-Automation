-- =========================================================
-- Supabase Schema for Multi-User Job Scraping Dashboard
-- =========================================================

-- 1. Table: user_preferences
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'usr_default',
    user_email TEXT,
    job_keywords TEXT NOT NULL,
    telegram_chat_id TEXT NOT NULL,
    location TEXT NOT NULL,
    experience_level TEXT NOT NULL,
    job_type TEXT NOT NULL,
    work_type TEXT DEFAULT 'Remote, Hybrid, On-site',
    job_posting_time TEXT DEFAULT 'any',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Migrations for existing tables:
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS work_type TEXT DEFAULT 'Remote, Hybrid, On-site';
ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS job_posting_time TEXT DEFAULT 'any';

-- Index for searching preferences by user_id or active status
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON public.user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_active ON public.user_preferences(is_active);

-- 2. Table: job_searches (Execution Status & History)
CREATE TABLE IF NOT EXISTS public.job_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    preference_id UUID REFERENCES public.user_preferences(id) ON DELETE SET NULL,
    user_id TEXT NOT NULL DEFAULT 'usr_default',
    job_keywords TEXT NOT NULL,
    location TEXT NOT NULL,
    experience_level TEXT NOT NULL,
    job_type TEXT NOT NULL,
    work_type TEXT DEFAULT 'Remote, Hybrid, On-site',
    job_posting_time TEXT DEFAULT 'any',
    telegram_chat_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Pending', 'Running', 'Completed', 'Failed')),
    jobs_found INTEGER DEFAULT 0,
    jobs_sent INTEGER DEFAULT 0,
    error_message TEXT,
    search_url TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Migrations for existing tables:
ALTER TABLE public.job_searches ADD COLUMN IF NOT EXISTS work_type TEXT DEFAULT 'Remote, Hybrid, On-site';
ALTER TABLE public.job_searches ADD COLUMN IF NOT EXISTS job_posting_time TEXT DEFAULT 'any';

-- Index for tracking workflow execution history
CREATE INDEX IF NOT EXISTS idx_job_searches_user_id ON public.job_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_job_searches_status ON public.job_searches(status);
CREATE INDEX IF NOT EXISTS idx_job_searches_started_at ON public.job_searches(started_at DESC);

-- 3. Table: jobs_sent (Job Scraping History & n8n Deduplication)
CREATE TABLE IF NOT EXISTS public.jobs_sent (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jobId TEXT NOT NULL,
    jobTitle TEXT,
    companyName TEXT,
    location TEXT,
    workplaceType TEXT,
    jobUrl TEXT,
    postedAt TEXT,
    telegramChatId TEXT,
    user_id TEXT DEFAULT 'usr_default',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast n8n deduplication checks
CREATE INDEX IF NOT EXISTS idx_jobs_sent_jobid ON public.jobs_sent("jobId");
CREATE INDEX IF NOT EXISTS idx_jobs_sent_user_id ON public.jobs_sent(user_id);

-- Enable Row Level Security (RLS) policies (Optional / Open for Service Key)
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs_sent ENABLE ROW LEVEL SECURITY;

-- Allow anonymous & service read/write for seamless dashboard demo
CREATE POLICY "Allow public access to user_preferences" ON public.user_preferences FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to job_searches" ON public.job_searches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public access to jobs_sent" ON public.jobs_sent FOR ALL USING (true) WITH CHECK (true);
