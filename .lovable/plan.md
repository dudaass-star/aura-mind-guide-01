## Plano: Remover "Recursos" do rodapé V2

### Contexto
O link "Recursos" no rodapé da V2 aponta para `#recursos`, que na verdade é o id da grade de cards **dentro** da seção de Planos (`PricingV2.tsx`). Isso causa dois problemas:

1. Duplica o link "Planos" (ambos vão para o mesmo bloco).
2. Não existe uma seção independente chamada "Recursos" na landing V2.

### Seções ancoradas reais disponíveis na V2
- `#hero-section` (topo)
- `#como-funciona`
- `#depoimentos`
- `#precos` (Planos)
- `#faq`

Já temos no rodapé: Como funciona, Depoimentos, Planos, Blog. Falta apenas FAQ na coluna "AURA" — mas FAQ já aparece na coluna "Suporte" como "Perguntas frequentes".

### Decisão proposta
**Remover "Recursos"** da coluna "AURA" do rodapé sem substituto, deixando a coluna mais enxuta:
- Como funciona
- Depoimentos
- Planos
- Blog

### Alteração
- `src/components/v2/FooterV2.tsx`: remover a linha `<li><a href="#recursos">Recursos</a></li>`.

### Opcional
Se quiser manter 5 itens na coluna, posso adicionar **"Cancelar assinatura"** ou **"Acesso ao Portal"** no lugar — mas avisa antes que prefiro só remover, conforme você pediu.