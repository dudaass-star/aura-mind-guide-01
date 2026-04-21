import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) => console.log(`[SUPPORT-SEND-REPLY] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate admin
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) throw new Error("Unauthenticated");
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    if (!isAdmin) throw new Error("Not an admin");

    const { ticket_id, body, mark_status } = await req.json();
    if (!ticket_id || !body) throw new Error("ticket_id and body required");

    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets").select("*").eq("id", ticket_id).single();
    if (tErr || !ticket) throw new Error("Ticket not found");

    // Build references chain (last inbound message ID + previous chain)
    const { data: lastInbound } = await supabase
      .from("support_ticket_messages")
      .select("message_id_header, headers")
      .eq("ticket_id", ticket_id)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const inReplyTo = lastInbound?.message_id_header || ticket.imap_message_id;
    const priorRefs = ticket.email_references || (lastInbound?.headers as any)?.["references"] || "";
    const refsChain = [priorRefs, inReplyTo].filter(Boolean).join(" ").trim();

    const smtpHost = Deno.env.get("LOCAWEB_SMTP_HOST") || "email-ssl.com.br";
    const smtpUser = Deno.env.get("LOCAWEB_IMAP_USER")!;
    const smtpPass = Deno.env.get("LOCAWEB_IMAP_PASSWORD")!;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const subject = ticket.subject?.toLowerCase().startsWith("re:")
      ? ticket.subject
      : `Re: ${ticket.subject}`;

    const newMessageId = `<${crypto.randomUUID()}@olaaura.com.br>`;
    const htmlBody = body.replace(/\n/g, "<br>");

    const info = await transporter.sendMail({
      from: `"Equipe Aura" <${smtpUser}>`,
      to: ticket.customer_email,
      subject,
      text: body,
      html: htmlBody,
      messageId: newMessageId,
      inReplyTo: inReplyTo || undefined,
      references: refsChain || undefined,
      headers: { "Reply-To": smtpUser },
    });

    log("Email sent", { messageId: info.messageId, accepted: info.accepted });

    await supabase.from("support_ticket_messages").insert({
      ticket_id,
      direction: "outbound",
      from_email: smtpUser,
      to_email: ticket.customer_email,
      subject,
      body_text: body,
      body_html: htmlBody,
      headers: { "in-reply-to": inReplyTo, "references": refsChain, "message-id": newMessageId },
      message_id_header: newMessageId,
      in_reply_to: inReplyTo,
      sent_by: userData.user.id,
    });

    await supabase.from("support_tickets").update({
      status: mark_status || "replied",
      last_outbound_at: new Date().toISOString(),
    }).eq("id", ticket_id);

    return new Response(JSON.stringify({ ok: true, message_id: newMessageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("Error", { error: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});