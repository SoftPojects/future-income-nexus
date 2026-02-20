
-- Create trend_comment_logs table for tracking viral post comments
CREATE TABLE public.trend_comment_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tweet_id text NOT NULL,
  tweet_author text NOT NULL,
  original_content text NOT NULL,
  our_comment text NOT NULL,
  posted_at timestamptz DEFAULT now(),
  x_url text,
  success boolean DEFAULT false
);

ALTER TABLE public.trend_comment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read trend comment logs"
  ON public.trend_comment_logs
  FOR SELECT
  USING (true);

-- Add thread_group_id to tweet_queue for thread sequencing
ALTER TABLE public.tweet_queue ADD COLUMN IF NOT EXISTS thread_group_id text;
ALTER TABLE public.tweet_queue ADD COLUMN IF NOT EXISTS thread_position integer;
