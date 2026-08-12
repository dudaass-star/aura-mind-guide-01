# PIX Automático: composição validada e blindagem por banco

## O que as duas telas provam

- **Banco do Brasil**: mostra exatamente o desenho pretendido — "1º pagamento: R$ 6,90 hoje" + "Pix Automático: valor previsto R$ 29,90, próximo pagamento 12/09/2026, mensal". Ou seja, o QR composto (cobrança de entrada + mandato fixo) está correto.
- **Nubank**: na tela de revisão exibe apenas a autorização mensal de R$ 29,90 (valor fixo, dia 12, até cancelar). A entrada de R$ 6,90 não aparece nessa etapa.

Então sim: **cada banco renderiza o Pix Automático de um jeito**. Alguns detalham as duas partes na mesma tela, outros só mostram o mandato e tratam a cobrança de entrada em outro passo. Isso é do app do banco, não do nosso payload.

## Consequência prática

O que não podemos assumir é que todo banco efetivamente liquida a entrada de R$ 6,90 no mesmo scan. Nos testes atuais o mandato aparece ativo, mas não há registro de cobrança de entrada liquidada. O plano abaixo mantém o scan único e garante que a entrada nunca fique órfã, independente do banco.

## Plano

### 1. Instrumentar por banco (observabilidade primeiro)
- Registrar, para cada tentativa: modo de criação, se o mandato foi autorizado, se a entrada foi paga, e qual PSP/banco pagador o webhook informou.
- Assim passamos a saber quais bancos cobram a entrada no scan único e quais não.

### 2. Reconciliação da entrada (rede de segurança)
- Se o mandato for autorizado e a entrada de R$ 6,90 não constar paga em poucos minutos, tratar como pendência: reenviar o QR de R$ 6,90 pelo WhatsApp e não liberar acesso sem pagamento confirmado.
- Se a entrada for paga e o mandato não for autorizado, liberar a primeira semana e pedir a autorização por mensagem, sem gerar cobrança duplicada.
- Nada de cobrança nem mandato órfão em caso de falha parcial.

### 3. Copy do checkout à prova de banco
No checkout PIX:
- Título com os dois valores: "R$ 6,90 hoje • depois R$ 29,90/mês, cancela quando quiser".
- Aviso curto: "Alguns bancos mostram só a autorização de R$ 29,90/mês na tela de revisão. A cobrança de hoje é de R$ 6,90."
- Data da primeira cobrança cheia visível.

### 4. Teste financeiro real nos dois bancos
- Concluir um pagamento pelo BB e um pelo Nubank com QRs novos.
- Em cada um, verificar: entrada liquidada, mandato ativo, acesso liberado, próxima cobrança agendada.
- Só depois disso habilitar o trilho Woovi como opção padrão de PIX no checkout.

## Detalhes técnicos
- Mantém o compositor EMV (`_shared/pix-emv.ts`) e o payload de valor fixo (`_shared/woovi-subscription-payload.ts`) — ambos já validados.
- `webhook-woovi` passa a correlacionar explicitamente entrada e mandato e a aplicar as regras do item 2; a cobrança de entrada passa a ser persistida também em `woovi_charges` (hoje só existe o vínculo em `woovi_subscriptions.entry_charge_correlation_id`).
- Ajuste de interface isolado no checkout PIX; nenhum efeito no trilho de cartão (Stripe) nem no Inter (7 dias grátis).

## Critério de aceite
Um scan único em qualquer banco resulta em: R$ 6,90 pago, mandato mensal fixo de R$ 29,90 ativo e acesso liberado — e, quando o banco não cobra a entrada no mesmo passo, o sistema detecta e resolve automaticamente.
