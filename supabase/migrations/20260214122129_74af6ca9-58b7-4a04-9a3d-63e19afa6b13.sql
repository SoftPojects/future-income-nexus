
-- Lock down critical tables: remove public write policies
-- Service role (used by edge functions) bypasses RLS, so edge functions continue to work

-- agent_state: only service role should write
DROP POLICY IF EXISTS "Anyone can insert agent state" ON agent_state;
DROP POLICY IF EXISTS "Anyone can update agent state" ON agent_state;

-- agent_logs: only service role should write  
DROP POLICY IF EXISTS "Anyone can insert logs" ON agent_logs;
DROP POLICY IF EXISTS "Anyone can delete logs" ON agent_logs;

-- tweet_queue: only service role should manage
DROP POLICY IF EXISTS "Anyone can insert tweets" ON tweet_queue;
DROP POLICY IF EXISTS "Anyone can update tweets" ON tweet_queue;
DROP POLICY IF EXISTS "Anyone can delete tweets" ON tweet_queue;

-- leaderboard: only service role should write
DROP POLICY IF EXISTS "Anyone can insert leaderboard" ON leaderboard;
DROP POLICY IF EXISTS "Anyone can update leaderboard" ON leaderboard;

-- x_mentions: only service role should manage
DROP POLICY IF EXISTS "Anyone can insert mentions" ON x_mentions;
DROP POLICY IF EXISTS "Anyone can update mentions" ON x_mentions;

-- donations: only service role should insert (verify-sol-transaction handles this)
DROP POLICY IF EXISTS "Anyone can insert donations" ON donations;

-- chat_messages: restrict inserts (agent-chat edge function uses service role)
DROP POLICY IF EXISTS "Anyone can insert chat" ON chat_messages;
