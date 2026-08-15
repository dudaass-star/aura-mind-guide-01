# Agente do inbox de recuperação: base atualizada + especialista em fechamento

## O que está desatualizado (verificado no banco)

A `recovery_knowledge_base` tem 20 itens ativos, a maioria escrita antes das mudanças de agosto. Erros que o agente está falando hoje:

1. **PIX sem trial** — dois itens afirmam literalmente "no PIX não existe trial de R$ 6,90 / o trial semanal é exclusivo do cartão". Hoje o PIX Automático mensal cobra a 1ª semana promocional e só debita o valor cheio no 8º dia. É o erro mais caro: derruba justamente o meio de pagamento que virou padrão no checkout.
2. **Preços errados** — Transformação aparece como R$ 99,90/mês (é R$ 79,90) e o trial de Direção como R$ 11,90 (é R$ 9,90 no checkout).
3. **Ciclos longos sem preço** — só diz "tem trimestral, semestral e anual com desconto", sem os valores atuais (Essencial 19,90/14,90/9,90 · Direção 33,90/24,90/16,90 · Transformação 53,90/39,90/26,90 por mês).
4. **Gateway PIX errado** — fala "Asaas/Bacen"; o trilho vigente é Woovi (PIX Automático Bacen), com autorização única no app do banco.
5. **Garantia vaga** — "cancelando antes do fim da primeira semana você não paga o valor cheio" sem dizer onde e como se cancela.
6. **Lacunas de dúvida técnica** — não existe item sobre: o que é "Pix Automático" na tela do banco, por que o banco pede autorização, o que aparece no extrato, o que acontece se o banco recusar, como cancelar o mandato PIX, se dá pra trocar de plano/ciclo depois, como o acesso chega no WhatsApp depois de pagar, se precisa CPF/dados, e por que o semanal só vale na 1ª assinatura.

## O que vai ser feito

### 1. Corrigir e ampliar a base de conhecimento
- Reescrever os itens de `preco`, `pagamento`, `comparacao` e `garantia` com os valores e regras vigentes (trial semanal nos dois meios, só mensal, só cliente novo; valor cheio e equivalentes mensais de cada ciclo).
- Desativar (não apagar) os itens que afirmam "PIX não tem trial".
- Criar categoria `duvida_tecnica` com ~10 itens novos cobrindo as lacunas acima, em linguagem de quem está com o app do banco aberto.
- Criar categoria `objecao` com respostas curtas para as travas típicas de quem já quis assinar: "vou pensar", "é caro", "IA não vai me entender", "já tentei terapia/app e não funcionou", "não tenho tempo", "medo de cobrança escondida", "não confio em pagar por link".
- Incluir `duvida_tecnica` e `objecao` no conjunto sempre injetado no prompt (hoje: preco, garantia, como_funciona, pagamento, seguranca, beneficio).

### 2. Tornar o agente especialista em fechamento
Reescrever o `system_prompt` do agente (guardado em `recovery_agent_config`) para operar como closer consultivo, não FAQ:
- Ler qual é a natureza da trava (detalhe técnico, desconfiança, preço, insegurança sobre servir pra ela) e responder **essa** trava — uma por mensagem, sem despejar tudo.
- Responder em duas partes: resposta objetiva → uma ponte curta ligada ao que a pessoa disse → link. Sem repetir benefício genérico.
- Remover risco em vez de argumentar valor: cancelamento em 1 clique, sem fidelidade, 1ª semana barata, autorização do banco que ela mesma revoga.
- Quando a dúvida já foi respondida e a pessoa não avança, fazer **uma** pergunta de fechamento concreta ("prefere começar no cartão ou no PIX?") em vez de insistir no mesmo argumento.
- Reconhecer o plano/ciclo que ela já tinha escolhido no checkout e continuar dali, sem reabrir a escolha.
- Manter as travas atuais: nunca inventar fato fora da base, nunca prometer atendimento humano no WhatsApp, nada de terapia/diagnóstico, sem nomear escolas, e a política de não fazer upsell.
- Ajustar o rodapé de instrução do contexto para pedir a estrutura resposta → ponte → tag, mantendo `[ENVIAR_LINK]` / `[ESCALAR_HUMANO]` / `[STOP]`.

## Detalhes técnicos
- Migração de dados em `recovery_knowledge_base`: `UPDATE` nos itens desatualizados, `is_active=false` nos dois itens de "PIX sem trial", `INSERT` dos itens de `duvida_tecnica` e `objecao` com `priority` calibrada.
- `UPDATE recovery_agent_config SET system_prompt = ... WHERE id = 1` (sem mexer em `enabled`, `model`, `max_auto_replies`, horário de silêncio).
- `supabase/functions/recovery-agent/index.ts`: acrescentar as duas categorias em `ALWAYS_CATEGORIES`, subir `MAX_KB_ITEMS` de 12 para 16 e ajustar o texto final do `contextBlock`. Nenhuma mudança no fluxo de guardas, Twilio ou gravação de mensagens.
- Fonte de verdade dos preços: `src/lib/plan-pricing.ts` e o mapa de trial de `CheckoutV2.tsx`.
- Memória do projeto atualizada com a nova regra de KB do recovery.
