
-- Add media URL columns to tweet_queue for pre-generated assets
ALTER TABLE public.tweet_queue ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.tweet_queue ADD COLUMN IF NOT EXISTS audio_url text;
