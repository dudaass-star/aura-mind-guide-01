## Objetivo
Adicionar métricas da recuperação por **WhatsApp** no card "Recuperação de Checkout Abandonado" do painel `/admin/engagement`. Hoje esse bloco só mostra a recuperação por **e-mail** (flag `recovery_sent` + tabela `checkout_recovery_attempts`).

## O que será mostrado

No mesmo card colapsável de Recuperação, abaixo da linha resumo de e-mail, adicionar uma segunda linha resumo de **WhatsApp**:

- **Estágio 1 (15min):** quantos disparos
- **Estágio 2 (24h):** quantos disparos
- **Usuários únicos** alcançados pelo WhatsApp
- **Converteram após WhatsApp** (sessão `completed` posterior ao envio, pelo telefone)
- **Falhas** (`whatsapp_recovery_last_error` preenchido)

E na tabela de sessões abandonadas, adicionar uma coluna **"WhatsApp"** com badges indicando os estágios enviados:
- `15min ✓` (verde) se `whatsapp_recovery_15min_sent_at` preenchido
- `24h ✓` (verde) se `whatsapp_recovery_24h_sent_at` preenchido
- `Erro` (vermelho, com tooltip) se `whatsapp_recovery_last_error` preenchido
- `—` se nenhum dos estágios foi enviado

## Implementação técnica

**Arquivo único:** `src/pages/AdminEngagement.tsx`

1. Em `fetchRecoverySessions()`:
   - Adicionar 3 counts em paralelo: 
     - `checkout_sessions` com `whatsapp_recovery_15min_sent_at IS NOT NULL`
     - `checkout_sessions` com `whatsapp_recovery_24h_sent_at IS NOT NULL`
     - `checkout_sessions` com `whatsapp_recovery_last_error IS NOT NULL`
   - Ampliar a query principal de sessões para incluir os 3 campos WhatsApp.
   - Mudar o filtro de `eq('recovery_sent', true)` para `.or('recovery_sent.eq.true,whatsapp_recovery_15min_sent_at.not.is.null')` — assim o painel passa a listar sessões recuperadas por qualquer canal, não só e-mail.
   - Calcular `wa_converted` adicional baseado no mesmo `completedPhones` que já existe.
   - Salvar em novo estado `whatsappStats: { stage1, stage2, errors, unique, converted }`.

2. Na UI do card:
   - Adicionar segunda linha de resumo em `CardHeader` com ícone do WhatsApp (lucide `MessageCircle`):
     `📱 WhatsApp: X em 15min · Y em 24h · Z únicos · N converteram · E erros`
   - Adicionar `<TableHead>WhatsApp</TableHead>` entre "Envio" e "Resultado"
   - Adicionar `<TableCell>` com badges dos estágios

3. Renomear o título do card de "Recuperação de Checkout Abandonado" para deixar claro que cobre os 2 canais (manter título, só ajustar subtítulo).

## Fora de escopo
- Não mexer em edge functions nem no fluxo de envio.
- Não criar nova tabela de tracking — usar os campos já existentes em `checkout_sessions`.
- Não alterar o painel admin de templates.
