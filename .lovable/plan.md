# Fechar a instalação da AURA como aplicativo web

## Objetivo
Permitir que o Meu Espaço seja instalado com identidade própria no celular e no computador, sem exigir instalação e sem comprometer a conversa ou servir conteúdo antigo.

## Entrega
- Criar o manifesto do aplicativo com nome AURA, cores do produto, abertura direta em `/meu-espaco` e modo de tela independente.
- Gerar os tamanhos corretos do ícone, incluindo versões comuns e ícones seguros para Android e iPhone.
- Adicionar o funcionamento instalável e a atualização automática do aplicativo, mantendo navegação e mensagens dependentes da rede sempre atualizadas.
- Oferecer “Instalar aplicativo” no menu de três pontos quando o aparelho permitir; no iPhone, mostrar instruções curtas usando o compartilhamento do Safari.
- Ocultar a opção quando o aplicativo já estiver instalado ou quando a instalação não for compatível.
- Ajustar a aparência instalada no iPhone e Android, incluindo barra superior, área segura e nome exibido.

## Detalhes técnicos
- Usar `vite-plugin-pwa` com atualização automática e cache somente dos arquivos estáticos essenciais.
- Não armazenar respostas do backend, mensagens, áudios, autenticação ou páginas privadas em cache de dados.
- Manter `/meu-espaco` como início do aplicativo instalado e preservar o acesso normal pelo navegador.

## Validação
- Confirmar manifesto, service worker, ícones e critérios de instalação.
- Testar a abertura instalada em `/meu-espaco`, login quando necessário e atualização para nova versão.
- Conferir o menu e as instruções no celular e no computador, sem sobreposição ou regressão na conversa.
