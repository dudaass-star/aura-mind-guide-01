alter table public.inter_pix_recurrences
  add column if not exists access_granted_at timestamptz;
comment on column public.inter_pix_recurrences.access_granted_at is
  'Reserva idempotente da liberacao de acesso sem dinheiro (trial gratuito de 7 dias autorizado no mandato).';