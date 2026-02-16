-- Add auto_follow toggle to target_agents
ALTER TABLE public.target_agents ADD COLUMN IF NOT EXISTS auto_follow boolean NOT NULL DEFAULT false;
ALTER TABLE public.target_agents ADD COLUMN IF NOT EXISTS followed_at timestamp with time zone;

-- Add model_used column to tweet_queue for Claude daily cap tracking
ALTER TABLE public.tweet_queue ADD COLUMN IF NOT EXISTS model_used text;

COMMENT ON COLUMN public.target_agents.auto_follow IS 'Whether this target should be auto-followed';
COMMENT ON COLUMN public.target_agents.followed_at IS 'When the agent followed this target on X';
COMMENT ON COLUMN public.tweet_queue.model_used IS 'AI model used to generate this tweet (for cost tracking)';