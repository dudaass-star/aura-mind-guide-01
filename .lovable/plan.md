
## Mudar modelo do aura-agent para Gemini 2.5 Pro

### O que sera feito

Trocar todas as referencias ao modelo `google/gemini-3-flash-preview` por `google/gemini-2.5-pro` no arquivo `supabase/functions/aura-agent/index.ts`.

Sao **4 chamadas** ao Lovable AI Gateway nesse arquivo que usam o modelo flash e precisam ser atualizadas:

1. **Linha 3261** - Chamada principal do chat (resposta ao usuario)
2. **Linha 3797** - Analise de contexto / classificacao
3. **Linha 3892** - Processamento auxiliar
4. **Linha 3941** - Processamento adicional

### Impacto

- **Qualidade**: Respostas mais inteligentes, melhor raciocinio e menos alucinacoes (como o erro de horario com a Clara)
- **Custo**: O modelo Pro consome mais creditos por requisicao que o Flash
- **Latencia**: Respostas podem demorar um pouco mais (o Pro e mais lento que o Flash)

### Detalhes tecnicos

**Arquivo:** `supabase/functions/aura-agent/index.ts`

Substituir em todas as 4 ocorrencias:
- De: `model: "google/gemini-3-flash-preview"`
- Para: `model: "google/gemini-2.5-pro"`

Apos a mudanca, a edge function sera reimplantada automaticamente.
