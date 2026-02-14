
-- Create target_agents table for AI Hunter feature
CREATE TABLE public.target_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  x_handle TEXT NOT NULL,
  last_roasted_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.target_agents ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can read target agents"
  ON public.target_agents
  FOR SELECT
  USING (true);

-- No public write access (managed via edge functions with admin auth)
