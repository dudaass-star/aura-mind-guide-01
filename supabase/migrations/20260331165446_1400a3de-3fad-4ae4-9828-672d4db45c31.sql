CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL UNIQUE,
  twilio_content_sid text NOT NULL DEFAULT 'PENDING_APPROVAL',
  template_name text NOT NULL,
  prefix text NOT NULL,
  meta_category text NOT NULL DEFAULT 'utility',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on whatsapp_templates" ON public.whatsapp_templates
  FOR ALL USING (auth.role() = 'service_role'::text);

CREATE POLICY "Admins can read whatsapp_templates" ON public.whatsapp_templates
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.whatsapp_templates (category, template_name, prefix, meta_category) VALUES
  ('checkin','aura_checkin','Seu check-in 🌿\n\n','utility'),
  ('content','aura_content','Conteúdo da jornada 🌱\n\n','utility'),
  ('weekly_report','aura_weekly_report','Seu resumo semanal 📊\n\n','utility'),
  ('insight','aura_insight','Insight da Aura ✨\n\n','utility'),
  ('session_reminder','aura_session_reminder','Lembrete de sessão 🕐\n\n','utility'),
  ('reactivation','aura_reactivation','Oi, sentimos sua falta 💜\n\n','marketing'),
  ('checkout_recovery','aura_checkout_recovery','Seu acesso está esperando ✨\n\n','marketing');