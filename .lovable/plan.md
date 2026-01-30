
# Plano: Aumentar Delays da Demo para Ritmo Mais Natural

## Problema

Os delays atuais ainda estao rapidos demais. Vou aumentar significativamente todos os valores para criar um ritmo mais humano e contemplativo.

## Valores Atuais vs Propostos

| Tipo de Delay | Atual | Proposto |
|---------------|-------|----------|
| **Reading delay** (antes de "digitando") | 1.2-1.8s | **2.5-3.5s** |
| **Typing delay curto** (< 50 chars) | 1-2.5s | **2-4s** |
| **Typing delay medio** (< 100 chars) | 1.5-4s | **3-5s** |
| **Typing delay longo** (100+ chars) | 2-5s | **4-6s** |
| **Entre bubbles consecutivos** | 600-900ms | **1.2-1.8s** |
| **Mensagens da usuaria** | 1.6-2.4s | **2.5-3.5s** |

## Alteracoes no Arquivo

### `src/components/Demo.tsx`

**Funcao `calculateTypingDelay`:**
```text
Curtas (< 50 chars):  2000 + length * 40  → 2-4s
Medias (< 100 chars): 3000 + length * 25  → 3-5.5s  
Longas (100+ chars):  4000 + length * 20  → 4-6s (cap at 6s)
```

**Funcao `humanizeDelay`:** Manter ±20% (funciona bem)

**Delays especificos:**
- `readingDelay`: base 3000ms (era 1500ms) → 2.4-3.6s
- `bubbleDelay`: base 1500ms (era 750ms) → 1.2-1.8s  
- `userDelay`: base 3000ms (era 2000ms) → 2.4-3.6s

## Comparacao do Fluxo

```text
ATUAL (ainda rapido):
[User] → 1.6s → [lendo] → 1.5s → [digitando] → 2s → [Bubble1] → 0.7s → [Bubble2]

PROPOSTO (mais contemplativo):
[User] → 3s → [lendo] → 3s → [digitando] → 3.5s → [Bubble1] → 1.5s → [Bubble2]
```

## Resumo

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/Demo.tsx` | Dobrar todos os valores de delay: readingDelay 1500→3000ms, bubbleDelay 750→1500ms, userDelay 2000→3000ms, e aumentar formula do calculateTypingDelay |

## Resultado

O ritmo vai parecer muito mais natural:
- Pausa pensativa antes da AURA comecar a digitar
- Tempo de "digitacao" proporcional ao tamanho real da mensagem
- Bubbles consecutivos com respiro entre eles
- Transicoes suaves entre turnos de fala
