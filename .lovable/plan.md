

# Plano: Ajustar Delays da Demo para Parecer Humano

## Configuracao Real da AURA (Referencia)

Analisei o codigo real da AURA em `webhook-zapi/index.ts` e as memorias de configuracao. Eis as regras de timing:

### Typing Delay (proporcional ao tamanho)
- Mensagens curtas (< 50 chars): 1-2 segundos
- Mensagens medias (< 100 chars): 2-3 segundos
- Mensagens longas (100+ chars): 3-6 segundos
- Formula: `length / 30` para curtas, `length / 40` para medias, `length / 35` para longas

### Delay Entre Bubbles
- Delay base entre bubbles da mesma sequencia: 500-800ms
- Randomizacao de ±20% para parecer natural
- Delay apos resposta da usuaria antes da AURA comecar: 1.5-3.5s

## Problema Atual

A Demo usa delays fixos e muito curtos:
- Bubbles consecutivos: 300-500ms (muito rapido, parece maquina)
- Sem randomizacao realista
- Typing delay nao reflete o tamanho da mensagem

## Alteracoes Propostas

### Arquivo: `src/components/Demo.tsx`

**Nova logica de delays baseada na AURA real:**

1. **Typing delay proporcional ao tamanho:**
   ```text
   if (length < 50)  -> 1000 + (length * 30)  // 1-2.5s
   if (length < 100) -> 1500 + (length * 25)  // 1.5-4s  
   else              -> 2000 + (length * 20)  // 2-5s (cap at 5s)
   ```

2. **Delay entre bubbles consecutivos (mais humano):**
   - Base: 600-900ms (em vez de 300-500ms)
   - Randomizacao: ±20%
   - Formula: `baseDelay * (0.8 + Math.random() * 0.4)`

3. **Delay antes da AURA comecar a responder:**
   - Delay inicial: 1200-2000ms antes de mostrar "digitando..."
   - Simula a AURA "lendo" a mensagem da usuaria

4. **Delay para mensagens da usuaria:**
   - Maior intervalo: 1500-2500ms (tempo de "leitura")
   - Simula a transicao natural entre quem fala

## Comparacao Visual

```text
ATUAL (muito rapido):
[User msg] -> 800ms -> [AURA digitando] -> 1.5s -> [Bubble 1] -> 300ms -> [Bubble 2] -> 350ms -> [Bubble 3]

PROPOSTO (mais humano):
[User msg] -> 1.5s -> [pause lendo] -> 1.5s -> [AURA digitando] -> 2s -> [Bubble 1] -> 700ms -> [Bubble 2] -> 650ms -> [Bubble 3]
```

## Resumo das Alteracoes

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/Demo.tsx` | Ajustar funcao de calculo de delays para usar regras reais da AURA: typing proporcional ao tamanho, delays maiores entre bubbles consecutivos (600-900ms com ±20%), delay inicial de "leitura" antes do "digitando..." |

## Resultado Esperado

Os delays vao parecer muito mais naturais e humanos:
- A AURA vai "ler" a mensagem antes de comecar a digitar
- O indicador "digitando" vai durar proporcionalmente ao tamanho da mensagem
- Os bubbles vao aparecer com ritmo mais natural (nem muito rapido, nem muito lento)
- A randomizacao vai evitar que pareca mecanico

