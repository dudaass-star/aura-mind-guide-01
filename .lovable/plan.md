## Problema

O agente do Instagram (`instagram-agent`) hoje:
1. Cita abertamente "Logoterapia, Estoicismo, Investigação Socrática" como base. Você não quer expor a metodologia interna em rede social.
2. Tem instrução genérica para "críticas sobre IA" — não está blindado para denúncias do tipo "isso é terapia por IA / exercício ilegal da psicologia".

## Plano

Editar `supabase/functions/instagram-agent/index.ts`. Duas mudanças, sem mexer em mais nada (webhook, classificação de sentimento, envio Graph API, etc. ficam iguais).

### 1. Remover menção a métodos no conteúdo público

- Em `AURA_KNOWLEDGE_BASE`, remover a linha "Baseada em Logoterapia, Estoicismo e Investigação Socrática".
- Substituir por descrição neutra: "metodologia própria de autoconhecimento e direção prática, com base em abordagens consagradas de desenvolvimento humano" (sem nomear escolas).
- Em `COMMENT_SYSTEM_PROMPT` (bloco "CRÍTICAS sobre IA"), remover a citação explícita das 3 metodologias. Trocar por "metodologia própria validada".
- Adicionar regra dura no topo dos dois prompts: **"NUNCA nomeie escolas, autores ou correntes (Logoterapia, Frankl, Estoicismo, Sócrates, TCC, etc.). Fale só em 'metodologia própria' / 'abordagem de autoconhecimento'."**

### 2. Postura específica para denúncias de "terapia por IA"

Adicionar uma nova seção em ambos os prompts (COMMENT e DM), com prioridade sobre "CRÍTICAS sobre IA":

> **DENÚNCIAS / ACUSAÇÕES DE EXERCÍCIO DA PSICOLOGIA** (palavras-chave: "psicóloga", "psicólogo", "CRP", "exercício ilegal", "terapia", "psicoterapia", "diagnóstico", "tratamento", "CFP", "denunciar"):
> - Tom: respeitoso, firme, sem defensividade.
> - Reconhecer a preocupação como legítima.
> - Esclarecer com clareza que a Aura **não** realiza atividades privativas do psicólogo, citando expressamente:
>   - não faz **diagnóstico** de transtornos mentais,
>   - não oferece **psicoterapia** nem **tratamento** clínico,
>   - não emite **laudos, pareceres ou avaliações psicológicas**,
>   - não **prescreve** condutas terapêuticas.
> - Posicionar a Aura como: ferramenta de **autoconhecimento, organização de pensamentos e direção prática para o dia a dia**, complementar — nunca substituta — ao trabalho de psicólogo(a) ou psiquiatra.
> - Em casos de sofrimento intenso, recomendar busca de profissional habilitado (psicólogo/psiquiatra, CVV 188).
> - Comentário: 2-3 frases. DM: 3-5 frases. Sem emoji defensivo.

Exemplo de tom (referência interna, não copy fixo): *"Oi, entendemos a preocupação e ela é legítima. A Aura não faz diagnóstico, psicoterapia, laudos nem prescreve tratamento — atividades privativas de psicólogos. Somos uma ferramenta de autoconhecimento e organização de pensamentos, complementar (nunca substituta) ao trabalho clínico. Para quadros que pedem acompanhamento profissional, sempre orientamos buscar psicólogo(a) ou psiquiatra."*

### 3. Reforço cruzado

Adicionar regra geral nos dois prompts: **"Sempre que falar do escopo, deixar claro que Aura ≠ terapia, ≠ tratamento de transtorno, ≠ diagnóstico. É autoconhecimento e direção prática."**

### Arquivos afetados

- `supabase/functions/instagram-agent/index.ts` — só edição dos prompts e knowledge base.

### Fora de escopo

- Memória/registro de denúncias (se quiser depois, criamos tabela `instagram_safety_flags`).
- Mudar modelo (continua `gemini-2.5-flash`).
- Mexer no fluxo do `webhook-instagram`.

### Validação

- Após deploy, testar via `curl_edge_functions` com 3 payloads:
  1. "Vocês fazem terapia?" → deve responder com escopo claro, sem citar logoterapia.
  2. "Isso é exercício ilegal da psicologia, vou denunciar no CRP" → deve disparar o bloco novo, citar não-diagnóstico/não-psicoterapia/não-laudo.
  3. "Como funciona?" → deve descrever sem nomear métodos.

Confirma e eu já implemento?