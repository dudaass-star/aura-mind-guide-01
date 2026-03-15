

## Plano: Melhorias na Mensagem de Encerramento do Trial

### Problema Atual
- A IA envia CTA com link de checkout nas mensagens 8, 9 e 10 (triplo CTA em ~5 minutos)
- A mensagem automática `trial_closing` (2 min depois) é genérica e idêntica para todos
- Link incorreto: `olaaura.com.br/checkout` (correto seria `olaaura.com.br/checkout` -- preciso verificar o domínio real vs o que está no código)
- 0% de conversão nos 7 trials completados

### Mudanças Planejadas

**1. Remover CTA da mensagem 10 da IA** (`aura-agent/index.ts`)
- Mudar a instrução da msg 10: em vez de incluir link de checkout, a IA faz apenas um encerramento emocional e carinhoso, validando o que o usuário compartilhou -- sem vender nada
- Manter msgs 8 (lembrete leve) e 9 (penúltima com link) como estão

**2. Personalizar `trial_closing` com tema da conversa** (`webhook-zapi/index.ts` + `execute-scheduled-tasks/index.ts`)
- No `webhook-zapi`, ao agendar a `trial_closing` na 10ª msg, buscar as últimas 5 mensagens do usuário e extrair o tema principal via uma heurística simples (pegar palavras-chave ou o conteúdo da última mensagem do usuário)
- Salvar o tema no `payload` da scheduled_task: `{ theme: "estresse no trabalho" }`
- No `execute-scheduled-tasks`, usar o tema para personalizar a mensagem de encerramento

**3. Corrigir link e adicionar contexto de valor** (`execute-scheduled-tasks/index.ts` + `aura-agent/index.ts`)
- Padronizar todos os links para `https://olaaura.com.br/checkout`
- Na mensagem automática de closing, adicionar contexto de valor: mencionar o plano Essencial a partir de R$29,90/mês e o que inclui (conversas ilimitadas com a Aura)

### Detalhes Técnicos

**Arquivo 1: `supabase/functions/aura-agent/index.ts` (~linha 3553-3559)**
- Msg 10: Remover link de checkout e instrução de CTA. Nova instrução: "Faça um encerramento emocional genuíno. Valide o que o usuário compartilhou. NÃO mencione planos, preços ou links. Apenas demonstre carinho e gratidão pela jornada juntos."
- Msg 9: Corrigir link para `https://olaaura.com.br/checkout`

**Arquivo 2: `supabase/functions/webhook-zapi/index.ts` (~linha 499-513)**
- Ao agendar `trial_closing`, buscar últimas mensagens do usuário para extrair tema
- Incluir `theme` no payload da task

**Arquivo 3: `supabase/functions/execute-scheduled-tasks/index.ts` (~linha 185-214)**
- Usar `payload.theme` para personalizar a mensagem
- Nova mensagem template com tema, valor e link correto:
  ```
  {nome}, foi muito especial conversar com você sobre {tema} 💜
  
  Eu vi o quanto isso é importante pra você, e quero continuar 
  te acompanhando nessa jornada.
  
  Com o plano Essencial (a partir de R$29,90/mês), você tem 
  conversas ilimitadas comigo — no seu ritmo, quando precisar.
  
  👉 https://olaaura.com.br/checkout
  
  Sem pressa. Vou estar aqui quando você decidir. 💜
  ```

**Arquivo 4: `supabase/functions/webhook-zapi/index.ts` (~linha 470-478)**
- Corrigir link na mensagem de bloqueio pós-trial (msg 11+) também

### Arquivos Modificados
1. `supabase/functions/aura-agent/index.ts` -- remover CTA da msg 10, corrigir link da msg 9
2. `supabase/functions/webhook-zapi/index.ts` -- incluir tema no payload do trial_closing, corrigir link do bloqueio
3. `supabase/functions/execute-scheduled-tasks/index.ts` -- personalizar mensagem com tema e valor

