CREATE TABLE public.admin_billing_provider_snapshots (
  id text PRIMARY KEY,
  provider text NOT NULL,
  installments jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_billing_provider_snapshots TO authenticated;
GRANT ALL ON public.admin_billing_provider_snapshots TO service_role;
ALTER TABLE public.admin_billing_provider_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Administradores consultam parcelas oficiais" ON public.admin_billing_provider_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
COMMENT ON TABLE public.admin_billing_provider_snapshots IS 'Parcelas oficiais recuperadas em lotes para conciliação administrativa, sem interferir nas cobranças.';