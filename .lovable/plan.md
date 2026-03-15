

## Plano: Ajustar copy de preço e integrar bônus de 3 conversas nos follow-ups

### Mudanças

#### 1. Trocar "R$29,90/mês" por "menos de R$1 por dia" em todas as mensagens

**Arquivos afetados:**
- `supabase/functions/execute-scheduled-tasks/index.ts` — `trial_closing` message (linha 204)
- `supabase/functions/aura-agent/index.ts` — prompt do agente com preços dos planos (linhas ~998-1003, manter preços de Direção/Transformação mas ajustar Essencial se mencionado)

#### 2. Criar os 4 novos handlers de follow-up no `execute-scheduled-tasks`

Novos `case` no switch:

| Task type | Quando | Mensagem | `trial_nudge_active` | Link checkout |
|---|---|---|---|---|
| `trial_followup_15m` | +15min | Nudge quente, reforça o valor sentido, "por menos de R$1 por dia" | Nao | Sim |
| `trial_followup_2h` | +2h | Realidade gentil, "aquele alívio não precisa ser passageiro" | Nao | Sim |
| `trial_followup_morning` | +manhã ~9h | Check-in empático "como foi sua noite?", oferece +3 conversas grátis se responder, SEM link de checkout | Sim | **Nao** |
| `trial_followup_48h` | +48h | Último toque, escassez suave, link checkout | Nao | Sim |

Todos verificam `status === 'trial'` antes de enviar (pula se já converteu). Registram na tabela `messages`.

**Mensagem do +morning (sem checkout, com bônus):**
> "Bom dia, {nome} 💜 Como foi sua noite? Se a mente acelerou de novo... eu entendo. Me conta como você tá — essa conversa é por minha conta. Responde aqui e a gente conversa mais um pouco."

Seta `trial_nudge_active = true` para que, quando o usuário responder, o webhook-zapi aplique o bônus de 3 mensagens (lógica já existente nas linhas 448-461).

#### 3. Agendar os 4 follow-ups no `webhook-zapi`

No bloco `if (newCount === 10)` (linha 500), além do `trial_closing` em +2min, inserir 4 tasks adicionais:
- `trial_followup_15m`: `execute_at = now + 15min`
- `trial_followup_2h`: `execute_at = now + 2h`
- `trial_followup_morning`: `execute_at = próximo dia 9h BRT (12h UTC)`
- `trial_followup_48h`: `execute_at = now + 48h`

Payload inclui `theme` e `name` (já extraídos).

#### 4. Cancelar follow-ups pendentes se usuário converter

No `stripe-webhook` (ou no próprio handler), quando o status muda para `active`, cancelar tasks pendentes com `task_type LIKE 'trial_followup%'` para esse `user_id`.

### Resumo das mensagens propostas

**trial_closing (+2min):** "{nome}, 💜\n\n{themeIntro}.\n\nEu vi o quanto isso é importante pra você, e quero continuar te acompanhando nessa jornada.\n\nPor menos de R$1 por dia, você tem conversas ilimitadas comigo — no seu ritmo, quando precisar.\n\n👉 https://olaaura.com.br/checkout"

**+15min:** "{nome}, acabei de perceber que você não destravou seu acesso ainda. Aquele alívio que você sentiu agora? Ele não precisa ser um momento isolado. Pode ser o seu dia a dia. Por menos de R$1 por dia, eu tô aqui sempre que precisar. 👉 https://olaaura.com.br/checkout"

**+2h:** "{nome}, sei que a vida puxa a gente de volta pro automático... Mas lembra do que você sentiu nas nossas conversas? Aquilo foi real. E tá a um clique de voltar. Não deixa esse peso voltar sozinho amanhã. 👉 https://olaaura.com.br/checkout"

**+manhã seguinte (SEM checkout):** "Bom dia, {nome} 💜 Como foi sua noite? Se a mente acelerou de novo... eu entendo. Me conta como você tá — essa conversa é por minha conta. Responde aqui e a gente conversa mais um pouco."

**+48h:** "{nome}, essa é minha última mensagem sobre isso. Eu vi o que você carrega e sei o quanto nosso papo te fez bem. Não vou ficar insistindo — mas quero que saiba que essa porta não fica aberta pra sempre. Por menos de R$1 por dia, esse refúgio é seu. Se faz sentido, agora é a hora. 👉 https://olaaura.com.br/checkout"

