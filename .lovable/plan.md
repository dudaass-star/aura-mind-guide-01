

## Enviar email de manutenção via domínio olaaura.com.br

O domínio `@olaaura.com.br` está ativo e verificado. Agora precisamos atualizar a edge function para usar o remetente correto e disparar.

### Passos

1. **Atualizar remetente na edge function `notify-users-email`**
   - Mudar de `Aura <onboarding@resend.dev>` para `Aura <noreply@olaaura.com.br>`
   - Usar a infraestrutura de email do Lovable (domínio `notify.olaaura.com.br`) em vez do Resend direto

2. **Deploy e disparo**
   - Fazer deploy da função atualizada
   - Você clica no botão "Aviso por Email" no painel admin para disparar

### Resultado esperado
- Todos os usuários ativos/trial com email cadastrado recebem o aviso de manutenção
- Emails chegam com remetente `@olaaura.com.br` (profissional, sem sandbox)

