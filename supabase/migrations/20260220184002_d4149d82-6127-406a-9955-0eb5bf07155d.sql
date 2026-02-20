-- Add x_url (our reply's URL) and error_reason columns to vip_reply_logs
ALTER TABLE public.vip_reply_logs 
ADD COLUMN IF NOT EXISTS x_url TEXT,
ADD COLUMN IF NOT EXISTS error_reason TEXT;