
# Investigação: Quem Recebeu os Relatórios Semanais

**Objetivo**: Identificar através dos logs quais usuários efetivamente receberam os relatórios semanais da Aura.

## Plano de Investigação

### 1. Análise dos Logs da Edge Function
- Verificar logs da função `weekly-report` para encontrar execuções recentes
- Buscar evidências de envios bem-sucedidos nos logs de função
- Examinar logs de analytics do Supabase para chamadas HTTP à função

### 2. Consulta da Tabela weekly_plans
- Verificar registros criados recentemente na tabela `weekly_plans`
- Identificar usuários que têm entradas com `week_start` da semana passada
- Analisar o campo `reflections` que contém as análises de evolução enviadas

### 3. Análise da Tabela messages  
- Buscar mensagens do tipo `assistant` enviadas recentemente
- Filtrar por conteúdo que contenha padrões típicos do relatório semanal
- Identificar usuários que receberam essas mensagens

### 4. Verificação de Logs de Rede
- Examinar logs de requisições HTTP para a Z-API
- Verificar status codes de sucesso/falha nos envios
- Identificar possíveis erros de entrega

## Metodologia Técnica

1. **Logs de Edge Function**: Usar `supabase--edge_function_logs` para buscar execuções da `weekly-report`

2. **Consulta de Dados**: Usar `supabase--read_query` para:
   - Buscar na `weekly_plans` por registros da última semana
   - Verificar `messages` por relatórios enviados
   - Correlacionar com dados de `profiles` para identificar usuários

3. **Análise de Analytics**: Usar `supabase--analytics_query` para logs de função e rede

4. **Correlação de Dados**: Cruzar informações de múltiplas fontes para confirmar entregas

## Resultado Esperado

- Lista de usuários que efetivamente receberam relatórios
- Identificação de falhas específicas no envio
- Detalhes sobre horário e conteúdo dos relatórios enviados
- Recomendações para correção de problemas identificados

## Abordagem de Debugging

A investigação seguirá a trilha: **Execução da Função → Processamento de Usuários → Envio via Z-API → Confirmação de Entrega**, permitindo identificar exatamente onde pode ter ocorrido falha no processo.
