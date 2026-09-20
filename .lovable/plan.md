# AURA como aplicativo web principal

## Objetivo

Até **1º de outubro**, transformar o Meu Espaço em um aplicativo web essencial no qual o cliente conversa com a AURA e acompanha sua continuidade. O WhatsApp deixa de carregar a conversa cotidiana com a agente, mas continua sendo usado para:

- receber e apresentar a AURA a novos clientes;
- entregar o acesso seguro ao aplicativo;
- cobranças, lembretes, jornadas e demais comunicações já existentes;
- suporte, dúvidas e questões financeiras iniciadas pelo cliente.

A mudança não altera a inteligência, a metodologia ou a memória da AURA. Ela troca o lugar onde a conversa acontece e acrescenta uma experiência que torna o valor da assinatura visível.

## Experiência do cliente

### Estrutura do aplicativo essencial

1. **Conversar** — tela principal, aberta por padrão, com texto, áudio, histórico completo e estados de envio/resposta.
2. **Hoje** — próxima sessão, continuidade da conversa, pergunta do dia e indicação realmente pertinente.
3. **Percurso** — capítulos mensais, mudanças percebidas, marcos, cartas e temas recorrentes.
4. **Sessões** — agenda, início da sessão, histórico, resumos, fechamentos e avaliação.
5. **Biblioteca** — meditações, áudios e jornadas disponíveis.
6. **Conta** — plano, uso, pagamento, privacidade, ajuda e saída.

No celular, a conversa será o centro da experiência e a navegação principal ficará sempre acessível. No computador, o mesmo produto terá melhor aproveitamento de espaço sem criar uma experiência diferente.

### Conversa

- Campo de texto fixo e envio imediato.
- Gravação e envio de áudio; áudio recebido pode ser reproduzido no próprio aplicativo.
- Resposta progressiva com indicação discreta de que a AURA está respondendo.
- Preservação das bolhas, pausas, preferências de texto/áudio, sessões, limites do plano e protocolo de segurança já usados hoje.
- Continuidade entre dispositivos sem duplicar mensagens.
- Reenvio seguro quando houver falha de conexão, sem produzir duas respostas.
- Aviso claro quando a sessão expirar ou o plano não permitir uma ação, com caminho direto para resolver.

### Histórico completo

As mensagens antigas do WhatsApp aparecerão na mesma linha do tempo das conversas novas. Cada mensagem manterá:

- autor, conteúdo, horário e ordem reais;
- indicação discreta de origem quando necessário;
- texto e áudio disponíveis quando o arquivo original ainda existir;
- separadores de data e sessões;
- paginação para não carregar anos de conversa de uma vez.

Antes de liberar, será feita uma auditoria de identidade e ordem cronológica para impedir que mensagens de perfis diferentes sejam misturadas. Conteúdo técnico interno nunca será mostrado.

## Funcionamento do WhatsApp após a mudança

### Novo cliente

1. O cliente chega pelo WhatsApp.
2. A AURA faz uma apresentação curta, humana e suficiente para gerar confiança.
3. O cliente recebe um link pessoal de acesso ao aplicativo.
4. Depois que o acesso for confirmado, conversas comuns no WhatsApp recebem uma resposta breve convidando a continuar no aplicativo, sem iniciar duas conversas paralelas.

### Cliente já migrado

- Cobranças, lembretes de sessão, jornadas e comunicações operacionais continuam funcionando como hoje.
- Se o cliente chamar sobre acesso, pagamento, cancelamento ou suporte, o atendimento continua no WhatsApp.
- Se ele tentar conversar normalmente com a AURA, será direcionado ao ponto exato da conversa no aplicativo.
- Situações de risco não serão bloqueadas por uma regra cega de canal: recebem o tratamento de segurança previsto e o encaminhamento adequado.

A classificação entre **conversa com a AURA** e **suporte/financeiro** será determinística sempre que possível, com saída segura para casos ambíguos. O WhatsApp não será desligado nem terá seus fluxos financeiros alterados nesta primeira entrega.

## Arquitetura técnica

### Uma única conversa, vários canais

- Manter `messages` como histórico canônico e associar cada mensagem à origem e ao identificador idempotente do canal.
- Usar `user_id` como identidade principal; telefone passa a ser um canal vinculado, nunca a identidade suficiente por si só.
- Criar uma entrada autenticada específica para mensagens do aplicativo.
- Extrair do processamento atual a sequência comum: validar usuário → gravar mensagem → agrupar turno → chamar AURA → executar ações → gravar resposta → entregar no canal correto.
- O núcleo da AURA apenas decide conteúdo e ações. Ele não envia diretamente por WhatsApp.
- A entrega escolhe `in_app` para conversa web e mantém os provedores atuais para mensagens operacionais.

### Segurança e privacidade

- Toda chamada do aplicativo valida a sessão e deriva o usuário da autenticação; o navegador nunca informa livremente qual perfil deseja acessar.
- Regras de acesso isolam mensagens, áudios, sessões, memórias e arquivos por usuário.
- Áudios ficam em armazenamento privado com links temporários.
- Envio de texto e áudio tem validação de tamanho, formato, frequência e conteúdo.
- Locks e chaves idempotentes impedem respostas duplicadas entre abas, reconexões e eventos atrasados.
- Logs técnicos não armazenam links de acesso, tokens ou conteúdo sensível além do estritamente necessário.

### Tempo real e notificações

- Novas mensagens e estados chegam ao aplicativo em tempo real.
- Se a conexão cair, o aplicativo consulta o estado canônico e retoma a conversa.
- Na primeira entrega, WhatsApp e e-mail continuam responsáveis pelos alertas externos críticos.
- Instalação na tela inicial será oferecida como aplicativo web; notificações push entram depois da estabilidade da conversa, sem bloquear o lançamento.

## Acesso e instalação

- Manter Google e código/link por e-mail.
- Manter acesso por link seguro enviado ao WhatsApp como alternativa principal para quem não recebeu o código.
- Após o primeiro acesso, preservar a sessão no aparelho e reduzir novos pedidos de código.
- Adicionar manifesto, ícones, modo instalado e comportamento adequado de aplicativo web.
- Não exigir instalação: o link funciona normalmente no navegador.
- Corrigir primeiro contas órfãs ou duplicadas e garantir vínculo único entre assinatura, perfil e login.

## Entrega em fases

### Fase 1 — Fundamento e conversa real

- modelo canônico multicanal e migração do histórico;
- entrada autenticada do aplicativo;
- texto, áudio, respostas, preferências e limites;
- tempo real, idempotência, interrupção e retomada;
- autenticação e isolamento de dados;
- testes do protocolo de segurança e das sessões.

### Fase 2 — Aplicativo essencial

- nova navegação centrada em Conversar;
- adaptação das áreas Hoje, Percurso, Sessões, Sobre você e Meditações já existentes;
- conta, plano, pagamento e suporte;
- instalação na tela inicial;
- estados vazios, falhas, conexão lenta e celulares pequenos.

### Fase 3 — Transição controlada do WhatsApp

- apresentação e link para novos clientes;
- identificação de suporte/financeiro versus conversa comum;
- redirecionamento de conversa após acesso confirmado;
- clientes atuais migrados em lotes, nunca todos de uma vez;
- fallback imediato se a experiência web apresentar falha.

### Fase 4 — Valor e retenção após estabilidade

- recomendações ligadas ao momento real do cliente;
- jornadas e conteúdos consumidos dentro do aplicativo;
- notificações push opcionais;
- busca no histórico, favoritos e continuidade entre conversa e percurso;
- experimentos de retenção medidos por coorte, sem encher a interface de recursos.

## Cronograma até 1º de outubro

```text
20–22/set  Fundamento multicanal, segurança e migração de histórico
23–25/set  Conversa web por texto, tempo real e continuidade
26–27/set  Áudio, sessões, limites e estados de falha
28–29/set  Aplicativo essencial, instalação e fluxo WhatsApp → app
30/set     Piloto com grupo pequeno, correções e decisão de avanço
01/out     Novos clientes no app; base antiga migra em lotes monitorados
```

Se algum critério crítico não estiver comprovado no dia 30, novos clientes permanecem temporariamente no fluxo atual enquanto o ponto é corrigido. A cobrança do WhatsApp torna a urgência alta, mas não justifica expor clientes a perda de conversa ou de acesso.

## Validação

### Testes obrigatórios

- mensagem de texto e áudio em celular e computador;
- histórico antigo e novo em ordem, sem mistura de usuários;
- envio simultâneo por duas abas e reconexão durante resposta;
- pedido de “só texto” e “não envie áudio” respeitado;
- início, continuidade, término e avaliação de sessão;
- limites de cada plano;
- login por Google, e-mail e acesso enviado no WhatsApp;
- cliente com pagamento em dia, em recuperação e sem acesso;
- suporte/financeiro permanece no WhatsApp; conversa comum migra ao app;
- protocolo de risco não degradado;
- aparelhos pequenos, rede lenta e aplicativo instalado.

### Piloto

Começar com equipe e contas de teste, depois um grupo pequeno de clientes ativos que já acessaram o Meu Espaço. Expandir somente quando os critérios abaixo permanecerem estáveis por 24 horas.

## Métricas e critérios de sucesso

### Confiabilidade

- pelo menos **99,5%** das mensagens persistidas e entregues sem duplicidade;
- zero mistura de histórico entre usuários;
- pelo menos **99%** dos acessos concluídos sem suporte humano;
- tempo de resposta igual ou melhor que o WhatsApp atual;
- zero regressão comprovada em segurança, sessões e preferências de áudio.

### Adoção

- acesso ao aplicativo após convite;
- primeira conversa concluída no aplicativo;
- retorno em D1, D7 e D30;
- percentual de clientes ainda tentando conversar pelo WhatsApp;
- uso de Percurso, Sessões e Biblioteca após conversar.

### Retenção e valor

Comparar coortes WhatsApp e aplicativo em:

- churn nos primeiros 7, 30, 60 e 90 dias;
- frequência e profundidade de conversa;
- sessões concluídas;
- retorno ao aplicativo sem mensagem proativa;
- consumo de jornadas e biblioteca;
- cancelamento por “não estou usando”;
- custo de WhatsApp e custo total por cliente ativo.

A hipótese será considerada validada somente se o aplicativo reduzir dependência do WhatsApp e melhorar ativação ou retenção sem piorar satisfação e confiabilidade.

## O que será preservado

- inteligência, memória, metodologia e regras de segurança da AURA;
- pagamentos, cobranças, reconciliação e recuperação já existentes;
- lembretes, jornadas e comunicações operacionais por WhatsApp;
- dados do Meu Espaço, sessões, percurso, meditações e gestão do plano;
- possibilidade de suporte humano pelo WhatsApp.

## Fora da primeira entrega

- aplicativo nativo de loja;
- videochamada;
- comunidade entre usuários;
- feed social ou gamificação;
- substituição imediata de todos os avisos por push;
- desligamento completo do WhatsApp.
