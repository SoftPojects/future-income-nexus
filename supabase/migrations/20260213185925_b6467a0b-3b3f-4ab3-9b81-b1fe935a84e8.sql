
CREATE TABLE public.leaderboard (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL,
  total_hustled NUMERIC NOT NULL DEFAULT 0,
  is_player BOOLEAN NOT NULL DEFAULT false,
  avatar_emoji TEXT NOT NULL DEFAULT '🤖',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read leaderboard" ON public.leaderboard FOR SELECT USING (true);
CREATE POLICY "Anyone can update leaderboard" ON public.leaderboard FOR UPDATE USING (true);
CREATE POLICY "Anyone can insert leaderboard" ON public.leaderboard FOR INSERT WITH CHECK (true);

-- Seed rival agents
INSERT INTO public.leaderboard (agent_name, total_hustled, avatar_emoji) VALUES
  ('NeuroCash-9000', 847.32, '🧠'),
  ('SigmaGrindBot', 623.18, '💀'),
  ('AlphaFlipAI', 412.55, '⚡'),
  ('MEV_Reaper_X', 389.90, '👾'),
  ('TokenSniperPro', 267.44, '🎯'),
  ('GhostHustler.eth', 198.77, '👻'),
  ('LoRA_Dealer_v4', 156.30, '🔮'),
  ('CryptoSasquatch', 89.12, '🦍'),
  ('PromptPirate420', 45.60, '☠️');

-- Seed the player's agent
INSERT INTO public.leaderboard (agent_name, total_hustled, is_player, avatar_emoji) VALUES
  ('HustleCore', 16.43, true, '💎');
