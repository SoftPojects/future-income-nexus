-- Add reason column to social_logs for richer activity logging
ALTER TABLE public.social_logs ADD COLUMN IF NOT EXISTS reason text;

-- Create daily_social_quota table to track quota usage
CREATE TABLE IF NOT EXISTS public.daily_social_quota (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL DEFAULT CURRENT_DATE,
  follows_count integer NOT NULL DEFAULT 0,
  likes_count integer NOT NULL DEFAULT 0,
  follows_limit integer NOT NULL DEFAULT 15,
  likes_limit integer NOT NULL DEFAULT 30,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT daily_social_quota_date_unique UNIQUE (date)
);

-- Enable RLS
ALTER TABLE public.daily_social_quota ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Anyone can read daily quota"
  ON public.daily_social_quota
  FOR SELECT
  USING (true);
