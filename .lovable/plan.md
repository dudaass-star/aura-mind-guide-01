

# Adicionar evento Meta Pixel na página de trial

## Situação atual
- `PageView` dispara automaticamente em todas as páginas
- `Lead` dispara apenas quando o formulário é **enviado**
- Não há evento específico quando o usuário **chega** na página `/experimentar`

## Proposta
Adicionar `fbq('track', 'ViewContent')` no `useEffect` de `StartTrial.tsx` para rastrear quando alguém acessa a página do trial. Isso permite medir a taxa de conversão entre quem visita a página e quem preenche o formulário.

## Mudança
- **`src/pages/StartTrial.tsx`** — adicionar `useEffect` com `fbq('track', 'ViewContent', { content_name: 'Trial Page' })` no carregamento da página

