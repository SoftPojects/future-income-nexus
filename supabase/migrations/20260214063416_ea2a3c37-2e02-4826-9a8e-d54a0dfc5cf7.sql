
-- Tweet queue table
CREATE TABLE public.tweet_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  type TEXT NOT NULL DEFAULT 'automated',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  posted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.tweet_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read tweets" ON public.tweet_queue FOR SELECT USING (true);
CREATE POLICY "Anyone can insert tweets" ON public.tweet_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update tweets" ON public.tweet_queue FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete tweets" ON public.tweet_queue FOR DELETE USING (true);

-- X mentions table
CREATE TABLE public.x_mentions (
  id TEXT PRIMARY KEY,
  author_handle TEXT NOT NULL,
  content TEXT NOT NULL,
  replied BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.x_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read mentions" ON public.x_mentions FOR SELECT USING (true);
CREATE POLICY "Anyone can insert mentions" ON public.x_mentions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update mentions" ON public.x_mentions FOR UPDATE USING (true);
