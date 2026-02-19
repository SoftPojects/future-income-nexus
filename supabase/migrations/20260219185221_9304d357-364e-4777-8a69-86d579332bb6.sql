-- Change energy_level from integer to numeric to support 0.2 per-tick decrements
ALTER TABLE public.agent_state 
  ALTER COLUMN energy_level TYPE numeric(5,1) USING energy_level::numeric(5,1);

-- Update the default to match
ALTER TABLE public.agent_state 
  ALTER COLUMN energy_level SET DEFAULT 100.0;