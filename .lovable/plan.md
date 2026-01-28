
# Plano: Sistema de Meditações Guiadas com Voz da AURA

## Visão Geral

Criar uma biblioteca de meditações guiadas pré-gravadas com a voz da AURA (usando a mesma voz Erinome do Google Cloud TTS), que podem ser enviadas automaticamente ou sob demanda durante as conversas. A AURA saberá quando e qual meditação oferecer com base no contexto emocional do usuário.

---

## Arquitetura Proposta

```text
┌─────────────────────────────────────────────────────────────────┐
│                    BIBLIOTECA DE MEDITAÇÕES                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  meditations │    │  meditation  │    │   Storage    │       │
│  │   (tabela)   │───▶│   _audios    │───▶│   Bucket     │       │
│  │              │    │  (tabela)    │    │ (mp3 files)  │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                                       ▲               │
│         │                                       │               │
│         ▼                                       │               │
│  ┌──────────────────────────────────────────────┴──────────┐    │
│  │              generate-meditation-audio                   │    │
│  │        (Edge Function - gera áudio via TTS)              │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         ENTREGA                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────┐                    ┌──────────────────┐     │
│  │  aura-agent    │──── detecta ─────▶│  send-meditation │     │
│  │   (conversa)   │    contexto       │  (Edge Function) │     │
│  └────────────────┘                    └────────┬─────────┘     │
│         │                                       │               │
│         │  [MEDITACAO:ansiedade]                ▼               │
│         │                              ┌──────────────────┐     │
│         └─────────────────────────────▶│     Z-API        │     │
│                                        │  (envia áudio)   │     │
│                                        └──────────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Componentes

### 1. Banco de Dados

**Tabela `meditations`** - Catálogo de meditações

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | text (PK) | Ex: "med-ansiedade-5min" |
| title | text | "Acalmando a Ansiedade" |
| description | text | Descrição curta |
| category | text | ansiedade, sono, estresse, foco, gratidao, respiracao |
| duration_seconds | int | Duração em segundos |
| script | text | Texto completo da meditação (para gerar áudio) |
| triggers | text[] | Palavras-chave que ativam sugestão |
| best_for | text | Descrição do momento ideal |
| is_active | boolean | Ativa/inativa |

**Tabela `meditation_audios`** - Áudios gerados

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid (PK) | ID único |
| meditation_id | text (FK) | Referência à meditação |
| storage_path | text | Caminho no bucket |
| public_url | text | URL pública do áudio |
| duration_seconds | int | Duração real |
| generated_at | timestamp | Data de geração |

**Tabela `user_meditation_history`** - Histórico por usuário

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid (PK) | ID único |
| user_id | uuid (FK) | Usuário |
| meditation_id | text (FK) | Meditação |
| sent_at | timestamp | Quando foi enviada |
| context | text | Contexto da conversa |

### 2. Storage Bucket

- **Nome**: `meditations`
- **Tipo**: Público (para URLs diretas)
- **Estrutura**: `/{meditation_id}/audio.mp3`

### 3. Edge Functions

**`generate-meditation-audio`** - Gera áudios das meditações
- Lê o script da meditação
- Chama Google Cloud TTS com voz Erinome
- Salva MP3 no Storage
- Atualiza meditation_audios com URL pública

**`send-meditation`** - Envia meditação ao usuário
- Recebe meditation_id e user_id
- Busca URL do áudio
- Envia via Z-API (sendAudioMessage com URL)
- Registra no histórico

### 4. Integração com AURA Agent

Adicionar ao prompt do agente:

```text
# MEDITAÇÕES GUIADAS

Você tem acesso a uma biblioteca de meditações guiadas com SUA VOZ.
São áudios pré-gravados para momentos específicos.

## QUANDO OFERECER MEDITAÇÃO:
- Usuário em crise de ansiedade → ofereça meditação de respiração
- Usuário com insônia/dificuldade de dormir → ofereça meditação de sono
- Usuário estressado/sobrecarregado → ofereça meditação de acalmar
- Usuário pedindo explicitamente → envie a mais adequada
- Início ou fim de sessão especial → ofereça como recurso

## COMO ENVIAR:
Use a tag [MEDITACAO:categoria] onde categoria pode ser:
- respiracao (exercício de respiração guiada, 3-5 min)
- ansiedade (meditação para acalmar ansiedade, 5-8 min)
- sono (meditação para dormir, 10-15 min)
- estresse (relaxamento muscular progressivo, 7-10 min)
- gratidao (meditação de gratidão, 5 min)
- foco (meditação para concentração, 5 min)

## EXEMPLOS:
- "Tenho uma meditação de respiração guiada que pode te ajudar agora. Quer que eu mande? [MEDITACAO:respiracao]"
- "Antes de dormir, que tal fazer uma meditação comigo? [MEDITACAO:sono]"

## REGRAS:
- NÃO envie meditação sem contexto ou sem oferecer antes
- Máximo 1 meditação por conversa (para não saturar)
- Se o usuário não quiser, respeite
- Lembre das meditações já enviadas (evitar repetição)
```

---

## Catálogo Inicial de Meditações

### Categoria: Respiração (3-5 min)
1. **Respiração 4-7-8** - Técnica clássica para acalmar
2. **Respiração Consciente** - Foco na respiração natural
3. **Box Breathing** - Técnica de controle

### Categoria: Ansiedade (5-8 min)
1. **Acalmando a Tempestade** - Para momentos de crise
2. **Grounding 5-4-3-2-1** - Técnica de ancoragem
3. **Soltando as Preocupações** - Visualização guiada

### Categoria: Sono (10-15 min)
1. **Relaxamento para Dormir** - Body scan suave
2. **Contagem Regressiva** - Indução ao sono
3. **Noite Tranquila** - Visualização calmante

### Categoria: Estresse (7-10 min)
1. **Relaxamento Muscular** - Progressivo
2. **Liberando a Tensão** - Foco em áreas de tensão
3. **Pausa no Caos** - Minutos de calma

### Categoria: Foco (5 min)
1. **Clareza Mental** - Limpando a mente
2. **Preparação para Tarefa** - Antes de trabalho

### Categoria: Gratidão (5 min)
1. **Olhar de Gratidão** - Reflexão guiada
2. **Celebrando o Dia** - Para fim de dia

---

## Fluxo de Uso

### Cenário 1: Detecção automática
```text
Usuário: "To com muito ansiedade, não consigo parar de pensar"
AURA: "Respira fundo comigo... Eu sei que tá difícil agora. 
       Tenho uma meditação de respiração que pode te ajudar. 
       São só 5 minutinhos. Quer que eu mande? [MEDITACAO:respiracao]"

Sistema detecta [MEDITACAO:respiracao]:
1. Busca meditação da categoria
2. Obtém URL do áudio
3. Envia via Z-API como mensagem de voz
4. Registra no histórico do usuário
```

### Cenário 2: Pedido direto
```text
Usuário: "Tem alguma meditação pra me ajudar a dormir?"
AURA: "Tenho sim! 💜 Vou te mandar uma meditação de 10 minutos 
       que vai te embalar pro sono... [MEDITACAO:sono]"
```

### Cenário 3: Oferta após sessão
```text
AURA: "Que sessão incrível! Antes de ir, quero te deixar um presente:
       uma meditação de gratidão pra você fazer quando quiser. 
       Te mando? [MEDITACAO:gratidao]"
```

---

## Detalhes Técnicos

### Geração de Áudio
- Usar a mesma voz Erinome do aura-tts
- Speaking rate mais lento (0.9) para meditações
- Adicionar pausas naturais no script com "..."
- Formatar em MP3 44100Hz 128kbps
- Limite de 2000 caracteres por chamada TTS (dividir scripts longos)

### Envio via WhatsApp
```typescript
// send-meditation edge function
const { data: meditation } = await supabase
  .from('meditation_audios')
  .select('public_url')
  .eq('meditation_id', meditationId)
  .single();

await sendAudioFromUrl(phone, meditation.public_url);
```

### Z-API: Envio de áudio por URL
```typescript
// zapi-client.ts - nova função
export async function sendAudioFromUrl(phone: string, audioUrl: string): Promise<SendAudioResult> {
  const config = getZapiConfig();
  const response = await fetch(buildZapiUrl(config, 'send-audio'), {
    method: 'POST',
    headers: buildZapiHeaders(config),
    body: JSON.stringify({
      phone: cleanPhoneNumber(phone),
      audio: audioUrl, // Z-API aceita URL direta
      waveform: true,
    }),
  });
  // ...
}
```

---

## Fases de Implementação

### Fase 1: Infraestrutura
1. Criar tabelas no banco (meditations, meditation_audios, user_meditation_history)
2. Criar bucket de storage público
3. Criar edge function generate-meditation-audio
4. Criar edge function send-meditation
5. Adicionar função sendAudioFromUrl no zapi-client

### Fase 2: Conteúdo Inicial
1. Escrever scripts de 6 meditações iniciais:
   - 1x Respiração (5 min)
   - 1x Ansiedade (7 min)
   - 1x Sono (10 min)
   - 1x Estresse (8 min)
   - 1x Foco (5 min)
   - 1x Gratidão (5 min)
2. Gerar áudios via edge function
3. Testar URLs e qualidade

### Fase 3: Integração com AURA
1. Atualizar prompt do aura-agent com instruções de meditação
2. Adicionar detecção de tag [MEDITACAO:x] no processamento
3. Implementar lógica de seleção de meditação adequada
4. Adicionar histórico para evitar repetição

### Fase 4: Refinamento
1. Adicionar mais meditações por categoria
2. Implementar preferências do usuário (salvando insights)
3. Métricas de uso (quais meditações são mais populares)
4. Feedback pós-meditação ("Como você está se sentindo agora?")

---

## Diferencial Competitivo

| App | Meditações | Voz | Personalização |
|-----|------------|-----|----------------|
| Calm | ✅ 100+ | Narradores diversos | ❌ Genérica |
| Headspace | ✅ 100+ | Narradores | ❌ Genérica |
| AURA | ✅ 20+ | Voz da própria AURA | ✅ Contextual + Relacional |

**Diferencial AURA**: A meditação vem da mesma "amiga" que você conversa. Não é um narrador aleatório. É a AURA, que sabe o que você está passando, oferecendo no momento certo.

---

## Estimativa de Esforço

- Fase 1 (Infraestrutura): ~2-3 horas de desenvolvimento
- Fase 2 (Conteúdo): ~4-6 horas (escrita + geração + testes)
- Fase 3 (Integração): ~2-3 horas
- Fase 4 (Refinamento): Contínuo

**Total inicial**: ~8-12 horas para MVP funcional com 6 meditações
