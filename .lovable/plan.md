

## Cadastrar Letícia e Enviar Boas-Vindas

### Contexto
A usuária Letícia (555195986335) é uma das primeiras usuárias, mas seu registro não existe mais no banco de dados. Ela enviou uma mensagem e não recebeu resposta porque o sistema não a reconhece.

### Ações Necessárias

#### 1. Criar perfil no banco de dados

Inserir novo registro na tabela `profiles`:

```sql
INSERT INTO profiles (
  user_id,
  name,
  phone,
  status,
  plan,
  onboarding_completed,
  current_journey_id,
  current_episode
) VALUES (
  gen_random_uuid(),
  'Letícia',
  '555195986335',
  'active',
  'essencial',
  true,
  'j1-ansiedade',
  0
);
```

**Configuração:**
- **Status:** `active` (usuária antiga, não trial)
- **Plano:** `essencial` (plano padrão)
- **Onboarding:** `true` (não precisa passar pelo onboarding)
- **Jornada:** `j1-ansiedade` (jornada padrão)

#### 2. Enviar mensagem de boas-vindas

Após o cadastro, enviar mensagem via edge function `send-zapi-message`:

```
Oi, Letícia! 💜

Desculpa a demora! Tive um probleminha técnico aqui, mas já está tudo certo.

Estou aqui pra você. Me conta: como você está se sentindo hoje?
```

### Resultado Esperado
- Letícia será reconhecida pelo sistema
- Ela receberá a mensagem de boas-vindas
- Próximas mensagens dela serão processadas normalmente pela AURA

