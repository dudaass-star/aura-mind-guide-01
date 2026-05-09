## Objetivo

Substituir a seção **"Conversas reais"** da V2 (4 cenas estáticas em `ConversationShowcase.tsx`) por uma versão da **demo animada** da home padrão (`Demo.tsx`) — a conversa que se monta sozinha dentro do mockup de celular, com indicador "digitando…", áudio do WhatsApp no final e botão de "Ver novamente".

A lógica e o conteúdo da conversa permanecem iguais aos da home padrão. Só o visual é adaptado pra estética minimalista/cinematográfica da V2.

---

## Mudanças

### 1. Criar `src/components/v2/DemoV2.tsx`

Cópia funcional do `Demo.tsx` da home padrão, com os seguintes ajustes visuais:

- **Mesma conversa, mesma lógica**: array `messages`, `TypingIndicator`, `WhatsAppVoiceMessage`, cálculos de delay (`calculateTypingDelay`, `humanizeDelay`), auto-scroll, estados (`isPlaying`, `visibleMessages`, `isTyping`, `isAudioPlaying`, `isComplete`) e botões "Ver conversa completa" / "Ver novamente" — tudo idêntico.
- **Wrapper da seção**: trocar o gradiente verde da home por `bg-background` + glow sutil (`v2-glow-sage`) no canto, igual ao padrão das outras seções V2.
- **Header da seção**: adotar tipografia V2.
  - Eyebrow: `text-sm uppercase tracking-[0.25em] text-primary/80` → "veja na prática"
  - Título: `font-display text-3xl md:text-5xl font-medium leading-[1.15] tracking-tight` → "Como é conversar com a <span class='text-gradient-sage'>Aura</span>"
  - Subtítulo opcional, mais curto e em `text-muted-foreground`.
- **Mockup do celular**: manter estrutura, mas usar tokens da V2 (`bg-card`, `border-border/60`, `shadow-[0_0_60px_hsl(var(--primary)/0.12)]`) e cantos `rounded-[3rem]`. Sem `shadow-glow` específico da home.
- **Bolhas**: aplicar o mesmo estilo das bolhas atuais da V2 (`rounded-3xl`, `bg-secondary` para usuário, `bg-card border border-border/60` para Aura) — mas mantendo as caudas `rounded-br-md` / `rounded-bl-md` que indicam direção.
- **CTA dentro do mockup**: usar `Button` com `variant="sage"` (mesmo padrão da V2).

### 2. Substituir no `src/pages/IndexV2.tsx`

- Remover import e uso de `ConversationShowcase`.
- Importar e usar `DemoV2` no mesmo lugar (entre `EmotionalMirror` e `TransformationsV2`).

### 3. Apagar `src/components/v2/ConversationShowcase.tsx`

Não é mais usado em nenhum outro lugar.

---

## Detalhes técnicos

- O áudio do final continua apontando pra mesma URL pública do Supabase Storage (`meditations/demo/aura-voice.mp3`).
- Avatar reutilizado de `@/assets/avatar-aura.jpg`.
- Nenhuma mudança em rotas, GA4, tracking, ou na home padrão (`Demo.tsx` continua intacto).
- Sem alteração de dependências.

## Fora de escopo

- Não mexer no header/footer/preços/FAQ da V2.
- Não alterar o conteúdo da conversa (mesmo roteiro da home padrão).
