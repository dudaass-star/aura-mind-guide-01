alter table public.woovi_subscriptions
  add column if not exists entry_charge_correlation_id text,
  add column if not exists creation_mode text not null default 'native';

create index if not exists woovi_subscriptions_entry_charge_idx
  on public.woovi_subscriptions (entry_charge_correlation_id)
  where entry_charge_correlation_id is not null;

-- O webhook (service_role) lê e atualiza essa tabela; a UI admin lê.
grant all on public.woovi_subscriptions to service_role;
grant select, insert, update, delete on public.woovi_subscriptions to authenticated;