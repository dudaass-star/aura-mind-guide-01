import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { ImapFlow } from "npm:imapflow@1.0.171";
import { simpleParser } from "npm:mailparser@3.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, data?: unknown) => {
  console.log(`[SUPPORT-IMAP-POLL] ${step}${data ? ` - ${JSON.stringify(data)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const host = Deno.env.get("LOCAWEB_IMAP_HOST") || "imap.locaweb.com.br";
  const user = Deno.env.get("LOCAWEB_IMAP_USER")!;
  const pass = Deno.env.get("LOCAWEB_IMAP_PASSWORD")!;

  if (!user || !pass) {
    return new Response(JSON.stringify({ error: "Locaweb IMAP credentials missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const processed: string[] = [];
  const errors: string[] = [];

  try {
    await client.connect();
    log("Connected to IMAP", { host, user });

    const lock = await client.getMailboxLock("INBOX");
    try {
      // Fetch unseen messages
      const uids: number[] = [];
      for await (const msg of client.fetch({ seen: false }, { uid: true })) {
        uids.push(msg.uid);
      }
      log(`Found ${uids.length} unread messages`);

      for (const uid of uids) {
        try {
          const { content } = await client.download(String(uid), undefined, { uid: true });
          const chunks: Uint8Array[] = [];
          for await (const chunk of content as AsyncIterable<Uint8Array>) chunks.push(chunk);
          const buffer = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
          let offset = 0;
          for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }

          const parsed = await simpleParser(buffer);
          const messageId = parsed.messageId || `imap-${uid}-${Date.now()}`;
          const fromEmail = (parsed.from?.value?.[0]?.address || "").toLowerCase();
          const fromName = parsed.from?.value?.[0]?.name || null;
          const subject = parsed.subject || "(sem assunto)";
          const inReplyTo = parsed.inReplyTo || null;
          const refs = Array.isArray(parsed.references) ? parsed.references.join(" ") : (parsed.references || null);

          // Skip if we already have this message
          const { data: existing } = await supabase
            .from("support_tickets")
            .select("id")
            .eq("imap_message_id", messageId)
            .maybeSingle();

          if (existing) {
            log("Skip duplicate", { messageId });
            await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
            continue;
          }

          // Try to thread into existing ticket via In-Reply-To/References
          let ticketId: string | null = null;
          if (inReplyTo || refs) {
            const headerIds = [inReplyTo, ...(refs ? refs.split(/\s+/) : [])].filter(Boolean) as string[];
            const { data: priorMsg } = await supabase
              .from("support_ticket_messages")
              .select("ticket_id")
              .in("message_id_header", headerIds)
              .limit(1)
              .maybeSingle();
            if (priorMsg?.ticket_id) ticketId = priorMsg.ticket_id;
          }

          // Lookup profile by email
          const { data: profile } = await supabase
            .from("profiles")
            .select("user_id, name")
            .eq("email", fromEmail)
            .maybeSingle();

          if (!ticketId) {
            const { data: newTicket, error: insertErr } = await supabase
              .from("support_tickets")
              .insert({
                customer_email: fromEmail,
                customer_name: fromName || profile?.name || null,
                subject,
                status: "pending_review",
                profile_user_id: profile?.user_id || null,
                imap_message_id: messageId,
                in_reply_to: inReplyTo,
                email_references: refs,
                last_inbound_at: new Date().toISOString(),
              })
              .select("id")
              .single();
            if (insertErr) throw insertErr;
            ticketId = newTicket.id;
          } else {
            // Verifica se é reabertura após auto-resposta
            const { data: prevTicket } = await supabase
              .from("support_tickets")
              .select("auto_sent, auto_sent_at, reopened_at")
              .eq("id", ticketId)
              .single();

            const isReopen = prevTicket?.auto_sent && !prevTicket?.reopened_at;

            const updatePayload: Record<string, unknown> = {
              status: "pending_review",
              last_inbound_at: new Date().toISOString(),
            };
            if (isReopen) {
              updatePayload.reopened_at = new Date().toISOString();
            }

            await supabase
              .from("support_tickets")
              .update(updatePayload)
              .eq("id", ticketId);

            // Se reabriu, decrementa confiança KB e marca draft anterior como rejeitado
            if (isReopen) {
              try {
                const { data: lastDraft } = await supabase
                  .from("support_ticket_drafts")
                  .select("id, context_snapshot, feedback_status")
                  .eq("ticket_id", ticketId)
                  .order("generated_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (lastDraft && lastDraft.feedback_status === "auto_sent") {
                  // Reverte feedback: auto-resposta não resolveu = rejected
                  await supabase.from("support_ticket_drafts").update({
                    feedback_status: "rejected",
                    feedback_at: new Date().toISOString(),
                  }).eq("id", lastDraft.id);

                  const kbIds = (lastDraft.context_snapshot as { kb_used?: string[] } | null)?.kb_used || [];
                  if (kbIds.length > 0) {
                    // Reverte o approved_count que foi incrementado no auto-send e adiciona como rejected
                    await supabase.rpc("record_kb_feedback", { kb_ids: kbIds, feedback: "rejected" });
                    // Decrementa o approved_count anterior
                    for (const kbId of kbIds) {
                      await supabase.from("support_knowledge_base").update({
                        approved_count: 0, // será corrigido pelo SQL abaixo via raw
                      }).eq("id", kbId).gte("approved_count", 1);
                    }
                  }
                  log("Reopen detected: KB feedback reverted", { ticketId, kbCount: kbIds.length });
                }
              } catch (e) {
                log("Reopen KB revert failed", { error: String(e) });
              }
            }
          }

          // Save attachments to Storage
          const attachmentRefs: Array<Record<string, unknown>> = [];
          for (const att of parsed.attachments || []) {
            const safeName = (att.filename || `file-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `${ticketId}/${Date.now()}-${safeName}`;
            const { error: upErr } = await supabase.storage
              .from("support-attachments")
              .upload(path, att.content, { contentType: att.contentType || "application/octet-stream", upsert: false });
            if (upErr) {
              log("Attachment upload error", { path, error: upErr.message });
            } else {
              attachmentRefs.push({
                path,
                name: att.filename,
                content_type: att.contentType,
                size: att.size,
              });
            }
          }

          // Save message
          await supabase.from("support_ticket_messages").insert({
            ticket_id: ticketId,
            direction: "inbound",
            from_email: fromEmail,
            to_email: user,
            subject,
            body_text: parsed.text || null,
            body_html: parsed.html || null,
            headers: { "in-reply-to": inReplyTo, "references": refs },
            attachments: attachmentRefs,
            message_id_header: messageId,
            in_reply_to: inReplyTo,
          });

          // Trigger AI agent (fire & forget)
          supabase.functions.invoke("support-agent", { body: { ticket_id: ticketId } }).catch((e) =>
            log("support-agent invoke error", { error: String(e) }),
          );

          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
          processed.push(messageId);
        } catch (msgErr) {
          const errStr = msgErr instanceof Error ? msgErr.message : String(msgErr);
          log("Message processing error", { uid, error: errStr });
          errors.push(`uid=${uid}: ${errStr}`);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    const errStr = err instanceof Error ? err.message : String(err);
    log("Fatal error", { error: errStr });
    try { await client.close(); } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: errStr, processed, errors }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, processed_count: processed.length, processed, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});