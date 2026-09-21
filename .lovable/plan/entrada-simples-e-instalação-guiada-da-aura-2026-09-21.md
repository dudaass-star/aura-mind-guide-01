# Entrada simples e instalação guiada da AURA

## Objetivo
Fazer o cliente entrar uma única vez, instalar a AURA e depois abrir o aplicativo direto na lista de conversas, deixando o código de email apenas como recuperação.

## Experiência do cliente
1. O cliente recebe no WhatsApp cadastrado um botão ou link pessoal “Abrir minha AURA”.
2. Ao tocar, sua identidade é confirmada por um link seguro, de uso único e curta duração.
3. A sessão fica preservada naquele aparelho e os próximos acessos pelo ícone abrem diretamente o Meu Espaço.
4. No primeiro acesso, aparece um convite discreto para instalar:
   - Android e computador: abre a confirmação nativa de instalação.
   - iPhone: mostra um guia visual curto para “Compartilhar → Adicionar à Tela de Início”.
5. O convite não reaparece depois da instalação e, se for dispensado, respeita um intervalo antes de aparecer novamente.
6. Email, Google e código de 8 dígitos continuam disponíveis como recuperação, troca de aparelho ou sessão encerrada.

## Implementação
- Reaproveitar o fluxo seguro de acesso por WhatsApp já existente, sem criar uma segunda autenticação.
- Tornar a mensagem de acesso pelo WhatsApp clara e orientada à abertura do aplicativo.
- Preservar a sessão local com renovação automática e validar a retomada após fechar o navegador ou o aplicativo.
- Criar um convite de instalação pós-entrada, separado do menu de três pontos, com estado persistente por aparelho.
- Manter “Instalar aplicativo” no menu como alternativa manual.
- Ajustar a tela de entrada para priorizar “Entrar pelo WhatsApp cadastrado” e apresentar email/Google como alternativas.
- Não armazenar conversas em cache e não adicionar modo offline nesta etapa.

## Segurança e continuidade
- Link pessoal com alta entropia, hash armazenado, uso único, expiração curta e limite de solicitações.
- Nenhum telefone ou token exposto no endereço após o consumo.
- Nenhuma autenticação baseada apenas em dados salvos pelo navegador.
- Encerrar sessão continua removendo o acesso daquele aparelho.
- Manter o fluxo atual funcionando durante toda a mudança.

## Validação
- Primeiro acesso por WhatsApp, consumo único e rejeição de link expirado/reutilizado.
- Retorno sem código após fechar e reabrir no mesmo aparelho.
- Recuperação por email e Google em outro aparelho.
- Instalação e abertura pelo ícone em Android/Chrome; guia correto no iPhone/Safari.
- Convite não intrusivo: não repetir após instalação e respeitar adiamento.
- Testes mobile e desktop do acesso até a conversa, incluindo logout e reconexão.
