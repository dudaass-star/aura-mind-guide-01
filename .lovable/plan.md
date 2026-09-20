# Churn mensal e LTV do negócio

## Objetivo

Transformar a visão atual de janelas em uma leitura mensal contínua: primeiro, segundo, terceiro mês e assim por diante. No mesmo painel, mostrar quanto cada cliente já gerou de receita e qual é o LTV projetado com base na retenção realmente observada.

## O que será construído

### 1. Retenção por mês de vida

- Criar uma tabela mensal com **Mês 1, Mês 2, Mês 3...** até o último mês com amostra madura.
- Em cada mês, mostrar:
  - clientes que chegaram ao início do mês;
  - clientes que renovaram;
  - clientes que saíram;
  - clientes ainda em cobrança, sem classificá-los prematuramente como churn;
  - taxa de retenção e taxa de churn.
- Separar os resultados por **Cartão, PIX Automático Woovi e Asaas**, além de uma visão consolidada.
- Considerar apenas clientes que já tiveram tempo de atravessar o mês inteiro, evitando piorar artificialmente os meses recentes.

### 2. LTV

- **LTV realizado:** receita líquida confirmada acumulada dividida pelos clientes pagantes da coorte.
- **LTV projetado:** projeção baseada na curva mensal de sobrevivência observada e na receita média por cliente, sem usar apenas a fórmula simplificada `ticket ÷ churn` quando a base ainda é pequena.
- Mostrar também:
  - receita média por cliente pagante;
  - vida média observada em meses;
  - tamanho da amostra;
  - indicação de baixa confiança quando uma coorte ou gateway tiver poucos clientes maduros.
- Excluir tentativas, autorizações, cobranças recusadas e PIX avulso não recorrente; descontar reembolsos/estornos disponíveis nas fontes.

### 3. Definições de negócio

- O relógio começa no **primeiro pagamento confirmado**, não no cadastro.
- Entrada semanal é aquisição; a primeira mensalidade inicia o primeiro mês recorrente no fluxo semanal → mensal.
- Troca de plano ou gateway não conta como churn quando há continuidade paga.
- Cobrança dentro da régua de recuperação permanece como “em cobrança”; só vira churn após o fim da janela configurada.
- Planos trimestral, semestral e anual serão comparados pelo mês de vida, mas a renovação respeitará o ciclo contratado.

## Implementação técnica

- Ampliar a função de métricas do admin para normalizar eventos financeiros dos três gateways e produzir uma série `monthlyRetention` dinâmica.
- Produzir `ltv` com valores realizado/projetado, receita líquida, clientes pagantes, vida média e nível de confiança.
- Substituir os quatro cartões fixos atuais por uma tabela mensal expansível e adicionar um bloco específico de LTV.
- Preservar os indicadores atuais durante a validação para comparação e evitar regressão.

## Validação

- Conferir manualmente amostras de clientes em cada gateway.
- Validar que clientes recentes não entram em meses ainda não amadurecidos.
- Validar que renovação atrasada recuperada não vira churn.
- Comparar a soma da receita usada no LTV com pagamentos efetivamente confirmados.
- Testar o painel em desktop e celular.

## Resultado esperado

O painel responderá, mês a mês, quantos clientes permanecem e quanto cada cliente vale hoje, com uma projeção de LTV sustentada pelos dados reais do negócio.