
-- Create media_assets table for async media job tracking
CREATE TABLE public.media_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tweet_id UUID REFERENCES public.tweet_queue(id) ON DELETE SET NULL,
  image_url TEXT,
  audio_url TEXT,
  video_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- Read-only for anon
CREATE POLICY "Anyone can read media assets"
  ON public.media_assets FOR SELECT USING (true);

-- Index for fast lookup by tweet
CREATE INDEX idx_media_assets_tweet_id ON public.media_assets(tweet_id);
CREATE INDEX idx_media_assets_status ON public.media_assets(status);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.media_assets;
