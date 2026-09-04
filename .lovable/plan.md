# Aceite do encontro de R$ 6,90 caindo em link de assinatura

## O que aconteceu com a Mariza

Verifiquei a conversa dela no banco. Às 16h35 ela escreveu "Encontro avulso", às 16h50 confirmou com "Sim" — e em vez do código de R$ 6,90 saiu uma resposta escrita pela IA prometendo o QR, sem código nenhum. Ela acabou pagando o plano anual às 16h58, mas o furo continua de pé para os próximos.

Duas causas, as duas confirmadas nos dados:

1. **O número dela está gravado em duas grafias.** Os disparos automáticos ficaram sob a versão com o nono dígito, e toda a conversa real ficou sob a versão sem o nono dígito. A checagem "essa pessoa já recebeu a oferta de R$ 6,90?" procura só numa das grafias, não encontra nada e conclui que a oferta nunca saiu — então o aceite curto ("Sim") é descartado e o assunto volta pra IA, que improvisa.
2. **"Encontro avulso" não é reconhecido como aceite.** A lista de frases que valem como pedido do encontro não cobre esse jeito de dizer, que é justamente o texto do botão/expressão que o lead repete.

Resultado: quem aceita o encontro de R$ 6,90 pode receber texto solto (ou link de plano) em vez do código.

## O que vai ser feito

- Passar a procurar o histórico do lead em **todas as grafias do mesmo número** (com e sem o nono dígito, com e sem o 55), tanto na checagem "a oferta já saiu?" quanto na trava "já mandei código na última hora?".
- Ampliar as frases aceitas como pedido do encontro: "encontro avulso", "sessão avulsa", "avulso", além das que já existem.
- Quando o lead está elegível ao encontro e aceita, o código sai pelo caminho determinístico do backend — a IA não entra nessa decisão nem escreve promessa de código.

Nada muda em valor, elegibilidade, cooldown, kill switch, templates aprovados ou régua de recuperação.

## Detalhes técnicos

- `supabase/functions/recovery-agent/pix-buttons.ts`:
  - novo helper `phoneMatchList(phone)` (união de `normalizeBrazilianPhone` + `getPhoneVariations` + variante sem o nono dígito);
  - `tasterOfferAlreadySent` e `recentCodeSent` trocam `.eq("phone", ...)` por `.in("phone", phoneMatchList(phone))`;
  - `RE_TASTER_BUTTON` passa a cobrir `encontro avulso` / `sess[aã]o avulsa` / `avulso|avulsa` isolado.
- Sem migração, sem mudança de schema, sem alteração em `taster.ts` ou `criar-pix-taster`.
- `deno check` em `supabase/functions/recovery-agent` e deploy da função `recovery-agent`.

## Validação

- Reproduzir com o telefone de teste já cadastrado: oferta → responder "encontro avulso" → conferir que o link/página do PIX de R$ 6,90 sai pelo caminho determinístico.
- Conferir nos registros que o aceite aparece com resolução `taster_link_sent` e não como resposta escrita pela IA.
