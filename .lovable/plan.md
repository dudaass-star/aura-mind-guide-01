# Avaliação das respostas do agente no lead Giovani (e correções)

## O que aconteceu (verificado no banco)

Thread: checkout do **Essencial mensal** iniciado 15/08 13:33, template de 15min às 16:50, lead responde às 17:03.

| Hora | Quem | Mensagem |
|---|---|---|
| 17:03 | Giovani | "Pagamentos recorrentes" |
| 17:03 | Agente | Explica o Pix Automático + link com UTM cru |
| 17:04 | Giovani | "Assim não" |
| 17:04 | Agente | "O Pix Automático não te prende…" + **o mesmo link de novo** |

## Diagnóstico das respostas

**1. "Assim não" foi tratado como dúvida, não como objeção.** É a falha central. O lead disse que *aquele formato* não serve pra ele — recorrência automática. O agente ignorou o sinal, repetiu o argumento de risco (que ele não pediu) e reenviou o mesmo link. O próprio prompt proíbe isso ("se ela não avança, NÃO repita o mesmo argumento"), mas nada no fluxo detecta recusa parcial: só há [STOP] para recusa total.

**2. Nunca ofereceu a alternativa óbvia.** Quem rejeita débito automático quer **cartão** (ou outro ciclo). A resposta certa em uma frase: "prefere no cartão então?" — existe no prompt como pergunta de fechamento, mas o modelo preferiu argumentar.

**3. Faltou o número concreto.** Duas mensagens falando de "1ª semana promocional" sem dizer **R$ 6,90** e sem nomear o plano que ele já escolheu (Essencial). Valor concreto destrava mais que argumento.

**4. Nenhuma pergunta em duas mensagens.** Mensagem 1 já veio com link, para um input de 2 palavras e ambíguo. Vira monólogo de vendedor.

**5. Higiene de link.** Link cru com `utm_source=...&utm_medium=recovery_agent&utm_campaign=auto_reply` duas vezes em 60 segundos. Parece robô e cheira a spam.

**6. Bug real de telefone (não é o LLM).** O webhook grava o inbound como `555184068922` (sem o 9) enquanto o template saiu para `5551984068922`. Resultado: **duas conversas** para o mesmo lead e o agente lendo histórico só do número truncado — ele não viu o template que a própria Aura mandou. Vai voltar a acontecer com qualquer lead do RS/DDD com esse formato.

## O que vai ser feito

### 1. Detecção de recusa parcial (deterministe, no backend)
Padrões como "assim não", "não quero automático", "não gosto de débito automático", "sem recorrência" passam a marcar a mensagem como `partial_refusal` e injetar no prompt uma instrução obrigatória: **oferecer o caminho alternativo (cartão) em UMA pergunta curta, sem link e sem repetir argumento**.

### 2. Anti-repetição e higiene de link
- Não reenviar o link se já foi enviado nas últimas 2 mensagens de saída — nesses casos só pergunta de fechamento.
- Link encurtado/limpo (`https://olaaura.com.br/v2/checkout` com os UTMs preservados, mas exibidos em linha separada e uma única vez por conversa).
- Bloquear resposta que repita mais de ~60% do conteúdo da última mensagem enviada (fallback: pergunta de fechamento).

### 3. Preço e plano concretos no prompt
Injetar no contexto o plano/ciclo do checkout com o **valor da 1ª semana e o valor cheio** (Essencial 6,90 → 29,90; Direção 9,90 → 49,90; Transformação 19,90 → 79,90), com instrução de citar o número quando falar de preço/semana promocional.

### 4. Uma pergunta antes do pitch em input ambíguo
Mensagem de entrada com ≤ 3 palavras que não é saudação (ex.: "Pagamentos recorrentes", "Assim não") → responder objetivamente e terminar com **pergunta**, sem tag de link.

### 5. Corrigir a duplicação de telefone
- `webhook-twilio-recovery`: normalizar com `normalizeBrazilianPhone` antes de gravar mensagem e conversa (chave canônica 13 dígitos).
- `recovery-agent`: buscar histórico e conversa por `getPhoneVariations` em vez de `eq`.
- Migração única mesclando as conversas duplicadas existentes (mensagens repontadas para o número canônico, contadores somados).

## Detalhes técnicos
- `supabase/functions/recovery-agent/index.ts`: novos regex `PARTIAL_REFUSAL`, cálculo de `linkRecentlySent` e similaridade com a última saída, bloco `PLANO E VALORES` no `contextBlock`, histórico via `.in("phone", getPhoneVariations(phone))`.
- `supabase/functions/webhook-twilio-recovery/index.ts`: `const cleanPhone = normalizeBrazilianPhone(extractPhone(from))`.
- `recovery_agent_config.system_prompt`: acrescentar a regra de recusa parcial (trocar de trilho, não argumentar) e a de citar valor concreto; manter o resto.
- Preços vindos de `src/lib/plan-pricing.ts` + mapa de trial do `CheckoutV2.tsx`, replicados na KB (`preco`).
- Nada muda em quiet hours, `max_auto_replies` (3), guardas de usuário ativo ou Twilio.
