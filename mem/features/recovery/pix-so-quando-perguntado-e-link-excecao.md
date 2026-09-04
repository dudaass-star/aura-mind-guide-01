---
name: Recovery agent — PIX só quando perguntado, link é exceção
description: Agente de recuperação não explica PIX Automático sem pergunta e só envia o link do checkout sob condição (pedido do lead ou 1ª vez em 24h)
type: preference
---

**Regra:** o `recovery-agent` NUNCA explica PIX Automático, autorização bancária ou "8º dia" se o lead não abriu o assunto, e o link do checkout NÃO é assinatura de mensagem.

**Como está aplicado:**
- `duvida_tecnica` saiu de `ALWAYS_CATEGORIES` (16 itens, quase todos de PIX) — entra por relevância/keyword.
- `renderPlanValues(plan, billing, pixContext)`: versão enxuta (só "sai hoje R$ X / mensalidade R$ Y") quando `pixContext=false`; versão completa (autorização + 8º dia) só quando `RE_PIX_TOPIC` bate na mensagem atual ou nas 2 últimas trocas, ou quando `pix_copied_at`/`pixIntent="conversational"`.
- `sendLink` tem gate no backend: se já houve outbound com `/v2/checkout` nas últimas 24h e o lead não pediu (`RE_ASK_LINK`), o link é suprimido — e o URL é removido do corpo se o modelo colar sozinho.
- Mensagem curta ("ok", "obrigada"): 1-2 frases, sem link, sem tag.
- `recovery_agent_config.system_prompt`: `[ENVIAR_LINK]` descrito como exceção; seção de PIX condicional.

**Por que:** 62% das respostas do agente terminavam em link e 40% falavam de autorização/8º dia, inclusive respondendo "Não tenho dinheiro" com aula de PIX. Parecia robô.
