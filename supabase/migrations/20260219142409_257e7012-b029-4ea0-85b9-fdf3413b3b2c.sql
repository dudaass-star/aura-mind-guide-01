
-- Tabela de instâncias WhatsApp (multi-número)
CREATE TABLE public.whatsapp_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone_number TEXT,
  zapi_instance_id TEXT NOT NULL,
  zapi_token TEXT NOT NULL,
  zapi_client_token TEXT NOT NULL,
  max_users INTEGER NOT NULL DEFAULT 250,
  current_users INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS: apenas service_role (credenciais sensíveis)
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on whatsapp_instances"
  ON public.whatsapp_instances
  FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

-- Nova coluna em profiles para vincular usuário a uma instância
ALTER TABLE public.profiles
  ADD COLUMN whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id);

-- Função para alocar instância aleatoriamente
CREATE OR REPLACE FUNCTION public.allocate_whatsapp_instance()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  instance_id UUID;
BEGIN
  SELECT id INTO instance_id
  FROM public.whatsapp_instances
  WHERE status = 'active' AND current_users < max_users
  ORDER BY random()
  LIMIT 1;

  IF instance_id IS NOT NULL THEN
    UPDATE public.whatsapp_instances
    SET current_users = current_users + 1
    WHERE id = instance_id;
  END IF;

  RETURN instance_id;
END;
$$;
