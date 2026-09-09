# Painel de recuperação: separar quem voltou pela recuperação de quem já tinha voltado sozinho

## O que os dados mostram

Consultei o banco no recorte exato da tabela (checkouts abandonados com algum registro de recuperação):

- 894 linhas no total, 111 marcadas hoje como **Converteu**.
- Dessas 111, **72 pagaram ANTES do primeiro e-mail de recuperação sair**. Ou seja: voltaram sozinhas, dentro da primeira hora, e o painel está creditando a recuperação.
- Apenas **43 pagaram depois de algum contato de recuperação** (e-mail ou WhatsApp).
- A regra atual do badge é só "pagou depois de abandonar" — ela não olha se algum contato já havia saído.
- Isso também explica o "—" na coluna WhatsApp: quem paga rápido nunca chega no estágio de 15min, então nada foi enviado, mas a linha aparece verde.
- Em 62 linhas (40 delas marcadas como Converteu) não existe registro de tentativa de e-mail, e é por isso que a coluna "Envio e-mail" mostra **Legado** — o badge depende do log de tentativa e não das datas de envio já gravadas na própria sessão.

## O que muda no painel

Na tabela "Recuperação de Checkout Abandonado" (`src/pages/AdminEngagement.tsx`):

1. **Coluna "Resultado" passa a dizer o porquê**, com quatro estados:
   - `Voltou sozinha` (cinza/azul): pagou antes de qualquer contato sair — não conta como recuperação.
   - `Recuperada · WhatsApp` (verde): pagou depois do envio de 15min/24h e antes/independente do e-mail.
   - `Recuperada · E-mail 1/3, 2/3, 3/3` (verde): pagou depois do estágio de e-mail correspondente.
   - `Não voltou` (como hoje).
   Quando os dois canais precederam o pagamento, atribuo ao contato **mais recente** antes do pagamento e mostro o outro canal no tooltip.
2. **Cabeçalho do card**: o número "converteram" passa a ser dividido em `recuperadas` (pós-contato) e `voltaram sozinhas`, com a data-base explícita, para o número de recuperação parar de estar inflado.
3. **Card de métrica do WhatsApp** já usa a regra correta (pagou depois do primeiro envio); vou apenas rotular como "recuperadas pelo WhatsApp" para deixar claro que é diferente do total da tabela.
4. **Coluna "Envio e-mail"**: quando não houver registro de tentativa, usar as datas `recovery_stage1/2/3_sent_at` da própria sessão para mostrar `1/3`, `2/3`, `3/3`. "Legado" fica apenas para linhas realmente sem data nenhuma.

## Detalhes técnicos

- Arquivo único: `src/pages/AdminEngagement.tsx`. Sem migração, sem edge function, sem redeploy.
- Em `fetchRecoverySessions`, trocar o booleano `converted` por `{ paidAt, attributedTo: 'organic' | 'whatsapp' | 'email', stage }`, calculado comparando `paidAt` com `recovery_stage{1,2,3}_sent_at` e `whatsapp_recovery_{15min,24h}_sent_at`.
- Colunas já vêm no `select` atual; nenhuma consulta nova é necessária além das que já existem.
