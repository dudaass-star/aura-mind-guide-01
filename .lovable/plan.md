
Diagnóstico confirmado: eu olhei a conversa, e você está certa.

Verifiquei no histórico salvo:
- 02:28:04.648596 — usuário: `Exatamente. É isso.`
- 02:28:04.860656 — Aura: `Exatamente. É isso. [AGUARDANDO_RESPOSTA]`

Ou seja: foi o bug exato de repetição, e a Aura realmente “parou” porque respondeu só com eco + tag de espera.

O que isso mostra:
1. Não foi o caso da Glaudia; eu estava olhando o trecho errado antes.
2. Não foi o sistema de envio que travou.
3. O problema aconteceu dentro do `aura-agent`, antes do envio, porque a resposta ecoada foi salva no banco.

Causa provável no código atual:
- O guard anti-echo existe em `supabase/functions/aura-agent/index.ts` (bloco ~4006), mas hoje ele:
  - só tenta re-gerar 1 vez;
  - se o retry falhar ou não melhorar, mantém a resposta ruim;
  - não tem uma trava final que proíba enviar eco puro;
  - deixa a resposta seguir com `[AGUARDANDO_RESPOSTA]`, o que faz parecer que a Aura abandonou a conversa.
- O sistema de interrupção do `webhook-zapi` não parece ser a causa desse caso.

Plano de correção:
1. Fortalecer a comparação anti-echo no `aura-agent`
- Remover tags internas antes de comparar:
  - `[AGUARDANDO_RESPOSTA]`
  - `[CONVERSA_CONCLUIDA]`
  - `[MODO_AUDIO]`
  - `[VALOR_ENTREGUE]`
  - `[ENCERRAR_SESSAO]`
  - bloco `[INSIGHTS]`
- Comparar a resposta “limpa” com a mensagem do usuário “limpa”.

2. Criar uma trava final de “eco proibido”
- Se a resposta final for:
  - idêntica ao texto do usuário; ou
  - quase idêntica e muito curta; ou
  - só uma confirmação vazia do tipo `Exatamente. É isso.`
então ela não poderá ser enviada.

3. Melhorar o fallback
- Em vez de “se o retry falhar, manda o eco mesmo”, trocar para:
  - tentar 1-2 retries com instrução explícita anti-eco;
  - se ainda falhar, usar um fallback seguro e não repetitivo, por exemplo:
    - validação curta + pergunta nova;
    - continuação contextual baseada no último tema.
- Isso garante que nunca mais saia uma resposta vazia/espelhada.

4. Bloquear tag de espera em resposta sem conteúdo novo
- Se a mensagem não trouxer avanço real, não permitir `[AGUARDANDO_RESPOSTA]`.
- Regra: só pode marcar “aguardando resposta” se houver acolhimento, reflexão ou pergunta nova de verdade.

5. Adicionar logs de diagnóstico
- Registrar quando o anti-echo:
  - detectou eco;
  - tentou retry;
  - caiu no fallback;
  - bloqueou uma resposta curta espelhada.
- Isso facilita confirmar se o bug sumiu.

6. Cobrir com casos de regressão
- Casos que precisam passar:
  - usuário: `Exatamente. É isso.` → Aura não pode repetir;
  - usuário: `É isso` → Aura precisa continuar a conversa;
  - usuário: `sim`, `isso`, `aham` → Aura pode confirmar, mas precisa acrescentar algo;
  - resposta com tag interna não pode mascarar eco.

Arquivos a ajustar:
- `supabase/functions/aura-agent/index.ts` — correção principal do anti-echo e fallback final
- opcionalmente `src/pages/AdminTests.tsx` — adicionar teste manual/diagnóstico para esse cenário

Resultado esperado:
- Mesmo se o modelo tentar repetir exatamente o usuário, a resposta não será enviada.
- A Aura sempre vai continuar com algo novo, em vez de ecoar e “parar”.
- Casos curtos como `Exatamente. É isso.` deixam de quebrar a conversa.
