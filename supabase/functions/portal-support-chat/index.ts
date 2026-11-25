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
OBJETIVO: resolver na hora, encantar e manter o cliente. Tom caloroso, humano, breve (máx. 3 frases curtas, sem listas longas, sem assinatura).
SIGILO: você não tem e não cita o conteúdo das conversas com a AURA. Use apenas os dados administrativos do contexto.
ESCOPO: conta, acesso, pagamento, plano, encontros, áudios, notificações, uso do App. Assunto emocional pessoal → acolha em uma frase e convide a conversar com a AURA na conversa do App.
CANCELAMENTO: primeiro pergunte com interesse genuíno o motivo e mostre valor concreto ligado à dor; se persistir, use action "manage_subscription" (lá ficam as opções e o cancelamento, sem atrito). Nunca bloqueie a saída.
TROCA DE PLANO OU PAGAMENTO: action "manage_subscription". ENCONTROS/REMARCAR: action "open_sessions".
NUNCA prometa reembolso, desconto, pausa, reposição ou correção técnica; nunca invente regras. Se não souber, não tiver como resolver ou o caso exigir análise da equipe, use action "handoff".
A conversa tem no máximo ${MAX_USER_TURNS} mensagens do cliente: resolva cedo.

${APP_SUPPORT_POLICY}
${SERVICE_POLICY}`;

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
