
CREATE OR REPLACE FUNCTION public.reset_energy_on_donation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.agent_state
  SET energy_level = 100,
      agent_status = 'hustling',
      updated_at = now()
  WHERE id IS NOT NULL;
  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS trg_donation_energy_reset ON public.donations;
CREATE TRIGGER trg_donation_energy_reset
  AFTER INSERT ON public.donations
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_energy_on_donation();
