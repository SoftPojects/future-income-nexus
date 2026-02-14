
-- Global messages table for the global chat
CREATE TABLE public.global_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address text,
  display_name text NOT NULL DEFAULT 'Guest',
  is_holder boolean NOT NULL DEFAULT false,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.global_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read global messages"
ON public.global_messages FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert global messages"
ON public.global_messages FOR INSERT
WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.global_messages;
