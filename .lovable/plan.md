## Status da implementação

### O que está OK (confirmado no arquivo)

- **Linha 1597** — instrução de extractor reforça preservar linguagem do usuário sem aspas literais nem reformulação clínica. ✅
- **Linha 2234** — exemplo de recusa de escopo reescrito sem `[nome]` como vocativo de abertura. ✅
- **Linha 2244** — cardápio de interjeições substituído por regra única (parcimônia + anti-vocativo + anti-aspas em termos curtos). ✅
- **Linha 2410** — lista "Eita / Hmm / Sério?" removida; instrução genérica de reagir sem fórmula. ✅
- **Linha 3348 (agora 3344)** — encerramento de sessão reescrito: "linguagem que ele usou, sem aspas literais, sem paráfrase clínica, vale só para o encerramento". ✅
- **Linha 5889 (agora 5885)** — LEMBRETE ANTI-ECO sem sugerir interjeições específicas; pede variação e bloqueia padrão `Interjeição, [nome]...`. ✅
- **Resíduos** — `grep` por `"Eita..."`/`"Hmm..."`/`"Sério?"` em todo o arquivo: **zero ocorrências**. ✅
- **Logs `aura-agent`** — só 2 warnings transientes de 503 do gateway na extração paralela (post-analysis e action extractor), nada de `failed_message_log` por tag inválida nem erro de parsing do prompt. ✅
- **Memória** — `mem://persona/communication-style-and-rhythm` atualizada com as duas novas regras. ✅

### O que NÃO está 100% — resíduo encontrado

A linha **2767** (dentro do bloco `### FECHAMENTO` do prompt de sessão) ainda diz:

> *"Devolva a percepção central nas palavras que ELE usou (não parafraseie — a frase exata é o selo)."*

É **exatamente** a mesma instrução que corrigimos na 3344, só que num bloco diferente do prompt (FECHAMENTO da sessão, não o sub-bloco de áudio de encerramento). Se deixar assim, o vício das aspas pode voltar pelo caminho da sessão, derrotando o ajuste da 3344.

## Plano de fechamento (1 edição cirúrgica)

### Edição única — linha 2767

Substituir:

```
- Devolva a percepção central nas palavras que ELE usou (não parafraseie — a frase exata é o selo).
```

Por:

```
- Devolva a percepção central com a linguagem que ele usou — sem aspas literais e sem parafrasear em linguagem clínica. Preservar o peso da fala dele não significa repetir os termos entre aspas.
```

Mesma intenção do original (não perder o peso da fala do cliente), redação alinhada com o que já está na 3344, sem reabrir o vício de aspas.

### Validação

- Após o ajuste: novo `grep` por `"frase exata"`, `"palavras que ELE usou"`, `"palavras exatas"` para garantir que não sobrou outra cópia.
- Conferir `failed_message_log` nos 10 min seguintes ao deploy.

## Arquivo tocado

- `supabase/functions/aura-agent/index.ts` — uma edição na linha 2767.

Sem nova seção, sem migration, sem mudança de fluxo.

## Risco
Mínimo. Reescrita de uma linha alinhada à correção já aprovada da 3344.
