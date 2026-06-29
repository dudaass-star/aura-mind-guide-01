
-- 1. Corrigir KB com info desatualizada sobre trial/PIX
UPDATE public.recovery_knowledge_base SET answer =
'Hoje a Aura tem 3 planos. No CARTÃO de crédito tem trial semanal: Essencial R$6,90 na 1ª semana e depois R$29,90/mês, Direção R$11,90 na 1ª semana e depois R$49,90/mês, Transformação R$24,90 na 1ª semana e depois R$99,90/mês. No PIX Automático (Bacen) não tem trial: começa direto no valor cheio do plano (Essencial R$29,90/mês, Direção R$49,90/mês, Transformação R$99,90/mês). Tem também trimestral, semestral e anual com desconto.',
updated_at = now()
WHERE id = '3c844d24-18bd-42ce-a13a-1ab73e2942a1';

UPDATE public.recovery_knowledge_base SET answer =
'O valor menor na 1ª semana é uma janela pra você testar de verdade sem compromisso, e existe SÓ no pagamento por CARTÃO de crédito (Essencial R$6,90, Direção R$11,90, Transformação R$24,90). Se em 7 dias não fizer sentido você cancela direto pelo portal sem perguntinha. No PIX Automático essa janela de teste não existe — a 1ª cobrança já é o valor cheio do plano.',
updated_at = now()
WHERE id = '63ecde38-46a5-44b4-84f1-6d863c930101';

-- (id correto da row "Por que tem um valor na 1ª semana")
UPDATE public.recovery_knowledge_base SET answer =
'O valor menor na 1ª semana é uma janela pra você testar de verdade sem compromisso, e existe SÓ no pagamento por CARTÃO de crédito (Essencial R$6,90, Direção R$11,90, Transformação R$24,90). Se em 7 dias não fizer sentido, você cancela direto pelo portal. No PIX Automático essa janela de teste não existe — a 1ª cobrança já é o valor cheio do plano.',
updated_at = now()
WHERE id = '63ecde38-46a5-44b4-84f1-6d863c930101';

UPDATE public.recovery_knowledge_base SET answer =
'Faz sentido pensar antes. Tem duas formas de entrar mais leve: (1) no CARTÃO o Essencial fica R$6,90 na 1ª semana — dá pra sentir como funciona antes de assumir R$29,90/mês, e você cancela pelo portal a qualquer momento; (2) no PIX Automático não tem trial, mas você entra direto no mensal cheio (R$29,90) sem precisar de cartão. Em qualquer um dos dois, cancelar é um clique no /meu-espaco.',
updated_at = now()
WHERE id = 'c93bad82-745c-4ecb-97e7-ff5c89a56565';

UPDATE public.recovery_knowledge_base SET answer =
'Tem sim. Funciona como PIX Automático Bacen: você escaneia 1 QR Code, paga a 1ª parcela e já autoriza a cobrança recorrente no seu banco — depois disso debita sozinho todo mês, sem precisar fazer nada. Importante: no PIX não existe trial de R$6,90 — a 1ª cobrança já é o valor cheio do plano (Essencial R$29,90, Direção R$49,90, Transformação R$99,90). O trial semanal é exclusivo do cartão de crédito.',
updated_at = now()
WHERE id = '4e142ab4-cca6-4124-ba46-84ea156a755f';

UPDATE public.recovery_knowledge_base SET answer =
'Aceitamos cartão de crédito (via Stripe) e PIX Automático (via Asaas/Bacen). No cartão tem trial semanal e dá pra escolher mensal, trimestral, semestral ou anual. No PIX é cobrança recorrente automática (você autoriza 1 vez e debita todo ciclo), também disponível em mensal, trimestral, semestral e anual. Boleto a gente não trabalha.',
updated_at = now()
WHERE id = 'ec841071-28c4-4552-b022-26101dc07f8b';

-- 2. Inserir categoria "beneficio" pra reforçar valor antes do link
INSERT INTO public.recovery_knowledge_base (category, question, answer, keywords, priority, is_active) VALUES
('beneficio',
 'A Aura tem meditações guiadas?',
 'Tem, e estão muito boas. A Aura percebe quando você precisa de uma pausa (ansiedade, sono ruim, estresse, falta de foco) e te manda um áudio guiado com a voz dela direto no WhatsApp, sem precisar abrir outro app. Você ouve ali mesmo, no meio da conversa, no momento que faz sentido.',
 ARRAY['meditacao','meditação','meditações','meditar','audio','áudio','pausa','ansiedade','sono','foco','estresse','relaxar'], 90, true),

('beneficio',
 'Tem sessões 1:1 com a Aura?',
 'Sim. Você marca uma sessão de 45 minutos pelo próprio WhatsApp, na hora que quiser. É uma conversa mais profunda com metodologia própria de autoconhecimento — diferente do bate-papo do dia a dia. Os planos Direção e Transformação têm mais sessões inclusas.',
 ARRAY['sessao','sessão','sessões','marcar','agendar','45 minutos','consulta','encontro'], 85, true),

('beneficio',
 'A Aura lembra do que a gente conversou?',
 'Sim. Ela tem memória de longo prazo: lembra do que importa pra você (rotina, vínculos, metas, o que já trabalharam juntos) e não recomeça do zero toda vez. Quanto mais você usa, mais ela te entende e dá direção certeira.',
 ARRAY['memoria','memória','lembra','lembrar','historico','histórico','contexto','personalizado'], 80, true),

('beneficio',
 'Existe um lugar pra ver meu histórico?',
 'Tem sim. O portal /meu-espaco (olaaura.com.br/meu-espaco) junta seu histórico de sessões, insights, meditações enviadas e jornadas em curso. Login sem senha — entra pelo link mágico que a Aura te envia.',
 ARRAY['portal','meu espaco','meu-espaco','historico','histórico','dashboard','app','site','login'], 75, true),

('beneficio',
 'A Aura tem jornadas guiadas?',
 'Tem. São trilhas curtas (ansiedade, sono, propósito, autoestima, relacionamentos) que a Aura conduz no seu ritmo, sem cronograma rígido. Você avança quando bate vontade — é diferente de curso, mais parecido com um caminho conversado.',
 ARRAY['jornada','jornadas','trilha','programa','curso','autoestima','proposito','propósito','relacionamento'], 75, true),

('beneficio',
 'A Aura puxa assunto ou só responde quando eu falo?',
 'Os dois. Ela faz check-in em momentos chave (não enche o saco, é proporcional) e também tá disponível 24/7 pra quando você precisar puxar conversa — texto ou áudio.',
 ARRAY['proativa','proativo','checkin','check-in','puxar assunto','sozinha','iniciativa'], 70, true),

('beneficio',
 'Posso mandar áudio em vez de texto?',
 'Pode, à vontade. Ela escuta seu áudio e às vezes responde por áudio também, com a voz da própria Aura, quando faz mais sentido que ler texto.',
 ARRAY['audio','áudio','voz','falar','gravar','mensagem de voz'], 65, true),

('beneficio',
 'A Aura funciona de madrugada / fim de semana?',
 '24/7. Não tem horário comercial, não tem fila, não tem agendar pra semana que vem. Bateu uma 2h da manhã, você fala com ela. É um dos pontos mais elogiados por quem usa.',
 ARRAY['24 horas','24/7','madrugada','fim de semana','disponivel','disponível','horario','horário','sempre'], 70, true);

-- 3. Atualizar system_prompt do agente
UPDATE public.recovery_agent_config SET system_prompt =
'Você é uma consultora breve da equipe Aura conversando no WhatsApp com alguém que iniciou o checkout de uma assinatura e não finalizou. Seu objetivo é tirar a dúvida/objeção que travou a pessoa, reforçar UM benefício relevante quando fizer sentido, e reenviar o link do checkout pra fechar.

CONTEXTO IMPORTANTE: essa pessoa JÁ DEMONSTROU INTERESSE (chegou ao checkout). Você não precisa convencer do zero, precisa destravar. Quando a dúvida principal estiver respondida, mencione UM benefício concreto da base (meditações guiadas no WhatsApp, sessões 1:1 de 45min, memória de longo prazo, portal, jornadas, 24/7) que case com o que a pessoa falou — não liste tudo, escolha o que cabe. Depois mande o link.

REGRAS DE VERDADE (INEGOCIÁVEIS):
- Use APENAS as informações da BASE DE CONHECIMENTO abaixo como fatos sobre planos, preços, garantia, funcionamento, pagamento, privacidade, benefícios e diferenciação vs terapia.
- Se a pergunta NÃO está coberta pela base, NÃO invente. Diga que esse detalhe específico é melhor responder pelo email suporte@olaaura.com.br e emita [ESCALAR_HUMANO].
- NUNCA diga "vou pedir pra alguém te responder", "vou chamar um humano" ou "alguém do time entra em contato". Aqui não há atendimento humano via WhatsApp. Sempre direcione para suporte@olaaura.com.br quando precisar escalar.
- Nunca invente preço, prazo, integração, funcionalidade, prazo de garantia, formas de pagamento.
- NUNCA nomeie escolas, autores ou correntes terapêuticas (Logoterapia, Frankl, Estoicismo, TCC etc.). Fale em "metodologia própria" / "abordagem de autoconhecimento".
- A Aura NÃO é terapia, NÃO faz diagnóstico, NÃO substitui psicólogo/psiquiatra. Se a pessoa estiver claramente em crise, oriente a buscar profissional e cite CVV 188.

REGRA DE PAGAMENTO (CRÍTICO):
- Trial semanal pago (Essencial R$6,90, Direção R$11,90, Transformação R$24,90) existe APENAS no CARTÃO de crédito (Stripe). Nunca prometa trial via PIX.
- PIX Automático (Bacen/Asaas) NÃO tem trial: a 1ª cobrança já é o valor cheio do plano, e a partir daí debita automaticamente todo ciclo.
- Se a pessoa pedir trial de R$6,90 via PIX, ofereça duas alternativas: (a) começar com o trial no cartão, ou (b) ir direto pro PIX mensal cheio sem trial. Nunca finja que o trial vale pra PIX.

ESTILO:
- PT-BR informal, 1 a 3 frases curtas, sem emoji decorativo (no máximo 1 se realmente couber).
- Direta. Sem "que ótima pergunta", sem encheção. Resposta útil + 1 benefício quando cabe + link.
- Não faça terapia, não explore sentimento aqui. Esse canal é resolver dúvida do checkout e converter.

TAGS DE SAÍDA (escolha UMA, no fim da última frase, em linha separada):
- [ENVIAR_LINK]   → o backend anexa o link do checkout na mensagem. Use quando a pessoa demonstrou interesse, tirou a dúvida principal, ou pediu o link. PADRÃO quando a conversa avança.
- [ESCALAR_HUMANO]→ use quando a pergunta foge da base de conhecimento, é problema técnico/financeiro de cliente existente, ou a pessoa pediu falar com alguém. Sua mensagem DEVE incluir suporte@olaaura.com.br.
- [STOP]          → use quando a pessoa recusou claramente ("não quero", "para de me mandar", "remove meu número"). Encerra automação.
- (sem tag)       → se nada se aplica, mas evite — quase sempre uma das três cabe.'
WHERE id = 1;
