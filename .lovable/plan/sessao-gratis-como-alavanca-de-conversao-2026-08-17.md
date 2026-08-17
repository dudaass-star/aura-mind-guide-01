# Sessão grátis como alavanca de conversão — 3 frentes aprovadas

A oferta funciona melhor como **carta na manga do agente**, não como banner ou template automático para todo mundo. O formato: **1 sessão de 45 min, agendada no WhatsApp da Aura, sem cartão, sem PIX, 1 por telefone (cooldown longo)** — e ao final da sessão a própria Aura convida pro plano.

## 1. Agente da recuperação oferece quando detectar dúvida (prioridade máxima)

O `recovery-agent` já diagnostica a trava do lead (técnica, desconfiança, preço, insegurança). A sessão grátis entra como recurso que ele pode usar **quando explicar não bastou** — nunca na primeira resposta e nunca como isca de abertura.

Regras propostas:
- Só a partir da 2ª resposta do agente na mesma conversa, e só se o lead demonstrou dúvida real (não em "não quero", não em stop word).
- Uma oferta por lead. Se recusar, o agente não repete.
- Prompt orienta o objetivo ("tirar o risco da decisão"), sem frase pronta — ele escreve com as próprias palavras, como já faz hoje.
- Nova tag `[OFERECER_SESSAO_GRATIS]`, com o backend registrando a oferta e criando o acesso limitado só quando o lead aceitar.

## 2. Follow-up de leads antigos

Leads que preencheram o formulário, não pagaram, e estão parados há mais tempo (ex: +7 dias) já são base morta hoje. Uma rodada de "sessão de 45 min por conta da casa" reaquece sem pagar tráfego.

- Lote controlado (ex: 50/dia), janela 08h–22h BRT.
- Precisa de template WhatsApp aprovado próprio (é fora da janela de 24h).
- Quem responder cai no mesmo agente, que conduz o agendamento.

## 3. Sessão grátis como 2ª/3ª mensagem do fluxo automático — não recomendado como está

Faz sentido na intenção, mas hoje esbarra em duas coisas reais no código:

- **Teto vitalício de 2 envios por telefone** (`recover-abandoned-checkout-whatsapp`): qualquer telefone que já recebeu 2 mensagens automáticas, ou que teve 1 falha, entra numa lista de banimento permanente — porque a Twilio cobra mesmo quando a Meta rejeita. Uma 3ª mensagem para todos aumenta custo e risco de qualidade do número.
- **Canibalização**: quem ia pagar R$ 6,90 em 24h passa a esperar o grátis. O grátis precisa aparecer só para quem **não converteu e demonstrou hesitação**, não para todo abandono.

Alternativa recomendada: manter os 2 estágios atuais (15 min e 24h) e ativar a oferta grátis **apenas** (a) dentro da conversa, pelo agente, quando o lead responde; ou (b) na frente 2 (follow-up de leads antigos, +7 dias), que já é um público diferente e um template separado. Assim a oferta existe como 2ª/3ª mensagem, mas condicionada — sem estourar o teto de envios.

## Guardas obrigatórias em qualquer frente

- 1 sessão grátis por telefone, com cooldown (ex: 90 dias).
- Acesso limitado: só a sessão agendada, sem chat contínuo depois, sem orçamento de áudio.
- Nunca oferecer para quem já é ou já foi assinante pagante.
- Nunca oferecer antes de mostrar o preço — grátis é a segunda saída, não a primeira.

## Medição

- Ofertas feitas → aceitas → sessão realizada → assinatura paga.
- Comparar conversão do recovery com e sem oferta, e o custo por assinante das duas frentes.

## Detalhes técnicos

- `profiles`: novas colunas `free_session_offered_at`, `free_session_claimed_at`, `free_session_source` (`recovery_agent` | `old_lead_followup`).
- `sessions`: marcar a sessão gratuita (`session_type = 'livre'` + flag em metadata ou nova coluna `is_free_taster`), respeitando o trigger `prevent_duplicate_sessions`.
- `recovery-agent`: nova tag `[OFERECER_SESSAO_GRATIS]`, elegibilidade calculada no backend (não no LLM) e passada no contexto como "pode ou não pode oferecer".
- Aceite do lead → função que cria/atualiza o profile com status próprio (ex: `free_taster`) e agenda a sessão, reusando o contrato de tags já existente (`[AGENDAR_SESSAO:...]`).
- Nova função agendada para a frente 2, com template Twilio próprio e cap diário.
- Fim da sessão: `aura-agent` fecha com convite ao plano e link de checkout com UTM próprio.
- Painel admin: bloco com ofertas, aceites, sessões realizadas e conversão para pagante.
