-- Add pending_insight field to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pending_insight text;

-- Insert new template categories (ContentSid will be updated via admin panel after Meta approval)
INSERT INTO public.whatsapp_templates (category, template_name, prefix, twilio_content_sid, is_active, meta_category)
VALUES
  ('weekly_report', 'aura_weekly_report_v2', '📊', 'PENDING_APPROVAL', false, 'UTILITY'),
  ('content', 'aura_content_v2', '📖', 'PENDING_APPROVAL', false, 'UTILITY'),
  ('insight', 'aura_insight_v2', '💡', 'PENDING_APPROVAL', false, 'UTILITY')
ON CONFLICT DO NOTHING;

-- Deactivate obsolete template categories
UPDATE public.whatsapp_templates SET is_active = false WHERE category IN ('dunning', 'checkout_recovery', 'followup', 'session_reminder');