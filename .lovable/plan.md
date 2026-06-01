## Causa raiz confirmada

O envio parou em **12/maio** por inconsistência entre prompt e código:

- **Prompt (linhas 2577-2581 do `aura-agent/index.ts`)** instrui: "você NÃO precisa especificar categoria ou usar tags. Apenas converse naturalmente."
- **Código (linha 7496)** só dispara `send-meditation` quando encontra `[MEDITACAO:categoria]`.
- **Fallback (linha 7742)** só cobre quando o **usuário** escreve "meditar"/"meditação" — não cobre o caso comum em que a Aura oferece proativamente e o usuário responde "sim/bora/manda".

**Resultado:** 15+ promessas de meditação em prosa nos últimos 7 dias, **zero envios reais**, usuária reclamando ("Deve ter dado algum tilt no sistema").

Essa redação atual ("não precisa de tag") nasceu da preocupação legítima de evitar que a Aura **invente** scripts de meditação em texto. Precisamos restaurar a tag **sem** reabrir a porta pra ela escrever meditação própria.

---

## Fix (cirúrgico, dois pontos, sem mexer em arquitetura)

### 1. Reescrever bloco "MEDITAÇÕES GUIADAS" no prompt (linhas 2577-2581)

Novo texto enfatiza **duas regras inseparáveis**: usar SÓ o catálogo + emitir a tag.

```
# MEDITAÇÕES GUIADAS

Você tem uma BIBLIOTECA FIXA de meditações pré-gravadas (categorias na seção
"Meditações Disponíveis" mais abaixo, com a voz da Aura, profissionais).

REGRAS INEGOCIÁVEIS:

1. NUNCA escreva uma meditação no chat (sem "Inspire... segure... solte...",
   sem roteiros, sem instruções de respiração detalhadas em texto). O áudio
   gravado faz isso melhor.

2. SEMPRE que oferecer/prometer uma meditação, inclua no FINAL da mesma
   resposta a tag [MEDITACAO:categoria] escolhendo UMA categoria EXATA
   da lista do catálogo (ex: [MEDITACAO:respiracao], [MEDITACAO:sono],
   [MEDITACAO:ansiedade], [MEDITACAO:estresse], [MEDITACAO:foco],
   [MEDITACAO:gratidao]). Sem essa tag, o áudio NÃO é enviado e o usuário
   fica esperando — quebra de confiança.

3. Se nenhuma categoria do catálogo casa com o momento, NÃO ofereça meditação;
   conduza pela conversa (logoterapia/presença) em vez de inventar.

Exemplo correto:
"Vou te mandar uma meditação pra acalmar a respiração 💜 [MEDITACAO:respiracao]"

A tag é técnica e o usuário não a vê — ela só dispara o áudio do catálogo.
```

Isso preserva a trava anti-invenção (regra 1 e 3) e religa o gatilho de envio (regra 2).

### 2. Expandir o fallback de keywords (linhas 7737-7795)

Hoje só dispara se a **mensagem do usuário** contém "meditar/meditação". Adicionar segundo gatilho: se a **resposta atual da Aura** prometeu meditação mas esqueceu a tag, inferir categoria pelo texto da própria Aura e disparar mesmo assim. Regex em `assistantMessage`:

```ts
/vou (te |lhe )?(mandar|soltar|enviar|colocar).*meditaç/i
// ou
/te mando.*meditaç/i
```

Inferência de categoria reaproveita o bloco de keywords já existente (linhas 7761-7767), mas aplicado ao `assistantMessage` em vez do `userLower`. Mantém o try/catch já presente (segue a regra de fallbacks opcionais). Loga `⚠️ FALLBACK-AURA-FORGOT-TAG` pra ficar rastreável.

Resultado: mesmo se o LLM esquecer a tag em algum caso de borda, o áudio chega — e fica registrado em log pra ajustarmos o prompt depois se virar recorrente.

---

## Escopo

- **Mudar:** `supabase/functions/aura-agent/index.ts` (bloco 2577-2581 + fallback 7737-7795).
- **Não mudar:** `send-meditation`, catálogo, RLS, schema, contrato de detecção da tag, lógica de orçamento de áudio.
- **Validação pós-deploy (≤10 min):**
  - `select * from failed_message_log where created_at > now() - interval '10 minutes'` (drift Lovable→GH Actions; redeployar manual se necessário, conforme memória).
  - Conferir nos logs do `aura-agent` que próximas promessas de meditação trazem `[MEDITACAO:*]`.
  - Conferir `user_meditation_history` recebendo linhas novas e logs de `send-meditation` voltando a aparecer.

## Fora de escopo
- Refatorar a arquitetura de detecção (NLP automática "sem tag" como sugeria o prompt antigo).
- Mexer na biblioteca de meditações ou no `send-meditation`.
- Mass-fix em outros profiles com telefone curto.

Confirma que vou em frente com **ambos os passos (prompt + fallback expandido)**?