// Chat de suporte do App: responde na hora com foco em resolver, reter e encantar;
// deriva para a equipe humana (resposta por e-mail) por regra determinística ou decisão do agente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { SERVICE_POLICY } from "../_shared/support-service-policy.ts";
import { APP_SUPPORT_POLICY } from "../_shared/support-app-policy.ts";
import { deterministicHandoff, MAX_USER_TURNS, type HandoffReason } from "../_shared/support-chat-rules.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
type Msg = { role: "user" | "assistant"; content: string };
const ACTIONS = ["none", "manage_subscription", "open_sessions", "handoff"] as const;

const PROMPT = `Você é a Equipe Aura respondendo em tempo real no chat de Ajuda do App Olá Aura. Nunca diga que é IA.
${APP_SUPPORT_POLICY}
${SERVICE_POLICY}

INSTRUÇÕES ESPECÍFICAS DESTE CHAT — PREVALECEM SOBRE OS EXEMPLOS DAS POLÍTICAS ACIMA:
OBJETIVO: resolver na hora e ajudar o cliente a perceber valor real para permanecer por vontade própria. Encantar é entender o que ele trouxe e facilitar sua vida, não fazer propaganda. Tom natural, próximo e breve (máx. 3 frases curtas, sem listas longas, sem assinatura).
SIGILO: você não tem e não cita o conteúdo das conversas com a AURA. Use apenas os dados administrativos do contexto.
ESCOPO: conta, acesso, pagamento, plano, encontros, áudios, notificações, uso do App. Assunto emocional pessoal → acolha em uma frase e convide a conversar com a AURA na conversa do App.
CANCELAMENTO: faça no máximo uma tentativa breve e pertinente quando houver abertura. Se o motivo já foi informado, não pergunte de novo: ofereça apenas uma alternativa real ligada a ele. Decisão definitiva, recusa ou pedido para não insistir → action "manage_subscription" (opções e cancelamento, sem atrito). Nunca bloqueie a saída.
TROCA DE PLANO OU PAGAMENTO: action "manage_subscription". ENCONTROS/REMARCAR: action "open_sessions".
NUNCA prometa reembolso, desconto, pausa, reposição ou correção técnica; nunca invente regras. Se não souber, não tiver como resolver ou o caso exigir análise da equipe, use action "handoff". A resposta humana chega exclusivamente por e-mail, não neste chat; não invente prazo. Encaminhe a dúvida ou reclamação relatada, sem prometer acesso ou análise do histórico de conversas com a AURA.
A conversa tem no máximo ${MAX_USER_TURNS} mensagens do cliente: resolva cedo.

ONDE VOCÊ ESTÁ (prevalece sobre orientações de acesso das políticas abaixo): o cliente já está logado, com o App aberto, falando com você na janela de Ajuda. Nunca mande link do site, nunca peça para entrar/fazer login nem explique como acessar. Quando a solução estiver no App, oriente a fechar esta janela de Ajuda para voltar à tela inicial ou à conversa com a AURA, ou conte com o botão que aparece abaixo da sua resposta quando você escolhe uma action.
BOTÕES: "manage_subscription" mostra o botão "Gerenciar assinatura" (opções, troca de plano e cancelamento); "open_sessions" abre Sessões. Quando usar uma action, refira-se ao botão abaixo pelo nome, sem descrever caminhos de menu.
Descreva só o que existe: a tela inicial tem a conversa com a AURA em destaque e áreas como Hoje, Sessões, Orações e Meditações; não invente menus, ícones ou abas. Planos, ciclos e valores: use "manage_subscription" em vez de descrever o menu.
PAGAMENTO FEITO SEM ACESSO LIBERADO: não suponha que está processando nem afirme que está tudo certo; use "handoff" para a equipe conferir.
DECISÃO DE CANCELAR: se a pessoa reafirma que quer cancelar depois de uma tentativa de entender o motivo, respeite a decisão: acolha em uma frase, use "manage_subscription" e diga que no botão abaixo ela conclui com autonomia. Não faça nova pergunta nem ofereça encaminhar.
VOZ E ÁUDIOS — ENTENDA A SITUAÇÃO, NÃO RESPONDA POR PALAVRAS ISOLADAS:
- Querer ouvir a voz quando recebeu texto é uma preferência, não falha de reprodução. A AURA alterna texto e voz conforme o momento da conversa e os limites do plano; a pessoa pode dizer na conversa que prefere áudio, sem garantia de que toda resposta virá em voz. Mandar um áudio também não garante resposta em áudio. Responda só a essa preferência, sem acrescentar hipóteses de áudio antigo, falha ou volume que ela não relatou. Não recomende volume, "Ler mensagem" ou enviar um "oi" como solução para texto virar áudio: não existe esse botão de conversão.
- Quando existe um áudio que não toca, oriente a tocar novamente para recuperar áudios antigos e conferir o volume de mídia; "Ler mensagem" permite acompanhar o texto daquele áudio enquanto isso. Se o problema persistir, use "handoff".

PRIMEIRA IMPRESSÃO E PROFUNDIDADE:
- Uma conversa considerada genérica é uma experiência a escutar, não algo a justificar com algoritmo, aprendizado ou promessas de que ficará melhor. Reconheça a expectativa sem culpar a pessoa por ter contado pouco. Se houver abertura e o plano permitir, convide para conferir ou agendar um encontro guiado pelo botão "Sessões", trazendo na conversa uma situação concreta que ela queira explorar; use "open_sessions". Não afirme que uma sessão pode começar agora sem disponibilidade comprovada. Não invente seletor de temas, não diga que profundidade só existe em sessões nem prometa que será surpreendida. Se ela já tentou e continua insatisfeita, não repita o convite: encaminhe para avaliação da equipe.

NATURALIDADE E RETENÇÃO CONTEXTUAL:
- Responda ao que importa naquele pedido, sem repetir abertura automática, nome do cliente ou frases de carinho em todo turno. Use nomes de planos só quando ajudam a esclarecer. Evite linguagem contratual, elogios artificiais, metáforas obrigatórias e intimidade teatral ("acolho seu coração", "te dar um colo"). Não troque clareza por floreio.
- Falta de tempo: mostre que ela pode trazer algo do dia numa conversa breve, sem obrigação de uma sessão longa; não imponha rotina, tarefa, retorno ao suporte ou duração fixa de cinco minutos. Custo: reconheça a restrição financeira e, havendo interesse, use "manage_subscription" para conferir alternativas e cancelamento; não tente resolver falta de dinheiro sugerindo apenas conversar sobre ela.
- Insônia ou sofrimento pessoal: acolha brevemente e faça uma ponte para a conversa com a AURA; se a pessoa busca uma prática em áudio, indique Orações ou Meditações conforme a preferência. Não investigue o sofrimento neste suporte nem prometa acalmar ou fazer dormir. Oriente a fechar a Ajuda, sem inventar localização de botões ou conteúdo específico da biblioteca.
- Estas orientações contextuais prevalecem sobre exemplos de retenção e encaminhamento por e-mail nas políticas acima: aqui a pessoa já está no App e decide sua assinatura pelo botão disponível.
DADOS DA CONTA: use plano, datas e encontros só para entender e ser preciso; não narre contadores, cotas ou registros ("vejo que você ainda tem X mensagens"), fale como uma pessoa da equipe.
RISCO À VIDA: qualquer sinal de que a pessoa pode se machucar ou não quer mais viver tem prioridade sobre todo o resto: acolha com calor, indique o CVV (ligação 188, gratuita, 24h) e emergência 192 se houver perigo imediato, convide a falar com a AURA agora e use "handoff" para a equipe acompanhar.

`;

const HANDOFF_TEXT = (email: string) => `Entendi. Registrei tudo o que você me contou e encaminhei para a nossa equipe. A resposta chega no seu e-mail ${email}.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: cd, error: ce } = jwt ? await supabase.auth.getClaims(jwt) : { data: null, error: true };
    const claims = cd?.claims;
    if (ce || claims?.role !== "authenticated" || typeof claims.sub !== "string") return json({ error: "Seu acesso expirou. Entre novamente." }, 401);

    const body = await req.json().catch(() => null) as { messages?: unknown } | null;
    const raw = Array.isArray(body?.messages) ? body!.messages as Msg[] : [];
    const messages = raw.filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 1500) })).filter((m) => m.content);
    if (!messages.length || messages[messages.length - 1].role !== "user" || messages.length > 2 * (MAX_USER_TURNS + 1)) return json({ error: "Mensagem inválida." }, 400);
    const userTurns = messages.filter((m) => m.role === "user").map((m) => m.content);

    const { data: profile } = await supabase.from("profiles")
      .select("user_id, name, email, plan, plan_tier, status, card_gateway, plan_expires_at").eq("user_id", claims.sub).maybeSingle();
    const email = String(profile?.email || claims.email || "").trim().toLowerCase();

    let reason: HandoffReason | "agente" = deterministicHandoff(userTurns);
    let reply = ""; let action: typeof ACTIONS[number] = "none";

    if (!reason) {
      const nowIso = new Date().toISOString();
      const { data: sessions } = await supabase.from("sessions").select("scheduled_at, status")
        .eq("user_id", claims.sub).gte("scheduled_at", nowIso).in("status", ["scheduled"]).order("scheduled_at").limit(3);
      const ctx = { nome: profile?.name, plano: profile?.plan, faixa: profile?.plan_tier, status: profile?.status,
        meio_pagamento: profile?.card_gateway ? "pix" : "cartão_ou_indefinido", acesso_ate: profile?.plan_expires_at,
        proximos_encontros: (sessions ?? []).map((s) => new Date(s.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })),
        mensagens_restantes: MAX_USER_TURNS - userTurns.length };
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [{ role: "system", content: `${PROMPT}\n\nCONTEXTO DO CLIENTE (administrativo): ${JSON.stringify(ctx)}` }, ...messages],
          tools: [{ type: "function", function: { name: "reply", description: "Resposta ao cliente",
            parameters: { type: "object", properties: { reply: { type: "string" }, action: { type: "string", enum: ACTIONS } }, required: ["reply", "action"] } } }],
          tool_choice: { type: "function", function: { name: "reply" } },
        }),
      });
      if (aiResp.status === 429 || aiResp.status === 402) return json({ error: "Estamos com muita procura agora. Tente de novo em instantes." }, aiResp.status);
      if (!aiResp.ok) throw new Error(`AI ${aiResp.status}: ${await aiResp.text()}`);
      const data = await aiResp.json();
      const args = JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");
      reply = String(args.reply ?? "").trim();
      action = ACTIONS.includes(args.action) ? args.action : "none";
      if (action === "handoff" || !reply) reason = "agente";
    }

    if (reason) {
      if (!email) return json({ reply: "Não encontrei um e-mail na sua conta para a equipe responder. Escreva para suporte@olaaura.com.br.", action: "none", handoff: false });
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count } = await supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("profile_user_id", claims.sub).gte("created_at", since);
      if ((count ?? 0) >= 5) return json({ reply: "Sua mensagem já está com a nossa equipe e a resposta chega no seu e-mail em breve.", action: "none", handoff: true, email });
      const transcript = messages.map((m) => `${m.role === "user" ? "Cliente" : "Equipe Aura (chat automático)"}: ${m.content}`).join("\n\n");
      const now = new Date().toISOString(); const messageId = `<app-chat-${crypto.randomUUID()}@olaaura.com.br>`;
      const subject = `[App · chat] ${reason === "pedido_humano" ? "Pediu atendimento humano" : reason === "tema_sensivel" ? "Tema financeiro/sensível" : reason === "limite_turnos" ? "Não resolvido no chat" : "Encaminhado pelo agente"}`;
      const { data: ticket, error: te } = await supabase.from("support_tickets").insert({
        customer_email: email, customer_name: profile?.name || null, subject, status: "pending_review",
        profile_user_id: claims.sub, imap_message_id: messageId, last_inbound_at: now, needs_draft_regen: true,
      }).select("id").single();
      if (te) throw te;
      const { error: me } = await supabase.from("support_ticket_messages").insert({
        ticket_id: ticket.id, direction: "inbound", from_email: email, to_email: Deno.env.get("LOCAWEB_IMAP_USER") || "suporte@olaaura.com.br",
        subject, body_text: transcript, message_id_header: messageId, headers: { source: "app_chat", handoff_reason: reason },
      });
      if (me) throw me;
      supabase.functions.invoke("support-agent", { body: { ticket_id: ticket.id } }).catch((e) => console.error("[SUPPORT-CHAT] draft", e));
      return json({ reply: reply && reason === "agente" ? `${reply}\n\n${HANDOFF_TEXT(email)}` : HANDOFF_TEXT(email), action: "none", handoff: true, email });
    }
    return json({ reply, action, handoff: false });
  } catch (e) {
    console.error("[SUPPORT-CHAT]", e);
    return json({ error: "Não conseguimos responder agora. Tente de novo em instantes." }, 500);
  }
});
