## Diagnóstico do estado atual

A aba já tem boa estrutura, mas o resultado ainda é "lista de dados crus" porque estamos exibindo `key + value` direto do `user_insights`. As chaves vêm do extrator (Flash-lite) e são arbitrárias — viram rótulos sem sentido quando expostas:

- "Fazer / As coisas sem medo" — chave é verbo solto
- "Sentir / Mais livre" — fragmento
- "Comida / Felicidade", "Sorvete / Resolveu o conflito" — pares nonsense
- "Padrão de comportamento / Adiamento" + "Comportamento / Adiamento" — duplicata semântica
- "Esposa" sozinha sem nome nem contexto — chip vazio
- Temas grudados visualmente (artefato de paste, mas vale revisar o `gap`)

A raiz do problema: **dados brutos do extrator não foram desenhados para leitura humana**. Refinar regex/blacklist é enxugar gelo — sempre vai vazar lixo novo. Pra entregar UAU, a aba precisa parar de mostrar dados e passar a mostrar **um retrato**.

## Proposta: Retrato curado por IA, com cache

Em vez de renderizar insights crus, geramos um **retrato narrativo** via Gemini Flash, atualizado de forma incremental e cacheado. O frontend lê o retrato pronto + alguns chips selecionados, e a tela vira algo que parece feito à mão pela Aura.

### Arquitetura

1. **Nova tabela `user_portraits`** (cache por usuário):
   - `user_id` (pk)
   - `intro` (1 frase de abertura personalizada, ex: "Eduardo, pai da Bella e da Selena, em transição de hábitos.")
   - `pessoas` (jsonb: `[{label, names, nota?}]` — já curado, sem duplicatas)
   - `o_que_te_move` (jsonb: `[{titulo, descricao}]` — 3-5 itens, frases inteiras)
   - `padroes` (jsonb: `[{titulo, descricao}]` — 2-4 padrões reais, sem duplicata semântica)
   - `preferencias` (jsonb: `[{titulo, descricao}]` — opcional, só se houver sinal real)
   - `conquistas` (jsonb: `string[]` — frases curtas)
   - `sensiveis` (jsonb: `string[]`)
   - `generated_at`, `insights_version` (hash do conteúdo bruto pra invalidar cache)

2. **Edge function `generate-user-portrait`** (Gemini Flash):
   - Lê `user_insights` (não-contexto) + `session_themes` + nome do `profiles`
   - Prompt pede pra escrever em PT-BR informal, na voz da Aura, em 3ª pessoa íntima, **agrupando temas similares** e **descartando lixo operacional**
   - Output JSON estruturado (schema acima)
   - Grava em `user_portraits` com `insights_version = md5(...)`
   - Reaproveita cache se hash não mudou

3. **Trigger de regeneração**:
   - Async, fire-and-forget, chamado pelo próprio frontend quando detecta cache stale (>24h ou versão divergente)
   - Loading state: mostra a versão antiga enquanto regenera

### Tela nova (`SobreVoceTab.tsx`)

Layout reescrito pra parecer uma carta da Aura, não um dump:

```text
┌────────────────────────────────────┐
│ Oi, Eduardo 👋                      │  ← header com micro-fade-in
│ Aqui está o que eu fui aprendendo  │
│ sobre você nas nossas conversas.   │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ {intro em itálico, 1 frase}        │  ← card destaque com gradient sutil
└────────────────────────────────────┘

Pessoas da sua vida
[Esposa]  [Filhas · Bella, Selena]    ← só chips com info real

O que te move
• Quebrar a inércia do test drive...   ← cada item é UMA frase
• Voltar aos treinos no horário do...
• Sentir mais liberdade no dia a dia

Padrões que percebi
" Você costuma adiar sessões quando   ← blockquote, sem rótulo-chave
   os projetos engatam. "

Preferências
• Conversas leves e gostosas
• Evita psicologia de manual

Conquistas              [badges]

Pontos sensíveis (colapsado)

Temas em movimento     [chips com gap correto]
Já trabalhados         [chips riscados]

→ "Algo não bate? Me corrige no WhatsApp"
```

### Mudanças visuais (UAU)

- Header: micro-animação de fade+slide na entrada (Motion), tipografia maior
- Card de intro: `bg-gradient-to-br from-accent/5 to-transparent`, borda sutil, ícone Sparkles
- Seções: ícone + título em uppercase mantido, mas com `divider` fino entre blocos pra dar respiração
- ProseCard removido — **sem mais `key` em cima**. Itens viram frases completas, em lista com bullet `•` accent
- People chips: **omite** entradas sem nome E sem nota (resolve "Esposa" solta)
- Temas: garantir `flex-wrap gap-2` correto, e `theme_name` com `.trim()` defensivo
- Loading: skeleton elegante em vez de spinner
- Empty state já está bom

### Arquivos

- **Nova migration**: tabela `user_portraits` + grants + RLS (read via token portal, write via service_role)
- **Nova edge function**: `supabase/functions/generate-user-portrait/index.ts`
- **Reescrita**: `src/components/portal/SobreVoceTab.tsx` (remove curadoria heurística, lê do retrato)
- **Hook utilitário**: `src/components/portal/usePortrait.ts` (query + trigger de regeneração stale)

### Por que isso resolve

| Problema atual | Solução |
|---|---|
| Chaves arbitrárias expostas ("Fazer", "Sorvete") | LLM reescreve em frases, descarta chaves |
| Duplicatas semânticas ("Padrão" + "Comportamento") | LLM agrupa antes de escrever |
| "Esposa" sem nome ocupando espaço | LLM decide se vale citar; frontend filtra entradas vazias |
| Cards parecem dump de dados | Vira narrativa em 1ª pessoa da Aura |
| Curadoria heurística sempre vaza lixo novo | Sem regex frágil — modelo decide |
| Tela "sem UAU" | Intro narrativa + tipografia + microinterações |

### Custos

Gemini Flash, ~2-4k tokens input, ~800 output por usuário, regenerado no máx 1x/dia → centavos por usuário/mês. Cache evita custo recorrente.

### Riscos

- LLM pode alucinar — mitigamos com prompt restritivo ("só use o que está no input, não invente") + temperatura baixa
- Primeira carga lenta se cache vazio — mostramos skeleton + texto "Aura está organizando o que sabe sobre você…"
- Schema JSON pode falhar — usar `responseMimeType: application/json` + tool calling pra forçar estrutura

### Fora de escopo

- Não mexer no extrator (`session-extractor` ou agente principal)
- Não mexer em `session_themes` (já está OK)
- Não adicionar foto/avatar (já decidimos remover)
