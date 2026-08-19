# Parar a enxurrada de e-mails "Run failed"

## O que está acontecendo
Os e-mails não são da Aura para clientes. São **notificações do GitHub** avisando que uma automação do repositório falhou: "Run failed: Deploy Edge Functions - main". Cada alteração enviada ao projeto dispara essa automação; ela falha e o GitHub manda um e-mail. Como houve várias alterações hoje, vieram vários e-mails (17:14, 17:07, 16:43...).

Nada disso afeta o app, os clientes ou os e-mails transacionais da Aura.

## Por que ela falha
Essa automação foi criada no passado para reimplantar algumas funções do backend manualmente. Hoje a Lovable já publica as funções automaticamente a cada alteração, então ela é redundante. Todas as funções que ela tenta publicar existem no projeto, então a falha vem da própria automação (credencial de acesso expirada é a causa mais provável) — o detalhe exato só aparece no log do GitHub.

## Proposta
Remover a automação redundante `Deploy Edge Functions` do repositório.

Efeitos:
- Os e-mails de falha param imediatamente.
- Nenhuma perda de funcionalidade: a publicação das funções continua acontecendo pela Lovable.

## Detalhes técnicos
- Excluir `.github/workflows/deploy-functions.yml`.
- Nenhum outro arquivo é alterado; nenhuma função é removida ou republicada.
- Alternativa, se você preferir manter o trilho de deploy paralelo: manter o arquivo, restringir o gatilho a `paths: supabase/functions/**` e renovar o segredo `SUPABASE_ACCESS_TOKEN` no GitHub. Isso reduz, mas não elimina, os e-mails enquanto a credencial não for renovada.
