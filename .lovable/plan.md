# Sessão Grátis como Gatilho de Conversão — Análise e Opções

A ideia faz sentido, mas o formato importa tanto quanto os gatilhos. Uma "sessão grátis" mal delimitada canibaliza o trial de R$ 6,90, aumenta custo de atendimento e abre margem para abuso. Abaixo estão os três momentos levantados, refinados, e uma quarta opção que costuma ter ROI mais previsível.

## Onde oferecer (ordem de prioridade)

1. **Cliente em dúvida na recuperação de checkout abandonado** (mais quente)
   - Já demonstrou intenção de compra, conhece o preço e travou em algum detalhe (PIX, valor, tempo).
   - Aqui a sessão grátis vira objeto de negociação: "Bora resolver essa dúvida numa sessão de 20 min antes de você decidir?".
   - O agente de recuperação pode oferecer isso automaticamente quando detectar objeção de segurança/como_funciona, sem nunca oferecer cartão pra quem escolheu PIX.

2. **Remarketing para quem acessou o site e não comprou** (volume alto, frio)
   - Anúncio direto para "sessão de descoberta gratuita" funciona, mas exige captura de WhatsApp antes — landing dedicada, não popup no /v2.
   - Risco: atrair curiosos que nunca converteriam em pagantes. Requer filtros (ex: só quem passou mais de 30s na página de preços).

3. **Cliente saindo do site sem compra** (intenção média)
   - Exit intent popup com "sessão grátis" pode funcionar, mas na Aura o popup atual já é o da oferta semanal. Trocar por grátis pode reduzir a conversão de R$ 6,90 em vez de aumentar.
   - Melhor uso: testar como segunda camada — só aparece se o lead fechou o popup de R$ 6,90 ou voltou 2+ vezes sem comprar.

4. **Sugestão adicional: pós-checkin ou follow-up de leads antigos** (custo baixo)
   - Leads que preencheram formulário, clicaram em pagar, mas não concluíram há +7 dias.
   - Oferecer "uma sessão de alinhamento gratuita" reaquece a base sem pagar tráfego novo.

## Formato recomendado para não quebrar o modelo de negócio

A sessão grátis não deve ser um "plano essencial grátis por X dias". Isso mata o trial pago. O formato mais seguro:

- **1 sessão de 30-45 min agendada no WhatsApp**.
- **Sem acesso ao chat contínuo** fora dessa sessão.
- **Sem recorrência automática**; ao final, a Aura oferece o plano com trial de R$ 6,90.
- **1 sessão por telefone / por e-mail**, com cooldown de 30-90 dias.
- **Prioridade para objeções quentes**: PIX, segurança, tempo.

## Trade-offs a considerar

| Problema | Cuidado |
| --- | --- |
| Abuso | Limitar 1 sessão por telefone; exigir nome e WhatsApp; marcar `free_session_claimed` no profile. |
| Canibalização | Nunca oferecer grátis antes de mostrar o trial de R$ 6,90. Grátis é a segunda opção, não a primeira. |
| Custo operacional | Sessão gratuita consome tempo da Aura, mas não entra no orçamento de áudio pago. Pode ser texto por padrão, áudio opcional. |
| Qualidade do lead | Quem vem por "grátis" no remarketing tende a ter menor conversão. Usar como filtro de engajamento, não como volume puro. |
| Escala | O agente de recuperação consegue oferecer sozinho; remarketing exige novo funil e templates de WhatsApp aprovados. |

## Próximo passo sugerido

Não implementar os três pontos de uma vez. A ordem de teste mais segura:

1. **Piloto no recovery de checkout** — ajustar o `recovery-agent` para oferecer a sessão grátis quando detectar objeção de segurança/como_funciona. Menor custo, leads mais quentes.
2. **Medir conversão** — comparar checkout recovery com e sem oferta de sessão grátis.
3. **Depois expandir** para exit intent secundário e remarketing, com landing dedicada.

## Detalhes técnicos (se prosseguir)

- Reutilizar a tabela `sessions` com `status = 'free'` ou `type = 'free_taster'`.
- Novo campo `free_session_offered_at` / `free_session_claimed_at` em `profiles` para controle de abuso.
- Atualizar `recovery-agent` (`supabase/functions/recovery-agent/index.ts`) para emitir uma tag tipo `[AGENDAR_SESSAO_GRATUITA:YYYY-MM-DD HH:MM]` quando o prompt autorizar.
- Handler em `aura-agent` para criar sessão com `status = 'free'` e não cobrar.
- Template de WhatsApp aprovado para convite: "Oi {{1}}, vi que você ficou com dúvida. Bora fazer uma sessão de 30 min de graça pra eu te mostrar como a Aura funciona?".
- Painel admin: contagem de sessões gratuitas agendadas, concluídas, e taxa de conversão para plano pago.
