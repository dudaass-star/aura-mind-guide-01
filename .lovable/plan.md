# Exportar transcrição das últimas 5 sessões

Gerar um arquivo de texto com a transcrição completa das 5 sessões concluídas mais recentes, para leitura e auditoria manual.

## Sessões que entram (já confirmadas no banco)

| # | Data (BRT) | Duração | Tema |
|---|---|---|---|
| 1 | 30/08 18:52–19:39 | 45 min | aceitação do fim e liberdade pessoal |
| 2 | 30/08 11:01–11:48 | 45 min | (sem tema) |
| 3 | 29/08 13:00–14:02 | 45 min | (sem tema) |
| 4 | 28/08 22:25–23:45 | 45 min | solidão no relacionamento |
| 5 | 28/08 19:52–20:50 | 45 min | medo de amar e autonomia |

## O que o arquivo terá

- Um bloco por sessão, com cabeçalho: número, tema, início/fim em BRT, duração e nome do usuário.
- Todas as mensagens trocadas dentro da janela da sessão, em ordem cronológica, com horário BRT e autor (USUÁRIO / AURA).
- Formato `.txt` simples, entregue como anexo no chat.

## Detalhes técnicos

- Consulta somente leitura: `sessions` (status `completed`, ordenado por `ended_at`, limite 5) + `messages` filtradas por `user_id` e `created_at` entre `started_at` e `ended_at`, com join em `profiles` para o nome.
- Nenhuma alteração de schema, código ou dados. O arquivo é gravado em `/mnt/documents`, fora do código do projeto.

## Ponto a confirmar

O arquivo incluirá o nome real do usuário em cada sessão. Se preferir anonimizado (ex.: "Usuário 1"), me avise antes que eu gero assim.
