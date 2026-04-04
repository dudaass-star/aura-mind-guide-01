

## Plano: Envio segmentado de Welcome e Reconnect

### Situação real verificada

**No Stripe:**
- 9 assinaturas **active** (pagantes confirmados)
- 14 assinaturas **trialing** (trial com cartão válido, dentro dos 7 dias)

**No banco (profiles):**
- 11 com status `active` (inclui Admin/test)
- ~24 com status `trial` (muitos já passaram dos 7 dias sem assinatura no Stripe)

### Quem recebe mensagem

**Grupo 1 — Welcome (4 usuários novos, 0 msgs da Aura):**
- Noély, Lorena, Patrícia, Jenoelma
- Enviar via `admin-send-message` com `template_category: welcome_trial`

**Grupo 2 — Reconnect (usuários com assinatura ativa/trialing no Stripe):**
- Os ~9 pagantes + ~14 trialing que têm subscription válida no Stripe
- Excluir Admin e os 4 do Grupo 1
- Enviar via `instance-reconnect-notify` ou loop com `admin-send-message` usando `template_category: reconnect`

**Quem NÃO recebe nada:**
- Trials antigos sem assinatura no Stripe (trial expirado de fato)
- Canceled, trial_expired
- Admin/test

### Passos de implementação

1. **Cruzar dados Stripe x banco** — Buscar o telefone de cada customer do Stripe (metadata.phone) e verificar qual profile corresponde. Isso gera a lista final de destinatários do reconnect.

2. **Enviar Welcome** para os 4 novos (individualmente via `admin-send-message`)

3. **Enviar Reconnect** para os demais com assinatura válida no Stripe (loop com `admin-send-message` para controle fino, ou adaptar `instance-reconnect-notify` para filtrar apenas quem tem sub ativa)

4. **Verificar logs** para confirmar entregas

### Detalhes técnicos
- Para cruzar Stripe x banco, usaremos `metadata.phone` dos customers do Stripe contra `profiles.phone`
- A abordagem mais segura é fazer o loop manualmente via `admin-send-message` com a lista filtrada, em vez de usar `instance-reconnect-notify` (que pega todos os active/trial sem verificar Stripe)
- Estimativa: ~19-23 mensagens no total (4 welcome + 15-19 reconnect)

