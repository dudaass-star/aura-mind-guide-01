

## Diagnóstico: Por que Meta mostra 6 Purchase em vez de 3

### Causa raiz

O Meta Pixel tem o recurso **"Eventos Automáticos" (Automatic Events)** ativado. Ele detecta automaticamente eventos de compra na página `/obrigado` baseado no conteúdo da página (palavras como "assinatura confirmada", "plano", "parabéns"). Isso gera **3 eventos de Purchase do browser** que não existem no seu código.

**Evidências:**
- Banco de dados: exatamente 3 `checkout.session.completed` hoje
- Código: `ThankYou.tsx` NÃO envia `fbq('track', 'Purchase')` — confirmado
- Meta Events Manager mostra: 3 browser + 6 servidor (inflado pela falta de deduplicação)
- Desduplicação: "Não atende às melhores práticas" — porque os eventos automáticos do browser não têm o mesmo `event_id` que os do CAPI

### Solução (2 passos)

**Passo 1 — Desativar Eventos Automáticos no Meta (ação no dashboard do Meta)**
1. Acesse **Meta Events Manager** → Selecione o Pixel `939366085297921`
2. Vá em **Configurações** → **Eventos Automáticos**
3. **Desative** a detecção automática de eventos de compra

Isso elimina os 3 eventos fantasma do browser imediatamente.

**Passo 2 — Adicionar `event_id` no PageView da página de obrigado (mudança de código, segurança extra)**

Mesmo após desativar Automatic Events, vamos adicionar uma camada extra de proteção: impedir que o Meta Pixel faça qualquer tracking na página `/obrigado` além do PageView básico.

Arquivo: `src/pages/ThankYou.tsx`
- Adicionar um `useEffect` que desativa o tracking automático do pixel nessa página específica via `fbq('dataProcessingOptions', ['LDU'], 0, 0)` ou simplesmente garantindo que nenhum evento de conversão seja detectado.

**Alternativa mais robusta:** Modificar o `index.html` para NÃO carregar o Meta Pixel na rota `/obrigado`, usando um check de rota antes do `fbq('track', 'PageView')`.

### Resultado esperado
- Meta recebe **apenas** os 3 Purchase do CAPI (server-side)
- Zero eventos de Purchase do browser
- Desduplicação deixa de ser problema (apenas uma fonte)
- Contagem no Meta Ads = contagem real no banco de dados

