# Push como canal principal de relacionamento da AURA

## Objetivo

Substituir gradualmente os templates pagos de WhatsApp por notificações do aplicativo para clientes que autorizaram push, sem perder mensagens importantes. A estratégia prioriza retorno ao app, frequência saudável de uso, conversão e retenção — não volume de disparos.

## Regra de canais

- **Push primeiro:** resposta da AURA, lembrete de sessão, sessão próxima, jornada disponível, resumo semanal, prática/meditação pronta, lembrete pedido pelo cliente e retomada leve.
- **WhatsApp como segurança:** quando o cliente ainda não tem push ativo, o envio ao Firebase falha, o aparelho está inválido ou uma comunicação crítica não foi aberta no prazo definido.
- **WhatsApp mantido:** confirmação de acesso inicial, recuperação de pagamento/cobrança, alteração ou cancelamento de assinatura, suporte manual e situações de segurança. Esses fluxos não serão substituídos até haver evidência de entrega equivalente.
- **Sem duplicidade:** um mesmo evento não dispara push e WhatsApp ao mesmo tempo. Cada comunicação terá uma chave única e histórico de tentativas.
- **App aberto:** se o cliente estiver usando a AURA, não haverá push; a atualização aparece dentro do próprio aplicativo.

## Experiência e personalização

- Usar nome, momento da jornada, próxima sessão e conteúdo disponível para escolher **qual aviso enviar e quando**.
- Manter a tela bloqueada discreta: nunca expor tema emocional, diagnóstico, transcrição, cobrança específica ou qualquer conteúdo íntimo.
- Levar cada toque diretamente ao destino certo: conversa, sessão, jornada, prática ou progresso.
- Limitar frequência, respeitar 22h–08h BRT e agrupar avisos repetidos da mesma categoria.
- Não usar IA para inventar texto livre na tela bloqueada. A personalização será feita com modelos curtos, revisados e variáveis seguras.
- Separar avisos de uso do produto de promoções. Promoções terão controle próprio e não serão ativadas silenciosamente para quem aceitou apenas lembretes da AURA.

## Estrutura de entrega

1. Criar um roteador único de notificações com três resultados: `push`, `WhatsApp` ou `dentro do app`.
2. Registrar cada comunicação em uma linha canônica, com categoria, motivo, canal escolhido, tentativas, abertura, destino e conversão associada.
3. Tornar o envio idempotente para impedir repetição por cron, webhook ou retentativa.
4. Aplicar prioridade e validade por tipo:
   - resposta nova: imediata e expira rápido;
   - sessão: alta prioridade e fallback se necessário;
   - jornada/resumo/prática: prioridade normal e sem pressão;
   - comercial: frequência limitada e mensuração separada.
5. Desativar automaticamente tokens inválidos e manter preferências por aparelho.
6. Usar o WhatsApp atual como fallback, preservando templates aprovados durante a transição.

## Primeira migração

Migrar primeiro os avisos com melhor relação valor/custo e menor risco:

1. **Nova resposta da AURA** — já conectado ao push; concluir métricas e deduplicação.
2. **Lembretes de sessão** — push com link direto para a conversa/sessão; WhatsApp de segurança para aviso crítico não aberto.
3. **Jornada, prática e meditação disponíveis** — push direto para o conteúdo.
4. **Resumo semanal e renovação da agenda mensal** — push direto para Progresso ou Sessões.
5. **Lembretes pedidos pelo próprio cliente** — push preferencial, WhatsApp se o aparelho não estiver alcançável.
6. **Check-ins e reengajamento** — migrar depois de validar frequência e retorno das quatro categorias anteriores.

Cobrança, winback e promoções permanecem fora desta primeira migração; entram depois com consentimento e métricas próprios.

## Métricas para conversão e LTV

Adicionar ao admin:

- clientes ativos com push permitido e aparelhos alcançáveis;
- convite exibido → tentativa → permissão → aparelho registrado;
- envios aceitos pelo Firebase, falhas, aberturas e tempo até abrir;
- retorno à conversa, sessão iniciada, jornada aberta e prática executada;
- templates de WhatsApp evitados e economia estimada;
- comparação de retenção, uso e receita entre clientes com e sem push;
- opt-out, excesso de frequência e notificações ignoradas por categoria;
- conversão de cada comunicação, sem atribuir venda apenas ao clique final.

A otimização será por **retorno útil e retenção**, não por taxa de abertura isolada.

## Validação e implantação

- Testar Android/Chrome, iPhone instalado e computador, incluindo aparelho aberto, fechado, offline e token expirado.
- Simular reprocessamento para provar ausência de duplicidade.
- Validar links para cada área e ausência de conteúdo sensível na tela bloqueada.
- Rodar piloto com pequena parcela dos clientes que ativaram push.
- Comparar por 7–14 dias com o WhatsApp atual antes de ampliar.
- Manter reversão imediata para WhatsApp por categoria, sem interromper os avisos.

## Resultado esperado

Clientes com push ativo passam a receber no aplicativo os avisos de maior valor. O WhatsApp deixa de ser o canal padrão nesses casos, mas continua protegendo comunicações críticas e clientes ainda não alcançáveis pelo app. A AURA ganha comunicação mais contextual, menor custo e mensuração real do impacto sobre uso, conversão e LTV.
