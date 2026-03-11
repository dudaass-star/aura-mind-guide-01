

# Adicionar parágrafo de empurrão final ao FinalCTA

## Alteração

No `src/components/FinalCTA.tsx`, adicionar um parágrafo entre o subtítulo atual ("5 conversas grátis...") e o botão "Experimentar Grátis".

**Texto:**
> "Você pode continuar tentando resolver tudo sozinho, remoendo os mesmos pensamentos amanhã. Ou pode dar 5 minutos de atenção para si mesmo agora. É grátis, não pede cartão e, no mínimo, você vai dormir sabendo que alguém realmente te ouviu hoje."

## Implementação

**Arquivo:** `src/components/FinalCTA.tsx`

Após o `<p>` existente (linha ~22, "5 conversas grátis..."), inserir um novo `<p>` com estilo diferenciado (texto menor, itálico ou cor levemente diferente) para criar contraste visual com o subtítulo principal:

```tsx
<p className="font-body text-base text-muted-foreground/80 mb-8 leading-relaxed italic max-w-2xl mx-auto">
  Você pode continuar tentando resolver tudo sozinho, remoendo os mesmos pensamentos amanhã. 
  Ou pode dar 5 minutos de atenção para si mesmo agora. É grátis, não pede cartão e, no mínimo, 
  você vai dormir sabendo que alguém realmente te ouviu hoje.
</p>
```

Nenhuma outra alteração necessária.

