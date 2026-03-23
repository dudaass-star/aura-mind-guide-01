

# Plano: Conversão de trials antigos + bloqueio

## Contexto

Existem ~15 usuários com `status = 'trial'` do modelo antigo (sem cartão). Alguns com 100+ mensagens trocadas, outros nunca responderam. O sistema **não tem nenhum mecanismo** para bloquear conversa de trial — o `process-webhook-message` e `aura-agent` processam qualquer usuário independente do status.

## Solução em 3 partes

### 1. Criar status `trial_expired` e lógica de bloqueio no `process-webhook-message`

No início do processamento (após identificar o perfil), verificar se `status = 'trial_expired'`. Se sim:
- Responder com mensagem fixa de conversão (link para checkout)
- **Não** chamar o `aura-agent`
- Salvar a mensagem do usuário normalmente (para histórico)

Mensagem de bloqueio (quando tentarem falar):
> "Oi, [nome]! 💜 Seu período de experiência terminou, mas não precisa ser um adeus. Pra continuar conversando comigo, é só escolher o plano que faz sentido pra você: https://olaaura.com.br/checkout"

### 2. Enviar mensagem de alta conversão para todos os trials ativos

Via `admin-send-message`, enviar mensagem personalizada para cada trial que teve engajamento real (>5 mensagens). Mensagem sugerida:

> "[Nome], nos últimos dias conversamos sobre muita coisa importante. 💜
>
> Pra continuar tendo esse espaço comigo — com sessões guiadas, meditações personalizadas e acompanhamento contínuo — escolhe o plano que faz sentido pra você:
>
> https://olaaura.com.br/checkout
>
> Tô aqui te esperando. ✨"

### 3. Atualizar status de todos os trials para `trial_expired`

Após enviar as mensagens, atualizar o status via query:
```sql
UPDATE profiles SET status = 'trial_expired' WHERE status = 'trial';
```

## Detalhes técnicos

**Arquivo modificado**: `supabase/functions/process-webhook-message/index.ts`
- Adicionar check logo após buscar o perfil (~linha 200-250)
- Se `status === 'trial_expired'`: enviar mensagem fixa, salvar no histórico, retornar sem processar

**Migração SQL**: Nenhuma mudança de schema necessária — `status` é campo texto livre

**Usuários sem engajamento** (0-2 msgs, nunca responderam): atualizar para `trial_expired` silenciosamente, sem enviar mensagem

## Resumo de ações

| Grupo | Quantidade | Ação |
|-------|-----------|------|
| Trials engajados (>5 msgs) | ~10 | Mensagem de conversão + bloquear |
| Trials sem engajamento (≤5 msgs) | ~5 | Bloquear silenciosamente |

