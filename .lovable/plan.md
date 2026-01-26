

## Mover Controles do Vídeo para Dentro da Tela

### Mudança Visual

**Antes:** Botões de volume e reiniciar aparecem abaixo do vídeo, centralizados.

**Depois:** Botões ficam sobrepostos ao vídeo, posicionados no canto inferior direito (ou inferior esquerdo), com um fundo semi-transparente para garantir visibilidade.

---

### Implementação

#### Arquivo: `src/components/Hero.tsx`

1. **Mover os controles para dentro do container do vídeo**
   - Retirar a `<div>` de controles de fora do container com `rounded-2xl`
   - Colocar dentro, com posicionamento absoluto

2. **Adicionar estilos de overlay**
   - `absolute bottom-3 right-3` para posicionar no canto inferior direito
   - Fundo com `bg-black/40 backdrop-blur-sm` para legibilidade
   - Bordas arredondadas e padding compacto

3. **Ajustar z-index**
   - Garantir que os controles fiquem acima do vídeo e do loading overlay

---

### Código Resultante (Estrutura)

```text
┌─────────────────────────────┐
│                             │
│         VÍDEO               │
│                             │
│                 ┌─────────┐ │
│                 │ 🔇  🔄  │ │  ← Controles no canto
│                 └─────────┘ │
└─────────────────────────────┘
```

---

### Detalhes Técnicos

| Aspecto | Valor |
|---------|-------|
| Posição | `absolute bottom-3 right-3` |
| Fundo | `bg-black/40 backdrop-blur-sm` |
| Container | `flex gap-2 rounded-full p-1` |
| Botões | Tamanho reduzido `p-2` com ícones `w-4 h-4` |
| Cores | Ícones brancos para contraste (`text-white`) |
| Hover | `hover:bg-white/20` |

O botão de reiniciar só aparece quando o vídeo termina (comportamento mantido).

