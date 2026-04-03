
-- Step 1: Deactivate all old templates
UPDATE public.whatsapp_templates 
SET is_active = false 
WHERE is_active = true;

-- Step 2: Delete old dunning and checkout_recovery (migrated to email)
DELETE FROM public.whatsapp_templates 
WHERE category IN ('dunning', 'checkout_recovery');

-- Step 3: Delete remaining old templates (will be replaced)
DELETE FROM public.whatsapp_templates 
WHERE is_active = false;

-- Step 4: Insert new templates for the new number
-- All use meta_category = 'marketing' because dynamic variables force marketing classification
INSERT INTO public.whatsapp_templates (category, template_name, prefix, meta_category, twilio_content_sid, is_active) VALUES
  ('checkin',          'aura_checkin_v2',          'Seu check-in 🌿\n\n',               'marketing', 'PENDING_APPROVAL', false),
  ('content',          'aura_content_v2',          'Conteúdo da jornada 🌱\n\n',         'marketing', 'PENDING_APPROVAL', false),
  ('weekly_report',    'aura_weekly_report_v2',    'Seu resumo semanal 📊\n\n',          'marketing', 'PENDING_APPROVAL', false),
  ('insight',          'aura_insight_v2',          'Insight da Aura ✨\n\n',              'marketing', 'PENDING_APPROVAL', false),
  ('session_reminder', 'aura_session_reminder_v2', 'Lembrete de sessão 🕐\n\n',          'marketing', 'PENDING_APPROVAL', false),
  ('reactivation',     'aura_reactivation_v2',     'Oi, sentimos sua falta 💜\n\n',      'marketing', 'PENDING_APPROVAL', false),
  ('welcome',          'aura_welcome_v2',          'Bem-vinda à AURA 💜\n\n',            'marketing', 'PENDING_APPROVAL', false),
  ('welcome_trial',    'aura_welcome_trial_v2',    'Sua jornada começa agora ✨\n\n',    'marketing', 'PENDING_APPROVAL', false),
  ('reconnect',        'aura_reconnect_v2',        'Estou de volta! 💜\n\n',             'marketing', 'PENDING_APPROVAL', false),
  ('followup',         'aura_followup_v2',         'Continuando nossa conversa 💬\n\n',  'marketing', 'PENDING_APPROVAL', false),
  ('access_blocked',   'aura_access_blocked_v2',   'Sentimos sua falta 💜\n\n',          'marketing', 'PENDING_APPROVAL', false);
