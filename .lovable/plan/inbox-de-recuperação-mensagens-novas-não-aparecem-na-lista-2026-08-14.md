# Inbox de Recuperação: mensagens novas não aparecem na lista

## Diagnóstico (confirmado com dados)

Os envios estão acontecendo e sendo gravados normalmente. O último disparo foi hoje às **16:50 BRT** (template 15min para Vanessa, `+55 11 96615-5000`), com resposta dela e retorno registrado — tudo presente no banco.

O problema é na **lista do inbox**, não no envio: a consulta busca as conversas com um teto de 200 registros **sem ordenação no servidor**. O banco devolve 200 linhas em ordem arbitrária e só depois a tela ordena por data. Como já existem mais de 200 conversas, as mais recentes ficam fora do lote e simplesmente desaparecem da lista — exatamente o sintoma da tela (o topo mostra um envio de 8 horas atrás e o de 40 minutos não aparece).

## Correção

Ordenar no servidor antes de cortar, na busca de conversas do inbox:

- Passar a ordenar por atividade mais recente direto na consulta (coluna de atualização da conversa, decrescente) e só então aplicar o limite.
- Manter a ordenação local por último inbound/outbound como desempate visual.
- Elevar o teto de 200 para 400 conversas, para dar folga conforme o volume cresce.

## Detalhes técnicos

- Arquivo: `src/components/admin/RecoveryInbox.tsx`, função `fetchList`.
- Trocar `.select('*').limit(200)` por `.select('*').order('updated_at', { ascending: false }).limit(400)`.
- Nada muda no fluxo de envio (`recover-abandoned-checkout-whatsapp`), nos templates aprovados nem no webhook de entrada — é ajuste apenas de leitura/exibição.
