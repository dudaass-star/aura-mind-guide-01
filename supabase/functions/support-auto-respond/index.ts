import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) =>
  console.log(`[SUPPORT-AUTO-RESPOND] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

// Worker periódico: pega tickets pending_review com draft auto_eligible e responde sozinho.
// Aciona via cron (ex: a cada 2 min). Ações financeiras/sensíveis NUNCA caem aqui — o flag
// auto_eligible só é true quando o support-agent confirmou todos os critérios de segurança.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Body opcional: { dry_run?: boolean, max?: number }
    let dryRun = false;
    let max = 20;
    try {
      const body = await req.json();
      if (body && typeof body === "object") {
        dryRun = !!body.dry_run;
        if (typeof body.max === "number") max = Math.min(Math.max(body.max, 1), 100);
      }
    } catch {
      // sem body, ok
    }

    // Busca tickets ainda pendentes com draft atual elegível
    const { data: drafts, error: dErr } = await supabase
      .from("support_ticket_drafts")
      .select("id, ticket_id, draft_body, kb_top_score, support_tickets!inner(id, status, customer_email, subject, recurring_customer, auto_sent, imap_message_id, email_references)")
      .eq("is_current", true)
      .eq("auto_eligible", true)
      .eq("support_tickets.status", "pending_review")
      .eq("support_tickets.auto_sent", false)
      .eq("support_tickets.recurring_customer", false)
      .limit(max);

    if (dErr) throw dErr;
    if (!drafts || drafts.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, message: "Nenhum draft elegível" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    log("Drafts to auto-send", { count: drafts.length, dry_run: dryRun });

    if (dryRun) {
      return new Response(
        JSON.stringify({
          ok: true,
          dry_run: true,
          would_send: drafts.map((d: any) => ({
            ticket_id: d.ticket_id,
            kb_top_score: d.kb_top_score,
            subject: d.support_tickets?.subject,
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const smtpHost = Deno.env.get("LOCAWEB_SMTP_HOST") || "email-ssl.com.br";
    const smtpUser = Deno.env.get("LOCAWEB_IMAP_USER")!;
    const smtpPass = Deno.env.get("LOCAWEB_IMAP_PASSWORD")!;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpPass },
    });

    let sent = 0;
    let failed = 0;

    for (const draft of drafts as any[]) {
      const ticket = draft.support_tickets;
      try {
        // Re-confirma estado do ticket pra evitar corrida
        const { data: fresh } = await supabase
          .from("support_tickets")
          .select("status, auto_sent, recurring_customer")
          .eq("id", ticket.id)
          .single();

        if (!fresh || fresh.status !== "pending_review" || fresh.auto_sent || fresh.recurring_customer) {
          log("Skip stale ticket", { ticket_id: ticket.id, fresh });
          continue;
        }

        // Cabeçalhos de threading
        const { data: lastInbound } = await supabase
          .from("support_ticket_messages")
          .select("message_id_header, headers")
          .eq("ticket_id", ticket.id)
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const inReplyTo = lastInbound?.message_id_header || ticket.imap_message_id;
        const priorRefs =
          ticket.email_references || (lastInbound?.headers as any)?.["references"] || "";
        const refsChain = [priorRefs, inReplyTo].filter(Boolean).join(" ").trim();

        const subject = ticket.subject?.toLowerCase().startsWith("re:")
          ? ticket.subject
          : `Re: ${ticket.subject}`;

        const newMessageId = `<${crypto.randomUUID()}@olaaura.com.br>`;
        const htmlBody = draft.draft_body.replace(/\n/g, "<br>");

        const info = await transporter.sendMail({
          from: `"Equipe Aura" <${smtpUser}>`,
          to: ticket.customer_email,
          subject,
          text: draft.draft_body,
          html: htmlBody,
          messageId: newMessageId,
          inReplyTo: inReplyTo || undefined,
          references: refsChain || undefined,
          headers: { "Reply-To": smtpUser },
        });

        await supabase.from("support_ticket_messages").insert({
          ticket_id: ticket.id,
          direction: "outbound",
          from_email: smtpUser,
          to_email: ticket.customer_email,
          subject,
          body_text: draft.draft_body,
          body_html: htmlBody,
          headers: {
            "in-reply-to": inReplyTo,
            "references": refsChain,
            "message-id": newMessageId,
            "x-aura-auto-sent": "true",
          },
          message_id_header: newMessageId,
          in_reply_to: inReplyTo,
          sent_by: null,
        });

        await supabase
          .from("support_tickets")
          .update({
            status: "replied",
            auto_sent: true,
            auto_sent_at: new Date().toISOString(),
            last_outbound_at: new Date().toISOString(),
          })
          .eq("id", ticket.id);

        sent++;
        log("Auto-sent", { ticket_id: ticket.id, message_id: info.messageId });
      } catch (e) {
        failed++;
        log("Send failed", { ticket_id: ticket.id, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, total: drafts.length }), {
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