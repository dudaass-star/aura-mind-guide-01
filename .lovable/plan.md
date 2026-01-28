

# Plano: Geração de Áudio em Chunks com Persistência

## Resumo

Implementar um sistema de geração de áudio **progressiva por chunks**, onde cada chunk de ~1.200 caracteres é gerado em uma execução separada da Edge Function, salvo no Storage, e depois todos são concatenados para formar o áudio final. Isso contorna o limite de 60 segundos dividindo o trabalho em múltiplas chamadas.

## Como Funciona

```text
Script (7.000 chars)
        |
        v
  Divide em 6 chunks (~1.200 chars cada)
        |
        v
+-------+-------+-------+-------+-------+-------+
|Chunk 1|Chunk 2|Chunk 3|Chunk 4|Chunk 5|Chunk 6|
+-------+-------+-------+-------+-------+-------+
    |       |       |       |       |       |
    v       v       v       v       v       v
 Edge Fn  Edge Fn  Edge Fn  Edge Fn  Edge Fn  Edge Fn
 (~20s)   (~20s)   (~20s)   (~20s)   (~20s)   (~20s)
    |       |       |       |       |       |
    v       v       v       v       v       v
 Storage  Storage  Storage  Storage  Storage  Storage
 chunk_0  chunk_1  chunk_2  chunk_3  chunk_4  chunk_5
        \       \       \       |       /       /
         \       \       \     |       /       /
          +-------+-------+---+-------+-------+
                          |
                          v
                   Concatenar MP3s
                          |
                          v
                   audio.mp3 final
```

## Etapa 1: Nova Tabela para Rastrear Progresso

Criar tabela `meditation_audio_chunks` para rastrear o progresso de geração:

```sql
CREATE TABLE meditation_audio_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meditation_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  storage_path TEXT,          -- null até gerar
  status TEXT DEFAULT 'pending', -- pending, generating, completed, failed
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(meditation_id, chunk_index)
);
```

## Etapa 2: Nova Edge Function `generate-chunk`

Criar função focada que gera **apenas um chunk** por vez:

**Input:**
```json
{
  "meditation_id": "med-ansiedade-123",
  "chunk_index": 0
}
```

**Processo:**
1. Buscar meditação e dividir script em chunks
2. Verificar se chunk já foi gerado (skip se já existe)
3. Gerar áudio apenas do chunk especificado (~20s)
4. Salvar em Storage: `{meditation_id}/chunks/chunk_0.mp3`
5. Atualizar registro na tabela com status "completed"
6. Retornar sucesso

## Etapa 3: Nova Edge Function `finalize-meditation-audio`

Função que concatena todos os chunks quando todos estiverem prontos:

**Input:**
```json
{
  "meditation_id": "med-ansiedade-123"
}
```

**Processo:**
1. Verificar se todos chunks têm status "completed"
2. Baixar todos os MP3 parciais do Storage
3. Concatenar em ordem
4. Salvar áudio final em `{meditation_id}/audio.mp3`
5. Criar/atualizar registro em `meditation_audios`
6. Limpar chunks do Storage (opcional, economia de espaço)

## Etapa 4: Atualizar Admin para Orquestrar

Modificar a página Admin para:

1. **Botão "Iniciar Geração"**: 
   - Divide script em chunks
   - Cria registros na tabela `meditation_audio_chunks`
   - Inicia geração do chunk 0

2. **Polling de Progresso**:
   - Mostra barra de progresso (ex: "Chunk 3/6 - 50%")
   - Quando um chunk completa, automaticamente inicia o próximo
   - Quando todos completam, chama `finalize-meditation-audio`

3. **Interface Visual**:
   ```text
   Meditação: Controle da Ansiedade
   Progresso: ████████░░░░░░░░ 3/6 chunks (50%)
   Status: Gerando chunk 4...
   [Pausar] [Cancelar]
   ```

4. **Retomada**: Se a geração pausar, pode retomar de onde parou

## Etapa 5: Registro das Edge Functions

Adicionar no `config.toml`:
```toml
[functions.generate-chunk]
verify_jwt = false

[functions.finalize-meditation-audio]
verify_jwt = false
```

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/functions/generate-chunk/index.ts` | Criar |
| `supabase/functions/finalize-meditation-audio/index.ts` | Criar |
| `src/pages/AdminMeditations.tsx` | Modificar |
| `supabase/config.toml` | Modificar |
| Migration SQL | Criar tabela |

## Vantagens

- **Sem timeout**: Cada chunk processa em ~15-25 segundos
- **Retomável**: Se falhar, não perde progresso anterior
- **Visibilidade**: Progresso em tempo real na UI
- **Escalável**: Funciona para meditações de qualquer tamanho
- **Robusto**: Retry automático em caso de falha de chunk individual

## Seção Tecnica

### Concatenação de MP3

A concatenação simples de bytes de MP3 funciona na maioria dos casos (o código atual já faz isso), mas para máxima compatibilidade, cada chunk deve:
- Usar a mesma configuração de voz/velocidade
- Não ter headers ID3 no meio do arquivo

### Tamanho do Chunk

Com `maxChars = 1200` e speaking rate de 0.90:
- ~1.200 chars = ~25-30 segundos de áudio
- Tempo de geração: ~15-20 segundos (bem dentro do limite de 60s)

### Polling vs WebSocket

Usaremos polling simples (a cada 2 segundos) no admin para verificar status, já que:
- Geração é processo demorado (segundos)
- Não precisa de latência ultra-baixa
- Mais simples de implementar

