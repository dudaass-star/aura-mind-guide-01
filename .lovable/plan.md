

## Plano: Visualizar o Portal + Distribuir o Link do "Meu Espaço"

### Problema atual

Nenhum token existe no banco — os tokens só são criados para **novos** usuários (via `start-trial` e `stripe-webhook`). Usuários existentes (como você) não têm token gerado.

### O que fazer

**1. Gerar tokens para todos os usuários existentes (backfill)**

SQL de inserção para criar tokens para todos os perfis que ainda não possuem:

```sql
INSERT INTO user_portal_tokens (user_id)
SELECT p.user_id FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM user_portal_tokens t WHERE t.user_id = p.user_id
);
```

Após isso, vou buscar o seu token específico e navegar até o portal para você ver como ficou.

**2. Distribuir o link do portal para os usuários**

Proposta de 3 pontos de distribuição:

| Momento | Como |
|---------|------|
| **Página de Obrigado** (`/obrigado`) | Adicionar card com link "Acesse seu Meu Espaço" — mas o token só existe após o `stripe-webhook` processar, então precisaria buscar via phone/localStorage. Alternativa mais simples: mencionar que o link será enviado no WhatsApp. |
| **Email de boas-vindas** | Incluir botão "Acessar Meu Espaço" no template `welcome.tsx` com o link `olaaura.com.br/meu-espaco?t=TOKEN` |
| **Welcome no WhatsApp** | Incluir o link do portal na mensagem de boas-vindas (dentro da janela de 24h, texto livre) |

**Recomendação:** O melhor ponto é o **Welcome no WhatsApp** (texto livre, já dentro da janela) + **Email de boas-vindas**. A página de Obrigado pode apenas mencionar "você receberá o link do seu painel pessoal no WhatsApp".

### Sequência

1. Backfill de tokens para usuários existentes
2. Navegar no portal com seu token para você avaliar
3. Adicionar link do portal no welcome do WhatsApp (`start-trial` e `stripe-webhook`)
4. Adicionar link do portal no email de boas-vindas (`welcome.tsx`)
5. Atualizar página de Obrigado com menção ao "Meu Espaço"

### Arquivos alterados

| Arquivo | Ação |
|---------|------|
| Inserção SQL (backfill) | Gerar tokens existentes |
| `supabase/functions/start-trial/index.ts` | Incluir link do portal na welcome message |
| `supabase/functions/stripe-webhook/index.ts` | Incluir link do portal na welcome message |
| `supabase/functions/_shared/transactional-email-templates/welcome.tsx` | Adicionar botão "Meu Espaço" |
| `src/pages/ThankYou.tsx` | Menção ao painel pessoal |

