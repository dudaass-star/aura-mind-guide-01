-- Campos novos em support_tickets
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS auto_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS recurring_customer boolean NOT NULL DEFAULT false;

-- Campos novos em support_ticket_drafts
ALTER TABLE public.support_ticket_drafts
  ADD COLUMN IF NOT EXISTS auto_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kb_top_score double precision;

-- Índice pra busca por email (usado pelas funções abaixo)
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_email_created
  ON public.support_tickets (customer_email, created_at DESC);

-- Função: conta tickets recentes do mesmo email
CREATE OR REPLACE FUNCTION public.count_recent_tickets(
  _email text,
  _days integer DEFAULT 30
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.support_tickets
  WHERE lower(customer_email) = lower(_email)
    AND created_at >= now() - (_days || ' days')::interval;
$$;

-- Função: histórico resumido (últimos N tickets em 90d) pra injeção no prompt
CREATE OR REPLACE FUNCTION public.get_customer_ticket_history(
  _email text,
  _days integer DEFAULT 90,
  _limit integer DEFAULT 5
)
RETURNS TABLE(
  id uuid,
  subject text,
  category text,
  status text,
  severity text,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.subject, t.category, t.status, t.severity, t.created_at
  FROM public.support_tickets t
  WHERE lower(t.customer_email) = lower(_email)
    AND t.created_at >= now() - (_days || ' days')::interval
  ORDER BY t.created_at DESC
  LIMIT _limit;
$$;