
-- Allow the admin (service role) and anon to upsert system_settings rows
-- The existing SELECT policy already exists, we just need INSERT + UPDATE

CREATE POLICY "Anyone can insert system settings"
  ON public.system_settings
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update system settings"
  ON public.system_settings
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Enable realtime for system_settings so the token widget updates instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;
