# Sessão avulsa de R$ 6,90 — carta na manga do trilho PIX

Oferta usada **só na conversa** (nunca em página): quem travou no PIX porque não quer autorizar cobrança automática recebe a chance de pagar **R$ 6,90 num PIX comum, sem mandato**, e fazer **um encontro guiado de 45 minutos**. Prazo pra usar: **48h**. Sem crédito no plano. Ao final da sessão, a própria Aura convida pro plano.

Decisões travadas: só o encontro de 45 min (sem chat casual, sem meditação, sem áudio fora da sessão) · 48h pra agendar · R$ 6,90 não abate nada · elegível **só para quem entrou no trilho do PIX copia e cola** que já existe.

## Duas portas, mesmo trilho do copia e cola

**Porta A — quem responde (sai primeiro).** O lead respondeu à m1 (15 min) ou m2 (2h), o agente já explicou o que precisava, e a oferta entra a partir da 2ª resposta como saída pra quem travou na autorização recorrente. Não depende de aprovação da Meta: é texto livre dentro da janela de 24h aberta pelo clique.

**Porta B — quem não responde (3º degrau do trilho).** Você tem razão: silêncio não é recusa — muita gente só não quis gastar tempo respondendo, mas abriria uma oferta diferente. Entra um **degrau novo no trilho copia e cola**: quem copiou o código, recebeu m1 e m2 e **não respondeu nada**, recebe ~24h depois de m2 uma mensagem ofertando o encontro de 45 min por R$ 6,90 sem cobrança automática.

Restrições que essa porta impõe (é fora da janela de 24h):
- Exige **template próprio criado, configurado e aprovado pela Meta**, com quick reply ("Quero experimentar" / "Tenho uma dúvida"). Pela sua regra, o degrau nasce **desligado** e só liga com o ContentSid aprovado em `system_config.wa_copiou_templates.m3` — nunca antes.
- Corpo nunca começa com variável (foi o motivo da recusa anterior: "Olá {{1}}, ...").
- Uma vez por telefone, respeitando o cap de 30 dias por telefone, o cap de 3 falhas e o silêncio 22h–08h BRT.
- Clique em "Quero experimentar" resolve **determinístico** (gera o PIX de R$ 6,90 na hora, sem LLM); "Tenho uma dúvida" cai no agente com o contexto de que ele travou na autorização.
- Só entra quem continua sem pagar e sem mandato no momento do envio (mesmas guardas ao vivo Woovi já usadas).



## As brechas que o plano fecha

Estas são as formas reais de isso "não funcionar direito" — cada uma tem tratamento explícito:

1. **PIX com mandato por engano.** A cobrança é `/api/v1/charge` avulsa na Woovi, com `correlationID` próprio (`taster_<telefone>_<data>`). Nenhuma chamada a `/subscriptions`, nenhuma linha em `woovi_subscriptions` — assim nada no ecossistema confunde isso com assinatura.
2. **Virar cliente ativo aos olhos do sistema.** O acesso não usa `status = 'active'`. Nasce `status = 'taster'` + `plan_tier = 'taster'` + `taster_expires_at`. Nenhum trilho de dunning, renovação, winback ou relatório de assinante pega esse perfil.
3. **Deixar de ser recuperável.** Os guardas de recuperação hoje silenciam quem tem perfil ativo. `status = 'taster'` fica **fora** dessas listas: se ele não assinar, o trilho de venda continua podendo falar com ele.
4. **Ganhar mais do que pagou.** Não se cria plano novo. Usa-se o mecanismo de tiers que já existe (`profiles.plan_tier`, hoje com `lite` e `base`): entra um terceiro valor, `taster`, com 1 sessão, 0 min de áudio, 0 meditação, 0 jornada, 0 mensagem de chat casual. A trava é determinística no `aura-agent`, antes do LLM: dentro da janela da sessão ele conduz o encontro normalmente; fora dela responde uma linha fixa ("nosso encontro está marcado pra X — fora dele eu volto quando você escolher um plano") sem gastar modelo. `profiles.plan` continua guardando o plano que ele estava comprando, pra o convite do fim da sessão ser do plano certo.
5. **Pagar duas vezes / dois códigos.** Trava de idempotência por telefone: um código de taster por hora, um taster pago por telefone com cooldown de 180 dias. Clique repetido no botão devolve o mesmo copia-e-cola.
6. **Quem já é ou já foi pagante recebendo a oferta.** Elegibilidade é calculada **no backend**, não pelo LLM: bloqueia perfil ativo/trial/canceling/past_due, histórico de assinatura Stripe/Asaas/Woovi, e quem já usou taster.
7. **Oferta cedo demais / virando isca.** Porta A: só a partir da 2ª resposta do agente, com preço já mostrado. Porta B: só depois de m1 e m2 enviadas e nenhuma resposta. Uma oferta por lead nas duas portas somadas — quem recebeu por uma nunca recebe pela outra, e recusa encerra o assunto.
8. **Pagou e nada aconteceu.** O webhook cria o perfil taster e responde na hora; e uma varredura de reconciliação (junto da auditoria Woovi já existente) pega pagamento que não virou acesso, cria o perfil e manda a mensagem de agendamento.
9. **Pagou e não agendou.** Lembrete às 6h e às 24h restantes. Passadas as 48h sem sessão feita, expira e o lead volta pro trilho de venda — sem cobrar nada.
10. **Sessão nunca acontecendo por conflito de agenda.** A criação respeita o trigger `prevent_duplicate_sessions` (janela de 30 min) e, em conflito, o agente pede outro horário em vez de falhar silencioso.
11. **Fechamento perdido.** No encerramento da sessão do taster, o `aura-agent` dispara o convite ao plano com link próprio (UTM `taster_close`), uma vez só, e o perfil expira depois disso.
12. **Não dar pra medir.** Painel admin com ofertas → aceites → pagos → sessão feita → assinatura, e o custo por assinante desse trilho.

## Como o lead vive isso

```text
copiou o código PIX e não pagou
   ├─ respondeu m1/m2 → agente explica → 2ª resposta → oferece o encontro
   └─ não respondeu   → 24h depois de m2, template m3 oferta o encontro
        ↓  aceita (clique ou texto)

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
- `recover-abandoned-checkout-whatsapp`: novo estágio **m3** do trilho copia e cola (≥24h depois de m2, sem nenhuma resposta do lead, sem pagamento e sem mandato ao vivo), gated por ContentSid aprovado em `system_config.wa_copiou_templates.m3`. Sem SID aprovado, o estágio simplesmente não roda. Validável com `{"dryRun": true}`, que já lista candidato, trilho e motivo do skip.
- `webhook-twilio-recovery` + `pix-buttons.ts`: botão "Quero experimentar" do m3 resolve na hora com o PIX de R$ 6,90; "Tenho uma dúvida" abre a janela de 24h e segue pro agente com o contexto de trava na autorização.

- `webhook-woovi`: reconhece `correlationID` de taster **antes** do fluxo de assinatura, cria/atualiza perfil `status='taster'`, `plan_tier='taster'`, `taster_expires_at = now + 48h`, e chama o mesmo `sendWelcomeWhatsApp` de hoje — **template de welcome já aprovado, sem template novo** — com o `pending_insight [WELCOME]` na versão taster (encontro de 45 min liberado + pedido do horário em 48h). O agendamento acontece no chat da Aura, pelo contrato de tag que já existe (`[AGENDAR_SESSAO]`), com `is_taster = true` na sessão criada.
- `woovi-pix-audit`: varredura extra para taster pago sem perfil, e expiração dos que passaram de 48h.
- `aura-agent`: `plan_tier = 'taster'` no mesmo bloco de entitlements do `lite`/`base` (1 sessão, 0 áudio, 0 meditação, 0 jornada); parede determinística fora da janela da sessão; convite ao plano no fechamento e expiração em seguida.

- Guardas de recuperação (`recover-abandoned-checkout`, `recover-abandoned-checkout-whatsapp`, `recovery-agent`, `woovi-recovery-guard`): `'taster'` explicitamente **não** entra nas listas de cliente ativo.

**Admin**
- Bloco no painel de recuperação com o funil do taster e taxa de conversão para pagante.

**Validação antes de ligar**
- `dryRun` no `criar-pix-taster` (calcula elegibilidade e valor sem criar charge).
- Teste ponta a ponta com o seu número: oferta → código → pagamento real de R$ 6,90 → perfil taster → agendamento → sessão → convite → expiração.
- Kill switch em `system_config.taster_enabled`, nascendo **desligado**; só liga depois do teste ponta a ponta passar.
