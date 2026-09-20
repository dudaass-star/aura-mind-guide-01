# Correção definitiva do fluxo de retenção

## Objetivo

Garantir que toda oferta de retenção tenha um percurso único e verificável:

```text
Elegível → oferta criada → enviada → entregue → aberta → aceita
         → pagamento confirmado → acesso atualizado → permanência medida
```

O cliente deve continuar no mesmo meio de pagamento sempre que possível. Nenhuma etapa será considerada concluída apenas porque uma mensagem foi aceita pelo provedor ou uma página foi aberta.

## 1. Criar uma única fonte de verdade

- Transformar cada oferta em uma jornada identificável, com identificador próprio e vínculo ao cliente, motivo, origem, meio de pagamento, plano oferecido, valor e ciclo de cobrança.
- Usar eventos imutáveis para registrar `criada`, `enviada`, `entregue`, `aberta`, `aceita`, `pagamento_pendente`, `paga`, `aplicada`, `falhou`, `expirou` e `recusada`.
- Vincular a mesma jornada às tentativas de WhatsApp, ao link, ao checkout ou QR, ao pagamento e à atualização do acesso.
- Parar de depender dos campos desconectados que hoje ficam vazios ou contraditórios; manter compatibilidade apenas para leitura histórica.
- Usar valores e estados reais do pagamento, sem inferir sucesso pelo clique.

## 2. Tornar todos os links rastreáveis e seguros

- Ativar o mecanismo de tokens de retenção que hoje existe, mas nunca foi usado.
- Gerar um token específico por oferta, com expiração, uso controlado e vínculo à jornada.
- Registrar a abertura antes de encaminhar o cliente para a ação correta.
- Substituir links diretos com token permanente do portal por links próprios da oferta.
- Fazer reenvios reutilizarem a jornada válida, evitando ofertas duplicadas e contagens infladas.

## 3. Unificar as regras de oferta

- Manter uma única definição das escadas por motivo e meio de pagamento no backend; a página apenas renderiza o que receber.
- Preservar os dois avisos antes das ofertas de inadimplência.
- Preservar as regras atuais por motivo: preço, não uso, insatisfação, pausa e retorno posterior.
- Garantir que desconto, Lite, Base e pausa só apareçam quando forem realmente executáveis naquele meio de pagamento.
- Aplicar a mesma proteção contra repetição de desconto em cartão e PIX.

## 4. Corrigir cada caminho de pagamento

### Cartão

- Aplicar desconto ou mudança de plano na assinatura correta.
- Só registrar `aplicada` depois da confirmação do provedor.
- Quando houver nova cobrança, vincular a fatura à jornada e registrar `paga` somente pelo evento de pagamento.
- Evitar uma segunda cobrança inesperada no mesmo mês: informar e aplicar no próximo ciclo quando já existir período pago, salvo escolha explícita do cliente por começar imediatamente.

### PIX Automático Woovi

- O clique abre diretamente a geração do QR, sem exigir um segundo botão.
- Reutilizar QR ainda válido e impedir mandatos duplicados.
- Vincular mandato novo, cobrança inicial e substituição do mandato antigo à mesma jornada.
- Só substituir/cancelar o mandato anterior depois da aprovação do novo.
- Confirmar pagamento e autorização separadamente; a jornada só termina quando ambos estiverem corretos.
- Reconciliar pela Woovi quando o webhook não chegar, usando parcelas/extrato como prova e sem duplicar cobranças.

### Outros trilhos PIX

- Não redirecionar silenciosamente clientes PIX para cartão.
- Oferecer apenas ações suportadas pelo trilho atual; quando não houver suporte automático, apresentar uma alternativa real de pagamento, escolhida pelo cliente.
- Registrar claramente indisponibilidade e migração de meio, sem classificá-las como rejeição da oferta.

## 5. Corrigir winback e cancelamento

- Trocar o checkout genérico do winback por uma oferta vinculada ao cliente e ao meio de pagamento anterior.
- D+3, D+14 e D+30 devem abrir a oferta correspondente, não uma nova compra sem contexto.
- No cancelamento, registrar oferta exibida, opção escolhida, recusa e cancelamento final.
- Corrigir a localização do cliente usando identificador interno como prioridade; telefone e e-mail normalizados ficam como fallback.
- Não impedir o cancelamento quando a retenção falhar.

## 6. Reconciliação e autorreparo

- Criar uma rotina periódica que encontre jornadas paradas em estados intermediários.
- Conferir diretamente no gateway se checkout, fatura, cobrança ou mandato foi pago/aprovado.
- Atualizar evento e acesso quando o pagamento existir, mesmo sem webhook.
- Reprocessar somente etapas seguras e idempotentes; nunca gerar nova cobrança automaticamente para corrigir ausência de registro.
- Marcar falhas permanentes separadamente de atrasos temporários de entrega ou liquidação.

## 7. Medição confiável

- Calcular o funil por pessoas e por jornadas, sem misturar tentativas de envio com ofertas únicas.
- Separar cancelamento voluntário, inadimplência e winback.
- Separar preço, não uso, insatisfação e outros motivos.
- Separar cartão, Woovi e demais meios.
- Medir entrega, abertura, aceite, pagamento, aplicação e permanência após 30/60/90 dias.
- Não alterar o painel administrativo nesta etapa; primeiro garantir dados íntegros e validar por consulta.

## 8. Migração e validação

- Fazer backfill conservador: importar somente eventos históricos comprováveis; deixar desconhecido como desconhecido.
- Testar cartão ativo, cartão inadimplente, Woovi ativo, mandato revogado, cliente já cancelado, link expirado, reenvio e webhook ausente.
- Executar testes com ofertas de teste sem cobrar clientes reais.
- Publicar por etapas: rastreamento e links; cartão; Woovi; winback; reconciliação.
- Antes de ativar cada etapa, rodar em modo de simulação e comparar decisões com o fluxo atual.

## Critérios de conclusão

- Toda oferta enviada possui uma jornada e um link rastreável.
- Todo clique chega à ação correta para o meio de pagamento do cliente.
- Todo pagamento confirmado atualiza a oferta e o acesso, por webhook ou reconciliação.
- Nenhuma oferta aceita fica sem desfecho identificável.
- Nenhum pagamento é duplicado durante reprocessamento ou troca de plano.
- É possível responder, com números comprováveis, quantas pessoas receberam, abriram, aceitaram, pagaram e permaneceram.