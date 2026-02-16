
-- Add source column to target_agents for discovery vs manual tracking
ALTER TABLE public.target_agents ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
-- Add priority column (lower = higher priority, manual=0, discovery=10)
ALTER TABLE public.target_agents ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

-- Create social_logs table
CREATE TABLE public.social_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_handle text NOT NULL,
  action_type text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.social_logs ENABLE ROW LEVEL SECURITY;

-- Public read policy (admin reads via service role anyway)
CREATE POLICY "Anyone can read social logs"
ON public.social_logs
FOR SELECT
USING (true);
