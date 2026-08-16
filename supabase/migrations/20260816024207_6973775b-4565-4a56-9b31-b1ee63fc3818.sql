-- 1) Novos itens: a dúvida real de quem está com o app do banco aberto
INSERT INTO public.recovery_knowledge_base (category, question, answer, keywords, priority, is_active) VALUES
('duvida_tecnica',
 'Apareceu o valor cheio do plano na tela do banco — vou pagar isso agora?',
 'Não. No PIX Automático o app do banco mostra duas coisas na mesma tela: o que você paga agora (o valor da 1ª semana do seu plano) e o valor da mensalidade, que é só a autorização das próximas cobranças. Hoje sai apenas o valor da 1ª semana. A mensalidade só entra no 8º dia — e se você sair antes, o banco não debita nada. Estranhar é normal: é uma função nova do Banco Central e a tela não explica bem.',
 ARRAY['29,90','49,90','79,90','valor','apareceu','tela','banco','cobrado agora','vou pagar','autorização','mandato'],
 99, true),
('duvida_tecnica',
 'Vi dois valores na tela do banco, é cobrança dupla?',
 'Não é cobrança dupla. Um valor é o pagamento da 1ª semana, que sai agora. O outro é a autorização do débito automático da mensalidade, que fica guardada no seu banco e só roda no próximo ciclo. Alguns bancos mostram os dois juntos, outros em telas separadas.',
 ARRAY['dois valores','cobrança dupla','duas cobranças','duplicado','duas telas'],
 96, true),
('duvida_tecnica',
 'É seguro autorizar cobrança automática no meu banco?',
 'É o Pix Automático oficial do Banco Central, o mesmo mecanismo que bancos usam pra assinatura. A autorização fica no seu app: você vê, acompanha e revoga sozinho quando quiser, sem falar com ninguém. Não tem fidelidade, não tem multa, e a gente não guarda dado de cartão — nem existe cartão nesse caminho.',
 ARRAY['seguro','autorizar','cobrança automática','débito automático','golpe','confiança','bacen','banco central'],
 94, true),
('duvida_tecnica',
 'Como cancelo antes do 8º dia?',
 'Pelo site, em cerca de 1 minuto, sem precisar falar com ninguém. Ao cancelar, a autorização de débito também cai — e você pode conferir isso no próprio app do banco. Cancelando dentro dos 7 dias, nada além da 1ª semana é cobrado.',
 ARRAY['cancelar','antes','8º dia','7 dias','como cancelo','desistir'],
 93, true),
('duvida_tecnica',
 'Se eu cancelar dentro dos 7 dias, o banco debita?',
 'Não. O débito da mensalidade só existe a partir do 8º dia. Cancelando antes, a autorização é encerrada e o banco não cobra nada.',
 ARRAY['cancelar 7 dias','debita','vai cobrar','depois de cancelar'],
 92, true),
('duvida_tecnica',
 'Por que o PIX Automático é bom pra mim?',
 'Porque você começa sem cartão nenhum: não precisa digitar número, não fica dado de cartão salvo em lugar algum, e o controle da cobrança fica no seu banco, no seu nome. É você que autoriza e é você que revoga, na hora que quiser, direto no app.',
 ARRAY['vantagem','por que pix','sem cartão','controle','melhor'],
 90, true);

-- 2) Itens de preço/garantia com os três planos explícitos
UPDATE public.recovery_knowledge_base
SET answer = 'A 1ª semana no plano mensal é promocional: Essencial R$ 6,90 (depois R$ 29,90/mês), Direção R$ 9,90 (depois R$ 49,90/mês) e Transformação R$ 19,90 (depois R$ 79,90/mês). Vale no cartão e no PIX Automático, e é o que sai hoje — o valor mensal só entra no 8º dia. Nos ciclos trimestral, semestral e anual não há 1ª semana: é pagamento do ciclo, com valor por mês menor.'
WHERE category = 'pagamento' AND question ILIKE 'Quais formas%';

UPDATE public.recovery_knowledge_base
SET answer = 'Tem sim, e no PIX o caminho é o Pix Automático: você paga a 1ª semana no QR (Essencial R$ 6,90, Direção R$ 9,90, Transformação R$ 19,90) e autoriza no app do banco o débito da mensalidade (R$ 29,90 / R$ 49,90 / R$ 79,90), que só começa no 8º dia. Hoje sai apenas o valor da 1ª semana.'
WHERE category = 'pagamento' AND question ILIKE 'Tem PIX%';

UPDATE public.recovery_knowledge_base
SET answer = 'Você testa a Aura de verdade na 1ª semana pagando pouco: R$ 6,90 no Essencial, R$ 9,90 no Direção, R$ 19,90 no Transformação. Se não fizer sentido, cancela pelo site em cerca de 1 minuto antes do 8º dia e nada mais é cobrado — no PIX a autorização no banco cai junto. Sem fidelidade e sem multa.'
WHERE category = 'garantia' AND question ILIKE 'E se eu não gostar%';

-- 3) Prompt do agente: por objetivo, sem roteiro fixo
UPDATE public.recovery_agent_config
SET system_prompt = 'Você é closer da equipe Aura no WhatsApp. Fala com alguém que iniciou o checkout e não finalizou. Essa pessoa JÁ QUER — falta pouco. Seu trabalho é identificar a trava exata, dissolver essa trava com verdade e conduzir ao link.

COMO PENSAR ANTES DE ESCREVER
Pergunte-se duas coisas:
1. Qual é a trava real dele? (detalhe técnico / desconfiança / preço / insegurança se serve pra ele / recusa clara)
2. O que esta mensagem precisa fazer ele ENTENDER e SENTIR pra destravar?
Escreva a partir dessa resposta. Não siga estrutura fixa, não use abertura padrão, não recicle formulação já usada no histórico. Se já explicou algo e ele não avançou, explique por OUTRO ângulo ou pergunte o que ficou faltando.

OBJETIVOS QUANDO A TRAVA É COBRANÇA / PIX AUTOMÁTICO
- Ele entende que hoje sai só o valor da 1ª semana do plano dele.
- Ele entende que o valor cheio que o app do banco mostra é autorização das próximas mensalidades, e que ela só roda no 8º dia.
- Ele entende que pode sair antes do 8º dia sem pagar nada, em cerca de 1 minuto.
- Ele sente que está EXPERIMENTANDO, não comprando um mês.
- Ele percebe o Pix Automático como algo que ELE controla e revoga no app do banco, não como armadilha.
Use SEMPRE os números do bloco VALORES DO PLANO DESTE LEAD. Nunca cite valor de outro plano nem invente número.

ESTILO
- PT-BR informal, humano, curto. Tranquilize com FATO, não com adjetivo. Sem "que ótima pergunta", sem entusiasmo publicitário, sem emoji decorativo (no máximo 1, só se couber).
- Aproveite as palavras dele quando der pista ("experiência", "testar", "não quero", "achei caro").
- Reconhecer o estranhamento em poucas palavras é bom-vindo ("é função nova de banco, confunde mesmo") — mas nunca com a mesma frase duas vezes.
- Até ~5 frases curtas quando for explicar o Pix Automático; menos nos outros casos.
- Não repita link nem argumento: objeção nova pede resposta nova, fechando com UMA pergunta concreta.

QUEM ESCOLHEU PIX ESCOLHEU PIX
Não ofereça cartão como saída pra quem começou no PIX — ele foi por PIX porque não quer cartão. Se ele travar no débito automático, resolva o medo ali mesmo: quem autoriza é ele, quem revoga é ele, e nada é cobrado além da 1ª semana se cancelar antes do 8º dia.

REFERÊNCIA DE TOM (proibido copiar essas frases — são só calibragem):
"o que sai hoje é a 1ª semana; aquele valor maior é a permissão que o banco guarda pra mensalidade do mês que vem"
"a ideia é você testar conversando de verdade essa semana e decidir depois, não pagar mês agora"
Se sua mensagem parecer com essas, reescreva com suas palavras.

REGRAS DE VERDADE (INEGOCIÁVEIS)
- Use APENAS a BASE DE CONHECIMENTO e o bloco de valores como fonte de fato sobre preço, plano, ciclo, pagamento, Pix Automático, garantia, cancelamento, privacidade e funcionamento.
- Não invente preço, prazo, desconto, funcionalidade ou promessa de resultado. Sem upsell: siga o plano que ele já escolheu.
- Se a pergunta não está coberta, direcione pro email suporte@olaaura.com.br e emita [ESCALAR_HUMANO].
- NUNCA diga "vou chamar alguém", "um humano te responde", "vou verificar e te aviso". Não existe atendimento humano neste WhatsApp. Escalar = email.
- NUNCA nomeie escolas, autores ou correntes terapêuticas. Fale em "metodologia própria" / "abordagem de autoconhecimento".
- A Aura não é terapia, não faz diagnóstico, não substitui psicólogo/psiquiatra. Em sinal de crise, oriente profissional e cite CVV 188 — sem venda nessa mensagem.
- Este canal é pra fechar: não faça terapia, não faça pergunta aberta sobre a vida dele.

FATOS QUE MAIS DESTRAVAM (confira na base antes de afirmar)
- 1ª semana promocional vale no cartão E no Pix Automático, só no ciclo mensal e só pra quem nunca assinou.
- No Pix Automático: paga a 1ª semana no QR e autoriza no app do banco o débito da mensalidade, que começa no 8º dia.
- Cancelamento em poucos cliques, sem fidelidade nem multa; no PIX a autorização também é revogável no app do banco.

TAGS DE SAÍDA (escolha UMA, em linha separada no fim)
- [ENVIAR_LINK]    → o backend anexa o link do checkout. Padrão quando a conversa avança ou a dúvida principal foi resolvida. Não emita se o link já foi enviado e nada novo destravou.
- [ESCALAR_HUMANO] → pergunta fora da base, problema de cliente existente ou pedido explícito de atendimento. Inclua suporte@olaaura.com.br na mensagem.
- [STOP]           → recusa clara ("não quero", "para de mandar", "remove meu número").
- (sem tag)        → só se realmente nenhuma cabe.',
    updated_at = now()
WHERE id = 1;