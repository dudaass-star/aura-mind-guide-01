

# Remover/substituir emojis por icones Lucide

## Escopo

Encontrei emojis em **6 arquivos de paginas publicas** e **3 arquivos admin** (admin vou manter como esta, pois sao internos). Vou focar nos arquivos voltados ao usuario:

### Arquivos e substituicoes

| Arquivo | Emoji atual | Substituicao |
|---|---|---|
| `Demo.tsx` | `💬 Veja na prática` (badge) | Icone Lucide `MessageSquare` inline |
| `Demo.tsx` | `💡` dentro do conteudo de chat | Remover (texto natural sem emoji) |
| `Benefits.tsx` | `✨ Tudo isso` (badge) | Icone Lucide `Sparkles` inline |
| `Meditations.tsx` | `🆕 Novo` (badge) | Icone Lucide `Zap` ou `Star` inline |
| `Testimonials.tsx` | `❤️ Depoimentos Reais` (badge) | Icone Lucide `Heart` inline |
| `Comparison.tsx` | `⚠️` no disclaimer | Icone Lucide `AlertTriangle` inline |
| `Pricing.tsx` | `✓` nos trust badges | Icone Lucide `Check` inline |
| `TrialStarted.tsx` | `💜` no titulo | Remover |
| `UserGuide.tsx` | `💡`, `🔍`, `🔄`, `🧭`, `💬` (session types + headers) | Substituir por icones Lucide correspondentes (`Lightbulb`, `Search`, `RefreshCw`, `Compass`, `MessageCircle`) |

### Padrao de substituicao

Os badges de secao (ex: `❤️ Depoimentos Reais`) seguirao o padrao:
```text
Antes:  <span>❤️ Depoimentos Reais</span>
Depois: <span><Heart className="w-4 h-4 inline mr-1" /> Depoimentos Reais</span>
```

Emojis decorativos em texto serao simplesmente removidos.

### Arquivos NAO alterados
- `AdminTests.tsx`, `AdminInstances.tsx`, `AdminMeditations.tsx` — paineis internos, emojis sao uteis la
- `FAQ.tsx`, `ForWho.tsx`, `FinalCTA.tsx`, `Header.tsx` — nao tem emojis

