
-- Agent state table (single row, no auth needed - this is a public dashboard)
CREATE TABLE public.agent_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  total_hustled NUMERIC NOT NULL DEFAULT 14.27,
  energy_level INTEGER NOT NULL DEFAULT 73,
  agent_status TEXT NOT NULL DEFAULT 'hustling',
  current_strategy TEXT NOT NULL DEFAULT 'Multi-Vector Arbitrage',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sassy logs table
CREATE TABLE public.agent_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (single-user dashboard, no auth)
CREATE POLICY "Anyone can read agent state" ON public.agent_state FOR SELECT USING (true);
CREATE POLICY "Anyone can update agent state" ON public.agent_state FOR UPDATE USING (true);
CREATE POLICY "Anyone can insert agent state" ON public.agent_state FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can read logs" ON public.agent_logs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert logs" ON public.agent_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete logs" ON public.agent_logs FOR DELETE USING (true);

-- Seed initial agent state row
INSERT INTO public.agent_state (total_hustled, energy_level, agent_status) VALUES (14.27, 73, 'hustling');

-- Enable realtime for logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_logs;
