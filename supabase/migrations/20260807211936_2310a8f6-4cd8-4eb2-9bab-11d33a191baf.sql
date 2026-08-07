INSERT INTO public.system_config (key, value)
VALUES ('dunning_notice_content_sid', '"HX68e8ebce4c2ca1750a12ee20e4d2892a"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();