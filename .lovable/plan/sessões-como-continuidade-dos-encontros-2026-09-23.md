# Sessões como continuidade dos encontros

## Objetivo

Evoluir a área de Sessões de uma agenda com histórico para o espaço de continuidade dos encontros, aumentando comparecimento, repetição de sessões, percepção de progresso e upgrade contextual sem pressão.

## O que será feito

### 1. Corrigir riscos críticos

- Remover qualquer cancelamento de sessão provocado por ausência de atividade no WhatsApp.
- Fazer os lembretes funcionarem por push mesmo quando não houver telefone; WhatsApp será apenas contingência.
- Registrar falta real como ausência (`no_show`), preservando a regra de consumo da cota mensal.
- Revisar a troca de plano iniciada pela cota de sessões em todos os meios de pagamento, inclusive PIX Automático Woovi.

### 2. Melhorar agendamento e entrada na sessão

- Organizar a agenda por mês, mantendo lista e contador coerentes com o mês visualizado.
- Mostrar somente horários válidos; indisponibilidades e colisões serão evitadas antes da confirmação, mantendo a proteção final no servidor.
- Exibir contagem regressiva para a próxima sessão.
- Liberar “Entrar na sessão” perto do horário e “Continuar sessão” quando ela já estiver em andamento, levando diretamente à conversa correta.
- Mostrar o estado dos lembretes e oferecer ativação de notificações quando necessário.

### 3. Criar continuidade antes e depois do encontro

- Adicionar uma preparação curta e opcional: o que o cliente não quer esquecer de levar para a sessão.
- Levar resumo, fechamento e avaliação para o aplicativo, com WhatsApp como fallback.
- Apresentar interpretações como “Uma leitura possível”, convidando o cliente a confirmar ou ajustar.
- Permitir “Retomar com a AURA” e “Levar para a próxima sessão”.
- Registrar correções sem avisar o administrador e incorporar o ajuste ao fluxo existente de memória da AURA.

### 4. Medir retenção e LTV

Registrar os principais passos da experiência:

- abertura da área e visualização da próxima sessão;
- início, confirmação, erro e abandono do agendamento;
- reagendamento, cancelamento, entrada, ausência e conclusão;
- abertura do resumo, avaliação, confirmação ou correção de uma leitura;
- nova sessão após a anterior;
- cota atingida, abertura e conclusão de upgrade.

KPIs principais: comparecimento, repetição após a primeira sessão, intervalo entre sessões, correções por 100 sessões, utilização por plano, upgrade após cota atingida e renovação conforme uso.

## Experiência final

```text
Antes            No horário             Depois
Agenda do mês -> Entrar na sessão -> Resumo no app
Preparação        Conversa correta       Avaliação
Lembretes         Continuar sessão       Validar ou corrigir
Cota clara                                Retomar ou levar adiante
```

## Regras preservadas

- Cota pelo mês da sessão no horário de Brasília.
- Cancelamento antes do horário devolve a vaga; ausência e sessão concluída consomem a cota.
- Reagendamento e cancelamento individuais.
- Lembretes de 24 horas e 5 minutos, respeitando as regras de silêncio já aprovadas.
- Upgrade somente ao atingir a cota, mostrando apenas planos com mais sessões.
- Sessões já marcadas nunca serão interrompidas por uma troca de plano.
- Leituras psicológicas serão hipóteses verificáveis, nunca conclusões fechadas.

## Validação

- Simular agendamento, reagendamento, cancelamento, conflito, ausência, entrada e continuidade.
- Testar sessões em meses diferentes e todos os limites de plano.
- Verificar push com e sem telefone e contingência por WhatsApp.
- Testar os meios de pagamento no caminho de upgrade sem criar cobrança real.
- Validar visualmente em celular pequeno, iPhone, Android e desktop.
- Confirmar isolamento entre clientes, concorrência e ausência de duplicidade.
