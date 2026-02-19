
-- Add missing VIP targets
INSERT INTO public.vip_targets (x_handle, display_name) VALUES
  ('VitalikButerin', 'Vitalik Buterin'),
  ('brian_armstrong', 'Brian Armstrong')
ON CONFLICT (x_handle) DO NOTHING;

-- Add rotation order & tweet_url / like_count columns
ALTER TABLE public.vip_targets ADD COLUMN IF NOT EXISTS rotation_order integer DEFAULT 99;

UPDATE public.vip_targets SET rotation_order = CASE
  WHEN x_handle = 'elonmusk' THEN 1
  WHEN x_handle = 'jessepollak' THEN 2
  WHEN x_handle = 'blknoiz06' THEN 3
  WHEN x_handle = 'virtuals_io' THEN 4
  WHEN x_handle = 'VitalikButerin' THEN 5
  WHEN x_handle = 'brian_armstrong' THEN 6
  ELSE 99
END;

-- Enrich vip_reply_logs with tweet URL + like count for success monitoring
ALTER TABLE public.vip_reply_logs
  ADD COLUMN IF NOT EXISTS tweet_url text,
  ADD COLUMN IF NOT EXISTS like_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS likes_checked_at timestamp with time zone;

-- System settings table for feature flags (sniper_mode etc.)
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT 'true',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read system settings"
  ON public.system_settings FOR SELECT USING (true);

-- Default sniper mode ON
INSERT INTO public.system_settings (key, value) VALUES ('sniper_mode', 'true')
ON CONFLICT (key) DO NOTHING;
