-- Add reply_to_tweet_id column for auto-plug threading
ALTER TABLE public.tweet_queue ADD COLUMN IF NOT EXISTS reply_to_tweet_id text;

-- Add a 'plug' type comment for clarity
COMMENT ON COLUMN public.tweet_queue.reply_to_tweet_id IS 'X tweet ID to reply to (used for auto-plug replies)';