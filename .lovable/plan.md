

# Diagnóstico: Link do episódio abrindo 404

## Causa raiz

O 404 acontece porque a rota `/episodio/:id` existe no código mas **o frontend ainda não foi publicado** com essa mudança. O app publicado em `aura-mind-guide-01.lovable.app` está numa versão anterior que não contém a rota `/episodio/:id` — então o catch-all `*` captura e mostra a página NotFound.

Mudanças de backend (edge functions) deployam automaticamente, mas mudanças de frontend precisam de clique manual em **Publish → Update**.

## Sobre "não parecia uma página da Aura"

A página `Episode.tsx` usa classes genéricas do Tailwind (`bg-background`, `text-foreground`, `text-accent`) sem branding visual da Aura (logo, cores roxas, identidade). Para o usuário que recebe o link, parece uma página qualquer.

## Plano de correção

### 1. Publicar o frontend
Clicar em **Publish → Update** para que a rota `/episodio/:id` fique acessível no domínio publicado.

### 2. Melhorar a identidade visual da página Episode
Ajustar `src/pages/Episode.tsx` para incluir:
- Logo da Aura no topo (ou pelo menos o nome "Aura" com a cor roxa da marca)
- Cores consistentes com o site principal (roxo `#9b87f5` como accent)
- Um rodapé com link para o site da Aura (`olaaura.com.br`)
- Design mobile-first (a maioria vem do WhatsApp no celular)

### 3. Re-testar o fluxo completo
Após publicar, resetar `current_episode` e disparar novamente para validar: short link → redirect → página com conteúdo renderizado e branding correto.

## Detalhes técnicos
- Rota já existe em `App.tsx` linha 54: `<Route path="/episodio/:id" element={<Episode />} />`
- Edge functions (`redirect-link`, `create-short-link`, `generate-episode-manifesto`) estão funcionando corretamente nos logs
- O redirect apontou para `https://aura-mind-guide-01.lovable.app/episodio/d8...` — URL correta, mas o frontend publicado não reconhece a rota

