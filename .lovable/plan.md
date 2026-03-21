

# Recuperar 6 Novos Usuários — Boas-Vindas Normal

## Situação
- 6 perfis trial criados hoje com `whatsapp_instance_id = NULL` e 0 mensagens no banco
- Usuários antigos (Roberto, Juliane) foram respondidos normalmente — sem necessidade de ação
- Instância "Aura #1" já está `active` (ID: `93011065-a424-4fce-877e-dc6999522368`)

## Ações

### 1. Atribuir instância WhatsApp aos 6 perfis
UPDATE nos 6 perfis para setar `whatsapp_instance_id` e incrementar `current_users` da instância.

### 2. Enviar boas-vindas normal para cada um
Chamar `send-zapi-message` com `user_id` para cada usuário, usando a mensagem de boas-vindas padrão do trial (conforme o memory: greeting + link do guia, depois mensagem sobre áudio/texto).

Usuários:
| Nome | Telefone | Plano |
|---|---|---|
| Marcia Ribeiro | 5535999105709 | essencial |
| Vinicius Pereira Moura | 5511979993271 | transformacao |
| Simone matico Oliveira | 5541988181556 | direcao |
| Menderson Madruga | 5547933865049 | essencial |
| Neusa Maria dos Santos | 5531971007912 | essencial |
| Bárbara Fernanda Cruz de Lacerda | 5571983931675 | transformacao |

### 3. Fix estrutural no `stripe-webhook`
Reorganizar para criar perfil ANTES de enviar mensagem e passar `user_id` no body — prevenção para o futuro.

**1 DB update + 6 chamadas API + 1 arquivo editado.**

