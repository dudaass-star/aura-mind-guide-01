// Mensagem de suporte enviada de dentro do App: vira chamado no painel de suporte
// e segue o mesmo fluxo de rascunho/resposta por e-mail dos chamados recebidos por e-mail.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const TOPICS: Record<string, string> = { pagamento: "Pagamento e assinatura", sessoes: "Encontros e agenda", tecnico: "Problema no App", outro: "Outra dúvida" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: claimsData, error: claimsError } = jwt ? await supabase.auth.getClaims(jwt) : { data: null, error: true };
    const claims = claimsData?.claims;
    if (claimsError || claims?.role !== "authenticated" || typeof claims.sub !== "string") return json({ error: "Seu acesso expirou. Entre novamente." }, 401);

    const body = await req.json().catch(() => null) as { topic?: unknown; message?: unknown } | null;
    const topic = typeof body?.topic === "string" && TOPICS[body.topic] ? body.topic : null;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!topic || message.length < 5 || message.length > 2000) return json({ error: "Escreva sua mensagem (5 a 2000 caracteres)." }, 400);

    const { data: profile } = await supabase.from("profiles").select("user_id, name, email").eq("user_id", claims.sub).maybeSingle();
    const email = String(profile?.email || claims.email || "").trim().toLowerCase();
    if (!email) return json({ error: "Não encontramos um e-mail na sua conta para enviar a resposta." }, 400);

    // Limite simples contra envios repetidos: 5 chamados por dia por pessoa.
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count } = await supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("profile_user_id", claims.sub).gte("created_at", since);
    if ((count ?? 0) >= 5) return json({ error: "Você já enviou várias mensagens hoje. A equipe vai responder em breve." }, 429);

    const now = new Date().toISOString();
    const messageId = `<app-${crypto.randomUUID()}@olaaura.com.br>`;
    const subject = `[App] ${TOPICS[topic]}`;
    const { data: ticket, error: ticketError } = await supabase.from("support_tickets").insert({
      customer_email: email, customer_name: profile?.name || null, subject, status: "pending_review",
      profile_user_id: claims.sub, imap_message_id: messageId, last_inbound_at: now, needs_draft_regen: true,
    }).select("id").single();
    if (ticketError) throw ticketError;
    const { error: msgError } = await supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id, direction: "inbound", from_email: email, to_email: Deno.env.get("LOCAWEB_IMAP_USER") || "suporte@olaaura.com.br",
      subject, body_text: message, message_id_header: messageId, headers: { source: "app" },
    });
    if (msgError) throw msgError;

    // Rascunho gerado em segundo plano; envio segue as regras já existentes.
    supabase.functions.invoke("support-agent", { body: { ticket_id: ticket.id } }).catch((e) => console.error("[PORTAL-SUPPORT] draft", e));
    return json({ ok: true, email });
  } catch (e) {
    console.error("[PORTAL-SUPPORT]", e);
    return json({ error: "Não conseguimos enviar agora. Tente de novo em instantes." }, 500);
  }
});
