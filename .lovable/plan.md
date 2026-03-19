

# Correção do Contador: Apenas mensagens `role='user'`

## Confirmação

Sim, faz total sentido. Cada mensagem do usuário (`role='user'`) equivale a uma chamada ao modelo da Aura. Contar todas as mensagens infla o número porque a Aura divide respostas em múltiplas mensagens (`role='assistant'`). O que importa operacionalmente e para análise de custo é o número de **entradas** (inputs do usuário).

## Correção

No `supabase/functions/admin-messages/index.ts`, adicionar `.eq('role', 'user')` nas duas queries de contagem:

- **totalCount** (linha ~71): total all-time de mensagens do usuário
- **monthCount** (linha ~76): total do mês de mensagens do usuário

Nenhuma outra mudança necessária. O frontend já exibe esses números corretamente.

## Arquivo alterado

- `supabase/functions/admin-messages/index.ts` — 2 linhas adicionadas

