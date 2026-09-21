# Notificações push no aplicativo AURA

## Objetivo
Ativar notificações no aplicativo web sem atrapalhar checkout, instalação ou conversa, priorizando avisos úteis e consentimento claro.

## Experiência do cliente
- Apresentar o convite depois da entrada no aplicativo, em momento separado do convite de instalação.
- No iPhone, orientar primeiro a instalação na tela inicial; só então pedir a permissão de notificações.
- No Android e computador, abrir a permissão nativa após o toque em “Ativar notificações”.
- Se o aplicativo estiver dentro do preview, orientar a abertura em uma aba própria, sem exibir erro técnico.
- Disponibilizar “Notificações” no menu de três pontos para ativar, revisar o estado ou corrigir uma permissão bloqueada.
- Após recusa, não repetir imediatamente; reapresentar apenas em ocasião relevante e com intervalo controlado.

## Entrega segura
- Registrar cada aparelho autenticado separadamente, vinculado somente ao próprio cliente.
- Substituir registros renovados e remover automaticamente aparelhos inválidos.
- Permitir desativação do aparelho atual.
- Proteger cadastro, consulta e remoção no servidor; nenhum cliente acessa os registros de outro.
- Enviar apenas para clientes com plano e acesso válidos.

## Primeiros avisos
- Nova resposta da AURA quando o aplicativo não estiver visível.
- Lembretes de sessão e jornada disponível, preparados para migração gradual dos avisos hoje enviados por WhatsApp.
- Abrir diretamente a conversa ou a área correspondente ao tocar na notificação.
- Não incluir conteúdo psicológico sensível na tela bloqueada; usar textos discretos.
- Promoções, recuperação comercial e campanhas ficam fora desta entrega.

## Medição e qualidade
- Medir convite exibido, ativação iniciada, permissão concedida ou recusada, aparelho registrado, entrega e abertura.
- Evitar duplicidade entre aparelhos e entre push e WhatsApp durante a migração.
- Validar Android/Chrome, iPhone instalado e computador, incluindo app fechado, segundo plano e permissão bloqueada.

## Detalhes técnicos
- Usar Firebase Cloud Messaging já conectado, com service worker dedicado para recebimento em segundo plano.
- Criar tabela de aparelhos com RLS e concessões explícitas, além de funções autenticadas para registrar e remover tokens.
- Criar envio centralizado com remoção de tokens expirados e retentativa apenas para falhas temporárias.
- Integrar o aviso de nova resposta ao fluxo existente do chat sem aumentar o tempo de resposta da AURA.
- Manter WhatsApp ativo nesta fase; a troca de canal será gradual e medida.
