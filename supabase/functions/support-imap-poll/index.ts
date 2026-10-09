import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { ImapFlow } from "npm:imapflow@1.0.171";
import PostalMime from "npm:postal-mime@2.4.3";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";

const optionsSchema = z.object({
  reprocess_seen: z.boolean().optional().default(false),
  since_days: z.number().int().min(1).max(90).optional().default(21),
  after_uid: z.number().int().min(0).optional().default(0),
  inspect_only: z.boolean().optional().default(false),
});
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const log = (step: string, data?: unknown) => {
  console.log(`[SUPPORT-IMAP-POLL] ${step}${data ? ` - ${JSON.stringify(data)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key || !anon) return reply({ error: "Configuração de suporte ausente" }, 500);
  const supabase = createClient(url, key);
  const internal = req.headers.get("x-internal-secret");
  const { data: secret } = internal ? await supabase.rpc("get_admin_metrics_snapshot_secret") : { data: null };
  if (!internal || !secret || internal !== secret) {
    const auth = req.headers.get("Authorization") || "";
    const clientAuth = createClient(url, anon);
    const { data, error } = await clientAuth.auth.getClaims(auth.replace(/^Bearer /, ""));
    if (error || !data?.claims?.sub) return reply({ error: "Não autenticado" }, 401);
    const { data: admin, error: roleError } = await supabase.rpc("has_role", { _user_id: data.claims.sub, _role: "admin" });
    if (roleError || !admin) return reply({ error: "Acesso restrito" }, 403);
  }
  const raw = await req.text();
  let body: unknown;
  try { body = raw ? JSON.parse(raw) : {}; } catch { return reply({ error: "Dados inválidos" }, 400); }
  const options = optionsSchema.safeParse(body);
  if (!options.success) return reply({ error: "Opções de leitura inválidas" }, 400);
  const { reprocess_seen: reprocessSeen, since_days: sinceDays, after_uid: afterUid, inspect_only: inspectOnly } = options.data;

  const host = Deno.env.get("LOCAWEB_IMAP_HOST") || "imap.locaweb.com.br";
  const user = Deno.env.get("LOCAWEB_IMAP_USER");
  const pass = Deno.env.get("LOCAWEB_IMAP_PASSWORD");

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
  let remaining = 0;
  let lastUid = afterUid;
  const started = Date.now();

  try {
    await client.connect();
    log("Connected to IMAP", { host, user });

    const lock = await client.getMailboxLock("INBOX");
    try {
      // Pesquisa UIDs sem baixar corpos; lotes pequenos evitam ultrapassar a CPU da função.
      const searchCriteria = reprocessSeen
        ? { since: new Date(Date.now() - sinceDays * 86400000) }
        : { seen: false };
      const found = await client.search(searchCriteria, { uid: true });
      const uids = (found || []).filter(uid => uid > afterUid).sort((a, b) => a - b);
      remaining = uids.length;
      log("Mensagens encontradas", { count: uids.length, reprocessSeen });
      if (inspectOnly) return reply({ ok: true, version: 2, pending: uids.length });

      for (const uid of uids.slice(0, 3)) {
        if (Date.now() - started > 45000) break;
        lastUid = uid;
        try {
          log("Iniciando leitura", { uid });
          // fetchOne retorna o corpo pronto e evita o stream Node/Web incompatível no Deno.
          const message = await client.fetchOne(String(uid), { size: true, internalDate: true, envelope: true }, { uid: true });
          if (!message) throw new Error("Mensagem indisponível");
          log("Tamanho da mensagem", { uid, bytes: message.size });
          if (message.size > 35 * 1024 * 1024) throw new Error("Mensagem acima de 35 MB; preservada para leitura manual");
          const full = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!full || !full.source) throw new Error("Corpo não recebido");
          // Mensagens grandes preservam o original completo sem decodificar anexos na CPU limitada.
          const largeMessage = message.size > 6 * 1024 * 1024;
          const parsed = largeMessage ? {
            messageId: message.envelope?.messageId,
            from: message.envelope?.from?.[0],
            subject: message.envelope?.subject,
            inReplyTo: message.envelope?.inReplyTo,
            references: undefined,
            text: "E-mail grande: o conteúdo e os anexos foram preservados integralmente no arquivo original .eml abaixo. Abra o arquivo para revisar a solicitação.",
            html: undefined,
            attachments: [{ filename: `email-original-${uid}.eml`, mimeType: "message/rfc822", content: full.source }],
          } : await PostalMime.parse(full.source);
          log("Mensagem interpretada", { uid, bytes: full.source.length });
          const messageId = parsed.messageId || `imap-inbox-${client.mailbox && client.mailbox.uidValidity}-${uid}`;
          const fromEmail = (parsed.from?.address || "").toLowerCase();
          const fromName = parsed.from?.name || null;
          const subject = parsed.subject || "(sem assunto)";
          const receivedAt = message.internalDate ? new Date(message.internalDate).toISOString() : new Date().toISOString();
          const inReplyTo = parsed.inReplyTo || null;
          const refs = parsed.references || null;

          // A identidade é conferida na mensagem, inclusive respostas encadeadas e recuperação de ticket sem corpo.
          const { data: existingMessage, error: duplicateError } = await supabase
            .from("support_ticket_messages").select("id").eq("message_id_header", messageId).limit(1).maybeSingle();
          if (duplicateError) throw duplicateError;
          if (existingMessage) {
            await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
            remaining--;
            continue;
          }
          const { data: existing, error: ticketError } = await supabase.from("support_tickets")
            .select("id").eq("imap_message_id", messageId).maybeSingle();
          if (ticketError) throw ticketError;

          // Try to thread into existing ticket via In-Reply-To/References
          let ticketId: string | null = existing?.id || null;
          if (!ticketId && (inReplyTo || refs)) {
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
                last_inbound_at: receivedAt,
                needs_draft_regen: true,
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
              last_inbound_at: receivedAt,
                needs_draft_regen: true,
            };
            if (isReopen) {
              updatePayload.reopened_at = new Date().toISOString();
            }

            const { error: updateError } = await supabase
              .from("support_tickets")
              .update(updatePayload)
              .eq("id", ticketId);
            if (updateError) throw updateError;

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
                    // Adiciona como rejected (o approved anterior fica como histórico do envio,
                    // mas o rejected reflete que a resposta não resolveu)
                    await supabase.rpc("record_kb_feedback", { kb_ids: kbIds, feedback: "rejected" });
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
              .upload(path, att.content, { contentType: att.mimeType || "application/octet-stream", upsert: false });
            if (upErr) {
              throw new Error(`Anexo não salvo: ${upErr.message}`);
            } else {
              attachmentRefs.push({
                path,
                name: att.filename,
                content_type: att.mimeType,
                size: att.content.byteLength,
              });
            }
          }

          // Save message
          const { error: messageError } = await supabase.from("support_ticket_messages").insert({
            ticket_id: ticketId,
            direction: "inbound",
            from_email: fromEmail,
            to_email: user,
            subject,
            body_text: parsed.text || null,
            body_html: parsed.html || null,
            headers: { "in-reply-to": inReplyTo, "references": refs, "manual-review": true },
            created_at: receivedAt,
            attachments: attachmentRefs,
            message_id_header: messageId,
            in_reply_to: inReplyTo,
          });

          if (messageError) throw messageError;
          // Entrada e recuperação só salvam mensagens: rascunho e ações dependem da revisão humana.
          const { error: draftError } = await supabase.from("support_ticket_drafts")
            .update({ auto_eligible: false }).eq("ticket_id", ticketId).eq("is_current", true);
          if (draftError) throw draftError;

          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
          processed.push(messageId);
          remaining--;
        } catch (msgErr) {
          const errStr = msgErr instanceof Error ? msgErr.message : String(msgErr);
          log("Message processing error", { uid, error: errStr });
          errors.push(`uid=${uid}: ${errStr}`);
        }
      }
    } finally {
      lock.release();
      try { await client.logout(); } catch { client.close(); }
    }

    // A conexão é encerrada no finally, inclusive em inspeções sem importação.
  } catch (err) {
    const errStr = err instanceof Error ? err.message : String(err);
    log("Fatal error", { error: errStr });
    try { await client.close(); } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: errStr, processed, errors }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: errors.length === 0, version: 2, processed_count: processed.length, processed, errors, remaining, last_uid: lastUid }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});