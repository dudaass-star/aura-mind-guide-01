
-- 1) Singleton config
CREATE TABLE public.recovery_agent_config (
  id INT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  max_auto_replies INT NOT NULL DEFAULT 3,
  silent_hours_start INT NOT NULL DEFAULT 22,
  silent_hours_end INT NOT NULL DEFAULT 8,
  model TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  system_prompt TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recovery_agent_config_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.recovery_agent_config TO authenticated;
GRANT ALL ON public.recovery_agent_config TO service_role;

ALTER TABLE public.recovery_agent_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read recovery_agent_config"
  ON public.recovery_agent_config FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update recovery_agent_config"
  ON public.recovery_agent_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins insert recovery_agent_config"
  ON public.recovery_agent_config FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_recovery_agent_config_updated_at
  BEFORE UPDATE ON public.recovery_agent_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed singleton com prompt inicial
INSERT INTO public.recovery_agent_config (id, system_prompt) VALUES (
  1,
$PROMPT$Você é uma consultora breve da equipe Aura conversando no WhatsApp com alguém que iniciou o checkout de uma assinatura e não finalizou. Seu objetivo é tirar a dúvida ou objeção que travou a pessoa e, quando fizer sentido, reenviar o link do checkout.

REGRAS DE VERDADE (INEGOCIÁVEIS):
- Use APENAS as informações da BASE DE CONHECIMENTO abaixo como fatos sobre planos, preços, garantia, funcionamento, pagamento, privacidade e diferenciação vs terapia.
- Se a pergunta NÃO está coberta pela base, NÃO invente. Diga que esse detalhe específico é melhor responder pelo email suporte@olaaura.com.br e emita [ESCALAR_HUMANO].
- NUNCA diga "vou pedir pra alguém te responder", "vou chamar um humano" ou "alguém do time entra em contato". Aqui não há atendimento humano via WhatsApp. Sempre direcione para suporte@olaaura.com.br quando precisar escalar.
- Nunca invente preço, prazo, integração, funcionalidade, prazo de garantia, formas de pagamento.
- NUNCA nomeie escolas, autores ou correntes terapêuticas (Logoterapia, Frankl, Estoicismo, TCC etc.). Fale em "metodologia própria" / "abordagem de autoconhecimento".
- A Aura NÃO é terapia, NÃO faz diagnóstico, NÃO substitui psicólogo/psiquiatra. Se a pessoa estiver claramente em crise, oriente a buscar profissional e cite CVV 188.

ESTILO:
- PT-BR informal, 1 a 3 frases curtas, sem emoji decorativo (no máximo 1 se realmente couber).
- Direta. Sem "que ótima pergunta", sem encheção. Resposta útil.
- Não faça terapia, não explore sentimento aqui. Esse canal é resolver dúvida do checkout.

TAGS DE SAÍDA (escolha UMA, no fim da última frase, em linha separada):
- [ENVIAR_LINK]   → o backend anexa o link do checkout na mensagem. Use quando a pessoa demonstrou interesse, tirou a dúvida principal, ou pediu o link.
- [ESCALAR_HUMANO]→ use quando a pergunta foge da base de conhecimento, é problema técnico/financeiro de cliente existente, ou a pessoa pediu falar com alguém. Sua mensagem DEVE incluir suporte@olaaura.com.br.
- [STOP]          → use quando a pessoa recusou claramente ("não quero", "para de me mandar", "remove meu número"). Encerra automação.
- (sem tag)       → se nada se aplica, mas evite — quase sempre uma das três cabe.$PROMPT$
);

-- 2) Knowledge base
CREATE TABLE public.recovery_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  priority INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INT NOT NULL DEFAULT 0,
  approved_count INT NOT NULL DEFAULT 0,
  rejected_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recovery_kb_active_cat ON public.recovery_knowledge_base (is_active, category);
CREATE INDEX idx_recovery_kb_keywords ON public.recovery_knowledge_base USING GIN (keywords);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_knowledge_base TO authenticated;
GRANT ALL ON public.recovery_knowledge_base TO service_role;

ALTER TABLE public.recovery_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage recovery_kb"
  ON public.recovery_knowledge_base FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_recovery_kb_updated_at
  BEFORE UPDATE ON public.recovery_knowledge_base
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Novas colunas em recovery_conversations
ALTER TABLE public.recovery_conversations
  ADD COLUMN IF NOT EXISTS auto_reply_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS needs_human BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_bot_reply_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_paused_reason TEXT;

-- 4) Seed KB inicial
INSERT INTO public.recovery_knowledge_base (category, question, answer, keywords, priority) VALUES
('preco', 'Quanto custa cada plano?',
'Hoje a Aura tem 3 planos, todos com 7 dias iniciais mais baratos: Essencial R$6,90 na 1ª semana e depois R$29,90/mês. Direção R$9,90 na 1ª semana e depois R$49,90/mês (inclui 4 sessões especiais de 45min/mês). Transformação R$19,90 na 1ª semana e depois R$79,90/mês (8 sessões/mês + prioridade).',
ARRAY['preço','preco','valor','quanto','custa','plano','planos','mensalidade','mensal','semana'], 100),

('preco', 'Por que tem um valor na primeira semana e outro depois?',
'A primeira semana é uma janela mais barata pra você testar de verdade sem compromisso. Se em 7 dias não fizer sentido, é só cancelar dentro do app/portal e nada é cobrado a mais. Depois desses 7 dias entra o valor cheio do plano.',
ARRAY['trial','teste','primeira semana','semana','7 dias','desconto','barato'], 80),

('garantia', 'E se eu não gostar? Tem garantia ou reembolso?',
'Você pode cancelar a qualquer momento direto pelo seu portal, sem ligação, sem ficar pedindo. Cancelando antes do fim da primeira semana você não paga o valor cheio. Não trabalhamos com fidelidade nem multa.',
ARRAY['garantia','reembolso','cancela','cancelar','desistir','arrepender','fidelidade','multa'], 100),

('como_funciona', 'Como a Aura funciona no dia a dia?',
'Toda a conversa acontece dentro do WhatsApp, 24/7. Você fala por texto ou áudio quando precisar, e a Aura lembra do que você já conversou antes. Nos planos Direção e Transformação você também tem sessões especiais de 45 minutos, com resumo escrito no fim.',
ARRAY['como funciona','funciona','usar','uso','dia a dia','rotina','quando posso falar'], 90),

('como_funciona', 'Precisa baixar algum aplicativo?',
'Não precisa. Funciona dentro do próprio WhatsApp que você já usa. Tem também um portal web (olaaura.com.br/meu-espaco) pra ouvir meditações e ver resumos das sessões, mas o dia a dia é tudo no WhatsApp mesmo.',
ARRAY['app','aplicativo','baixar','download','instalar','play store','app store'], 70),

('como_funciona', 'A Aura é uma pessoa ou uma IA?',
'A Aura é uma assistente baseada em inteligência artificial, com metodologia própria de autoconhecimento. Não é uma pessoa, e a gente é transparente sobre isso. Mesmo assim, ela lembra do seu contexto e adapta a conversa pra você, não dá resposta genérica.',
ARRAY['ia','inteligencia artificial','robô','robo','pessoa','humano','chatbot','bot'], 70),

('pagamento', 'Quais formas de pagamento aceitam?',
'Por enquanto só cartão de crédito. PIX, boleto e débito ainda não estão disponíveis. O cartão é cobrado de forma recorrente e você pode trocar/cancelar a qualquer momento pelo portal.',
ARRAY['pix','boleto','cartão','cartao','débito','debito','pagamento','pagar','forma'], 90),

('pagamento', 'É seguro colocar meu cartão?',
'Sim. O pagamento é processado direto pela Stripe, padrão internacional de checkout. A gente não armazena o número do seu cartão nos nossos servidores.',
ARRAY['seguro','segurança','seguranca','stripe','cartão seguro','golpe','roubo'], 60),

('seguranca', 'Minhas conversas ficam privadas?',
'Suas conversas ficam vinculadas só ao seu número e usadas pra adaptar a Aura ao seu contexto. A gente não vende dado, não compartilha conteúdo de conversa com terceiros e você pode pedir exclusão a qualquer momento por suporte@olaaura.com.br.',
ARRAY['privado','privacidade','dados','dado','lgpd','vazar','seguro','compartilha'], 80),

('tecnico', 'Aura substitui terapia?',
'Não. A Aura é uma ferramenta de autoconhecimento e direção prática no dia a dia, não faz diagnóstico nem psicoterapia. Ela complementa muito bem um processo terapêutico, mas não substitui psicólogo ou psiquiatra.',
ARRAY['terapia','psicólogo','psicologo','psiquiatra','tratamento','diagnóstico','diagnostico','substitui'], 90),

('objecao_valor', 'Tá caro pra mim agora',
'Faz sentido pensar antes. Se quiser começar mais leve, o plano Essencial fica R$6,90 na primeira semana — dá pra sentir como funciona sem peso, e cancelar sozinho pelo portal se não for pra você.',
ARRAY['caro','dinheiro','sem grana','apertado','não tenho','nao tenho','condição','condicao'], 70),

('objecao_tempo', 'Não sei se vou ter tempo de usar',
'A ideia é o contrário: você fala quando precisar, mesmo que sejam 2 minutos no fim do dia. Não tem aula, não tem cronograma. A própria Aura puxa o assunto de volta nos dias em que faz sentido.',
ARRAY['tempo','correria','ocupado','agenda','rotina','sem tempo'], 60),

('comparacao', 'Qual a diferença entre os planos?',
'Essencial (R$29,90/mês) é conversa ilimitada com a Aura, check-in diário e memória de longo prazo. Direção (R$49,90/mês) adiciona 4 sessões especiais de 45min por mês, com resumo escrito. Transformação (R$79,90/mês) sobe pra 8 sessões/mês e tem prioridade no atendimento.',
ARRAY['diferença','diferenca','comparação','comparacao','essencial','direção','direcao','transformação','transformacao','planos'], 80),

('tecnico', 'Já fui cliente, como volto?',
'Se você já teve conta antes é melhor entrar em contato pelo email suporte@olaaura.com.br pra gente reativar sua assinatura sem criar duplicidade.',
ARRAY['voltar','reativar','já fui','ja fui','cliente antigo','tinha conta'], 50);
