

## Substituir CTA do WhatsApp por CTA de conversão

O CTA final do guia atualmente tem "Abrir WhatsApp", que não faz sentido para leads que ainda não são clientes.

### Mudança

Substituir a seção CTA (linhas 401-421) por um CTA direcionado à conversão:
- Título: "Quer experimentar tudo isso?"
- Subtítulo: "5 conversas grátis. Sem cartão. Sem compromisso."
- Botão: "Começar Grátis" com `Link to="/experimentar"` (mesmo padrão do Hero e FinalCTA)
- Usar `variant="sage"` no botão (consistente com o resto do site)

### Arquivo
- `src/pages/UserGuide.tsx` — substituir seção CTA final

