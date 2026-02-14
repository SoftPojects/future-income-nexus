
-- Trigger function: reset energy to 100% and set status to 'hustling' on every donation insert
CREATE OR REPLACE FUNCTION public.reset_energy_on_donation()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.agent_state
  SET energy_level = 100,
      agent_status = 'hustling',
      updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach trigger to donations table
CREATE TRIGGER trg_donation_energy_reset
AFTER INSERT ON public.donations
FOR EACH ROW
EXECUTE FUNCTION public.reset_energy_on_donation();

-- Enable Realtime on agent_state so all clients get instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_state;
