# Julianne França: cancelamento pedido em maio nunca foi executado

## O que os dados mostram (verificado agora)

Cliente: Julianne Menezes Veríssimo de França — julianne.jmvf@gmail.com / 5581998550259.

- No nosso banco o perfil está **`active`, plano Essencial, `canceled_at` vazio**. Nunca foi marcado como cancelado.
- No provedor de cartão a assinatura **`sub_1TLFaF...` continua ativa**, sem `cancel_at_period_end`, com próxima renovação em **19/09/2026**.
- Histórico de cobranças de R$ 29,90 (dia 19 de cada mês): abril, maio, junho, julho, agosto — **todas pagas**.
- Único estorno existente é o de **maio (R$ 29,90)**, exatamente o que o suporte prometeu no e-mail de 22/05.
- Ou seja: o estorno foi feito, mas o cancelamento **não**. Junho, julho e agosto foram cobrados normalmente — **R$ 89,70 cobrados após o cancelamento confirmado**.
- Efeito colateral: como o perfil segue ativo, ela continua recebendo mensagens proativas da Aura (jornada EP 1 em 21/08, resumo mensal em 23 e 30/08, EP 2 em 01/09) — nunca respondeu nenhuma.
- O ticket dela (`Cancelamento`, categoria reembolso, severidade alta) segue em `pending_review` desde 05/05.

## Plano

### 1. Resolver o caso dela (hoje)
- Cancelar a assinatura de cartão imediatamente (cancelamento definitivo, não no fim do ciclo).
- Estornar **apenas o último pagamento** (19/08 — R$ 29,90). Junho e julho ficam como estão.
- Marcar o perfil como cancelado (`status`, `canceled_at`) para parar imediatamente as mensagens proativas da Aura.
- Fechar o ticket com resposta objetiva: cancelamento efetivado agora, estorno da última cobrança solicitado, prazo de até 5 dias úteis conforme o banco.

### 2. Descobrir por que o cancelamento de maio não saiu
- Levantar como o cancelamento foi tratado em maio: se houve chamada real ao cancelamento da assinatura, se o retorno foi erro engolido, ou se ninguém executou nada além do estorno.
- Isso define se o furo é de processo (o atendente estornou e não cancelou) ou de código (a função de cancelamento falhou em silêncio).

### 3. Fechar o furo
- **Estorno sempre acompanhado de decisão explícita sobre a assinatura**: um estorno com categoria de cancelamento não pode ser concluído sem que a assinatura esteja comprovadamente cancelada no provedor.
- **Verificação pós-cancelamento**: depois de cancelar, reconsultar a assinatura no provedor e só então gravar o perfil como cancelado; se a consulta não confirmar, o cancelamento não é considerado feito.
- **Perfil cancelado corta mensagens proativas**: garantir que nenhuma jornada, resumo mensal ou lembrete saia para quem pediu cancelamento.

## Detalhes técnicos
- Assinatura: `sub_1TLFaFQU15XnZ7VvgV80yvlg` (cliente `cus_UJtKNQEzqBxWVJ`), preço `price_1SuJYdQU15XnZ7VvCqhIQbDR` (R$ 29,90/mês).
- Cobrança a estornar: `ch_3U621NQU15XnZ7Vv1SZkiCLJ` (19/08, R$ 29,90). Já estornada anteriormente: `ch_3TYgAsQU15XnZ7Vv4jyoQlLt` (mai).
- Perfil `4bc5e432-3e56-4bdd-b0c9-31b1e09c483c`: atualizar `status`/`canceled_at` via migração ou pelo painel admin, que já chama `cancel-subscription`.
- Verificação pós-cancelamento e bloqueio de proativos em `cancel-subscription` + workers de jornada/resumo.
