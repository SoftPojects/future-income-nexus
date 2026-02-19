
-- Create VIP targets table for Flash Snipe module
CREATE TABLE IF NOT EXISTS public.vip_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  x_handle text NOT NULL UNIQUE,
  display_name text NOT NULL,
  last_checked_at timestamp with time zone,
  last_tweet_id text,
  last_replied_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vip_targets ENABLE ROW LEVEL SECURITY;

-- Read-only for anon (admin panel reads via service role, but frontend reads use anon)
CREATE POLICY "Anyone can read vip targets"
  ON public.vip_targets FOR SELECT USING (true);

-- Create VIP reply logs table
CREATE TABLE IF NOT EXISTS public.vip_reply_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vip_handle text NOT NULL,
  tweet_id text NOT NULL,
  tweet_content text NOT NULL,
  reply_text text NOT NULL,
  reply_sent boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vip_reply_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read vip reply logs"
  ON public.vip_reply_logs FOR SELECT USING (true);

-- Seed with initial VIP targets
INSERT INTO public.vip_targets (x_handle, display_name) VALUES
  ('elonmusk', 'Elon Musk'),
  ('jessepollak', 'Jesse Pollak'),
  ('blknoiz06', 'Ansem'),
  ('virtuals_io', 'Virtuals Protocol')
ON CONFLICT (x_handle) DO NOTHING;
