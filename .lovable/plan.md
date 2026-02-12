

## Seção de Meditações Guiadas (versão genérica)

### Abordagem

Em vez de listar as 6 meditações individualmente, criar uma seção mais geral que destaque o conceito: a AURA detecta o momento certo e envia uma meditação guiada personalizada direto no WhatsApp, com a voz dela. Assim, conforme novas meditações forem adicionadas, a página não precisa ser atualizada.

### Estrutura visual

- Badge: "Novo" (estilo sage-soft)
- Título: "Meditações guiadas no momento certo" com gradient
- Subtítulo: Explica que a AURA percebe quando você precisa e envia direto no WhatsApp
- 3 cards destacando os diferenciais:
  1. **Momento certo** — A AURA identifica quando você precisa e oferece sem você pedir
  2. **Voz da AURA** — Áudios com a voz que você já conhece da conversa
  3. **Direto no WhatsApp** — Sem precisar abrir outro app, ouve ali mesmo
- Frase de reforço embaixo: algo como "Ansiedade, sono, foco, estresse... a AURA escolhe a meditação certa pra você"

### Posicionamento

Entre **Benefits** e **Testimonials** no Index.tsx.

### Detalhes técnicos

**Arquivo novo:**
- `src/components/Meditations.tsx` — componente com 3 cards de diferenciais, seguindo o padrão visual existente (rounded cards, ícones Lucide, cores sage/lavender/sky)

**Arquivo modificado:**
- `src/pages/Index.tsx` — importar e adicionar `<Meditations />` entre `<Benefits />` e `<Testimonials />`

