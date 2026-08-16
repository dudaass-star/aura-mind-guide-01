# Agente de recuperação: explicar o PIX Automático de forma humana e tranquilizadora

## O que a conversa do Alberto mostra

O lead disse duas coisas, na ordem:
1. "era um valor menor para fazer uma experiência" → ele quer **testar**.
2. "quando eu avanço com o Pix dá valor de 29 daí não quero" → ele viu **R$ 29,90 na tela do banco** e entendeu como cobrança de agora.

O agente respondeu com preço + link. Correto nos fatos, frio na comunicação: não disse a frase que resolve tudo ("hoje sai R$ 6,90; o 29,90 que o banco mostra é só a autorização, e ela só roda no 8º dia"), não tranquilizou, não falou de experimentar, e não ofereceu cartão a quem torceu o nariz pro débito automático. Foi a mensagem manual do admin que fez esse trabalho.

Duas causas, as duas corrigíveis:
- **A base não tem o item da dúvida real.** Existe item sobre "o que é Pix Automático" e sobre quando debita, mas nenhum que ataque de frente "apareceu R$ 29,90 na tela, vou ser cobrado agora?".
- **O prompt manda ser preciso e seco.** Ele diz literalmente "precisão vence simpatia", "não explore sentimento", "máximo 3 frases", e não pede o número concreto do que sai hoje. O resultado é o robô que você viu.

## O que vai ser feito

### 1. Base de conhecimento: os itens que faltam sobre PIX Automático
Novos itens em `duvida_tecnica`, na linguagem de quem está com o app do banco aberto:
- "Apareceu R$ 29,90 na tela do banco — vou pagar isso agora?" → não: hoje sai só a 1ª semana; o valor do plano é a autorização e só entra no 8º dia. Prioridade máxima.
- "Vi dois valores na tela, é cobrança dupla?" → um é o pagamento da semana, o outro é o mandato.
- "É seguro autorizar cobrança automática no meu banco?" → é o Pix Automático do Banco Central, revogável por você no app, sem fidelidade.
- "Não quero débito automático" → caminho do cartão, mesma 1ª semana promocional, sem autorização de banco.
- "Se eu cancelar dentro dos 7 dias, o banco debita?" → não; a autorização morre com o cancelamento.

Ajustar também os itens de `garantia`/`pagamento` para sempre trazerem **o valor concreto de hoje** por plano (6,90 / 9,90 / 19,90), em vez de "1ª semana promocional".

### 2. Prompt do agente: mesma verdade, comunicação de gente
Reescrever o `system_prompt` de `recovery_agent_config` mantendo todas as travas de verdade (nada inventado, sem upsell, sem atendimento humano, sem terapia) e mudando a **forma**:
- **Número primeiro**: quando a trava envolve preço ou cobrança, a 1ª frase diz o que sai hoje e o que **não** é cobrado agora. Nunca falar "1ª semana promocional" sem o valor.
- **Anti-robô**: usar as palavras do lead ("experiência", "testar") de volta e nomear a sensação em uma frase curta ("faz sentido estranhar, é função nova de banco") antes do fato. Proibido abrir com preço puro quando a mensagem tem hesitação.
- **Experiência, não compra**: a semana é pra testar a conversa real; o compromisso é de 7 dias, não de mês.
- **Tranquilizar com fato, não com adjetivo**: sem cobrança se cancelar antes do 8º dia, cancelamento em 1 minuto no site, autorização revogável no app do banco — um por mensagem, o que casa com a trava.
- **Cartão como saída**: se o lead resistir ao débito automático, oferecer cartão com a mesma 1ª semana em vez de reenviar o link do PIX.
- **Nunca repetir link/argumento**: se o link já foi enviado e surgiu nova objeção, resolver a objeção e fechar com pergunta.
- Teto de 3 frases vira **até 5 frases curtas** quando a trava é compreensão do PIX Automático — a mensagem do admin que funcionou tinha 5.
- "Precisão vence simpatia" vira "precisão **com** acolhimento".

### 3. Checkout: uma linha a mais no modal do PIX
Na tela do QR, uma linha destacada acima das instruções: "Hoje sai R$ X,90. O R$ 29,90 que o banco mostra é a autorização das próximas mensalidades — só entra no 8º dia." Mesmo texto do agente, pra quem não abandona também não se assustar.

## Detalhes técnicos
- `INSERT` dos novos itens em `recovery_knowledge_base` (`duvida_tecnica`, prioridade 96-99 no item do "R$ 29,90") e `UPDATE` nos itens de garantia/pagamento com valores por plano. `duvida_tecnica` já está em `ALWAYS_CATEGORIES`, então entram em todo prompt.
- `UPDATE recovery_agent_config SET system_prompt = ... WHERE id = 1` — sem mexer em `enabled`, `model`, `max_auto_replies`, silent hours.
- `supabase/functions/recovery-agent/index.ts`: só o rodapé do `contextBlock` (pedir o valor de hoje na 1ª frase quando a trava for cobrança; permitir até 5 frases). Nenhuma mudança de fluxo/guardas.
- Copy em `src/pages/CheckoutV2.tsx` (bloco do QR PIX, ~linhas 2013 e 2099), usando `currentPlan.trialPrice` e `currentPrice` já disponíveis.
- Fonte de verdade dos valores: `src/lib/plan-pricing.ts` + mapa de trial do `CheckoutV2.tsx`.
- Memória do projeto atualizada com a regra "valor de hoje sempre explícito" na comunicação de PIX Automático.

## Fora do escopo (posso fazer depois)
O bug do telefone gravado sem o 9 (`555184068922` vs `5551984068922`), que duplicou a conversa no inbox e escondeu histórico do agente.