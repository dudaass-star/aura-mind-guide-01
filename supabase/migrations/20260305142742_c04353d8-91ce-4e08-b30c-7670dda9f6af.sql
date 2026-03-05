
-- Allow admins to read whatsapp_instances
CREATE POLICY "Admins can read whatsapp_instances"
  ON public.whatsapp_instances
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to read instance_health_logs
CREATE POLICY "Admins can read instance_health_logs"
  ON public.instance_health_logs
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
