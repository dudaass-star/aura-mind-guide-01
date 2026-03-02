

# Correcao: Criar profile para o admin antes de rodar testes

## Problema

O usuario admin (`d2d4526a-0094-4e26-a435-429ed074b102`) tem conta de autenticacao e role admin, mas nao tem registro na tabela `profiles`. A funcao `run-system-tests` encontra o admin via `user_roles`, mas falha ao buscar o profile correspondente.

## Solucao

Duas mudancas:

### 1. Inserir profile para o admin
Usar o insert tool para criar o registro na tabela `profiles` com os dados minimos necessarios:
- `user_id`: `d2d4526a-0094-4e26-a435-429ed074b102`
- `name`: `Admin`
- `phone`: `test-admin` (necessario para testes que usam phone)
- `status`: `active`

### 2. Tornar `run-system-tests` mais resiliente
Modificar a funcao para que, se o profile nao existir, ela crie um profile temporario automaticamente para o usuario de teste, em vez de retornar erro 400. Isso evita que o teste falhe por falta de dados pre-existentes.

- Na secao que verifica `testProfile`, se nao encontrar, inserir um profile basico com `name: 'Test User'`, `status: 'active'`, `phone: 'test-simulation'`
- Marcar para deletar esse profile ao final dos testes (cleanup)

