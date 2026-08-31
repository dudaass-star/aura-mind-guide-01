# Sessão avulsa de R$ 6,90 — carta na manga do trilho PIX

Oferta usada **só na conversa** (nunca em página): quem travou no PIX porque não quer autorizar cobrança automática recebe a chance de pagar **R$ 6,90 num PIX comum, sem mandato**, e fazer **um encontro guiado de 45 minutos**. Prazo pra usar: **48h**. Sem crédito no plano. Ao final da sessão, a própria Aura convida pro plano.

Decisões travadas: só o encontro de 45 min (sem chat casual, sem meditação, sem áudio fora da sessão) · 48h pra agendar · R$ 6,90 não abate nada · elegível só para lead do trilho PIX que já viu o preço.

## As brechas que o plano fecha

Estas são as formas reais de isso "não funcionar direito" — cada uma tem tratamento explícito:

1. **PIX com mandato por engano.** A cobrança é `/api/v1/charge` avulsa na Woovi, com `correlationID` próprio (`taster_<telefone>_<data>`). Nenhuma chamada a `/subscriptions`, nenhuma linha em `woovi_subscriptions` — assim nada no ecossistema confunde isso com assinatura.
2. **Virar cliente ativo aos olhos do sistema.** O acesso não usa `status = 'active'`. Nasce `status = 'taster'` + `plan_tier = 'taster'` + `taster_expires_at`. Nenhum trilho de dunning, renovação, winback ou relatório de assinante pega esse perfil.
3. **Deixar de ser recuperável.** Os guardas de recuperação hoje silenciam quem tem perfil ativo. `status = 'taster'` fica **fora** dessas listas: se ele não assinar, o trilho de venda continua podendo falar com ele.
4. **Ganhar mais do que pagou.** No `aura-agent` o tier `taster` entra na mesma tabela de entitlements do `lite`/`base`: 1 sessão, 0 minuto de áudio, 0 meditação, 0 jornada, e fora da janela da sessão a Aura responde uma linha determinística ("nosso encontro está marcado pra X; fora dele eu volto quando você escolher um plano") sem chamar o LLM.
5. **Pagar duas vezes / dois códigos.** Trava de idempotência por telefone: um código de taster por hora, um taster pago por telefone com cooldown de 180 dias. Clique repetido no botão devolve o mesmo copia-e-cola.
6. **Quem já é ou já foi pagante recebendo a oferta.** Elegibilidade é calculada **no backend**, não pelo LLM: bloqueia perfil ativo/trial/canceling/past_due, histórico de assinatura Stripe/Asaas/Woovi, e quem já usou taster.
7. **Oferta cedo demais / virando isca.** Só a partir da 2ª resposta do agente na mesma conversa, só com preço já mostrado, só uma vez por lead. Recusa registra e o agente nunca repete.
8. **Pagou e nada aconteceu.** O webhook cria o perfil taster e responde na hora; e uma varredura de reconciliação (junto da auditoria Woovi já existente) pega pagamento que não virou acesso, cria o perfil e manda a mensagem de agendamento.
9. **Pagou e não agendou.** Lembrete às 6h e às 24h restantes. Passadas as 48h sem sessão feita, expira e o lead volta pro trilho de venda — sem cobrar nada.
10. **Sessão nunca acontecendo por conflito de agenda.** A criação respeita o trigger `prevent_duplicate_sessions` (janela de 30 min) e, em conflito, o agente pede outro horário em vez de falhar silencioso.
11. **Fechamento perdido.** No encerramento da sessão do taster, o `aura-agent` dispara o convite ao plano com link próprio (UTM `taster_close`), uma vez só, e o perfil expira depois disso.
12. **Não dar pra medir.** Painel admin com ofertas → aceites → pagos → sessão feita → assinatura, e o custo por assinante desse trilho.

## Como o lead vive isso

```text
lead copiou PIX e travou ("não quero deixar cobrança automática")
        ↓  (2ª resposta do agente, backend liberou elegibilidade)
agente oferece: 45 min por R$ 6,90, PIX comum, sem autorização
        ↓  aceita
código PIX avulso de R$ 6,90 na hora, ainda no número da recuperação
        ↓  paga
Aura chama do número OFICIAL dela (mesmo template de welcome que já usamos)
        ↓  ele combina o horário direto com a Aura, no chat dela
encontro de 45 min (sessão completa, sem cortes)
        ↓  fim da sessão
convite ao plano com link próprio · acesso expira
```

O agendamento **não** acontece no agente de recuperação: ele só vende e entrega o código. Depois do pagamento, quem assume é a Aura no número oficial, exatamente como acontece hoje com quem assina — inclusive reusando o **template de welcome já aprovado** (não precisa de template novo na Meta). Só o texto livre que vem junto muda: em vez de "escolheu o plano X", ele diz que o encontro de 45 min está liberado e pede o horário dentro de 48h.


## Detalhes técnicos

**Banco (uma migração)**
- `profiles`: `taster_offered_at`, `taster_paid_at`, `taster_expires_at`, `taster_session_id`, `taster_source`. `status` aceita `'taster'` e `plan_tier` aceita `'taster'`.
- Nova tabela `taster_offers` (telefone, checkout_session_id, oferta, aceite, charge id, pago, sessão, converteu em assinatura) com RLS + GRANT no padrão do projeto (admin lê, service_role tudo).
- `sessions`: coluna `is_taster boolean default false`.

**Backend**
- `criar-pix-taster` (nova): valida elegibilidade, cria charge avulsa de 690 na Woovi, grava `taster_offers`, devolve copia-e-cola. Idempotente por `correlationID`.
- `recovery-agent`: função `checkTasterEligibility()` no backend injeta no prompt "pode oferecer / não pode"; nova tag `[OFERECER_TASTER]` (aceite) e classificação determinística do aceite curto ("quero", "bora", "sim") em `pix-buttons.ts`, gerando o código sem passar pelo LLM. Tag inválida cai no strip já existente.
- `webhook-woovi`: reconhece `correlationID` de taster **antes** do fluxo de assinatura, cria/atualiza perfil `status='taster'`, `taster_expires_at = now + 48h`, e manda a mensagem de agendamento pelo WhatsApp oficial.
- `woovi-pix-audit`: varredura extra para taster pago sem perfil, e expiração dos que passaram de 48h.
- `aura-agent`: tier `taster` com 1 sessão / 0 áudio / 0 meditação / 0 jornada; parede determinística fora da sessão; convite ao plano no fechamento.
- Guardas de recuperação (`recover-abandoned-checkout`, `recover-abandoned-checkout-whatsapp`, `recovery-agent`, `woovi-recovery-guard`): `'taster'` explicitamente **não** entra nas listas de cliente ativo.

**Admin**
- Bloco no painel de recuperação com o funil do taster e taxa de conversão para pagante.

**Validação antes de ligar**
- `dryRun` no `criar-pix-taster` (calcula elegibilidade e valor sem criar charge).
- Teste ponta a ponta com o seu número: oferta → código → pagamento real de R$ 6,90 → perfil taster → agendamento → sessão → convite → expiração.
- Kill switch em `system_config.taster_enabled`, nascendo **desligado**; só liga depois do teste ponta a ponta passar.
