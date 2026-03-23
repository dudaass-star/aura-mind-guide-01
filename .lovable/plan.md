

# Fix: Inserir mensagens de recuperação com user_ids corretos

## O que aconteceu
As mensagens foram entregues no WhatsApp das 3 usuárias, mas salvas na tabela `messages` com UUIDs errados. Resultado: aparecem no WhatsApp, mas não no painel admin.

## O que fazer

### 1. Deletar registros órfãos (user_ids errados)
Remover as mensagens salvas com IDs incorretos usando o insert tool (DELETE):
- `d42298dd-2f10-4477-9282-cf3faa64b826`
- `26fb2aa8-ec37-4927-8527-8d0e68b515a3`
- `6b814e0c-6b1a-4d84-b23c-0e9b5a65e572`

### 2. Inserir registros corretos
Inserir as 3 mensagens com os user_ids reais:
- Michele: `d42298dd-45ea-4d45-a181-8af95af6643a`
- Juliane: `26fb2aa8-df22-4641-ac93-588d0e2fe64b`
- Ana Livia: `6b814e0c-d528-4b1a-89df-eb9f6f7d6383`

Com o conteúdo exato que foi enviado e timestamp de ~15:23 UTC.

### 3. Verificar no painel admin
Confirmar que as mensagens aparecem no histórico das 3 usuárias.

**Impacto**: Apenas 3 INSERTs e 3 DELETEs. Sem mudança de código.

