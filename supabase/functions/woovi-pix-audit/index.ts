// Edge function (cron): auditoria/reconciliação do trilho PIX Automático da Woovi
// na jornada COMPOSTA (cobrança de entrada `cob` + mandato `rec` no mesmo QR).
//
// Por que existe: o QR é único, mas o app do banco pode confirmar as duas partes
// em telas separadas (BB mostra junto; Nubank mostra o mandato e só depois a
// cobrança). Quem para no meio fica em estado parcial:
//   • mandato aprovado, entrada NÃO paga → nenhum acesso liberado → cutucar com a
//     cobrança de entrada (o mandato só debita em D+30, não perdemos nada).
//   • entrada paga, mandato NÃO aprovado → acesso liberado pelo webhook, mas sem
//     débito automático → pedir a autorização antes do fim do ciclo.
//
// Varreduras:
//   1. Conclusão parcial: entrada sem mandato / mandato sem entrada → 1 follow-up.
//   2. Replay: cobrança paga na Woovi sem `paid_at` local (webhook perdido).
//   3. Abandono: QR expirado sem entrada e sem mandato → cancela na Woovi.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  wooviFetch, brtDate,
  MANDATE_ACTIVE_STATUSES, WOOVI_PAID_STATUSES,
} from "../_shared/woovi.ts";
import { sendProactive } from "../_shared/whatsapp-provider.ts";
import { normalizeBrazilianPhone } from "../_shared/zapi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tempo mínimo antes de cutucar: dá folga pra quem está no meio do fluxo do banco.
const PARTIAL_GRACE_MINUTES = 20;

function money(cents: number): string {
  return (Number(cents || 0) / 100).toFixed(2).replace(".", ",");
}

/** Reenvia o pagamento pro webhook-woovi: fonte única de verdade da ativação. */
async function replayToWebhook(payload: Record<string, unknown>): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return false;
  try {
    const resp = await fetch(`${url}/functions/v1/webhook-woovi`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    return resp.ok;
  } catch (e) {
    console.warn("[woovi-pix-audit] replay falhou:", (e as Error).message);
    return false;
  }
}

async function notify(sub: Record<string, any>, text: string): Promise<boolean> {
  const raw = (sub.customer_phone as string) || "";
  if (!raw) return false;
  const phone = normalizeBrazilianPhone(raw);
  if (!phone) return false;
  try {
    const res = await sendProactive(phone, text, "reconnect", sub.user_id || undefined);
    return !!res?.success;
  } catch (e) {
    console.warn("[woovi-pix-audit] follow-up falhou:", (e as Error).message);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const dryRun = body.dry_run === true;

  const report: Record<string, unknown[]> = {
    entrada_pendente: [], mandato_pendente: [], recuperados: [], abandonados: [],
    reautorizacao: [], ciclo_sem_cobranca: [], erros: [],
  };

  try {
    const now = new Date();
    const graceBefore = new Date(now.getTime() - PARTIAL_GRACE_MINUTES * 60 * 1000).toISOString();
    const since = new Date(now.getTime() - 7 * 86400000).toISOString();

    const { data: composed } = await supabase
      .from("woovi_subscriptions")
      .select("*")
      .eq("creation_mode", "composed")
      .eq("creation_status", "completed")
      .gte("created_at", since)
      .is("replaced_by_subscription_id", null)
      .limit(300);

    for (const sub of composed || []) {
      const created = String(sub.created_at || "");
      if (created > graceBefore) continue;
      const approved = MANDATE_ACTIVE_STATUSES.includes(String(sub.status));
      const entryPaid = !!sub.entry_paid_at;

      // ---- 1a) Mandato aprovado, entrada não paga -------------------------
      if (approved && !entryPaid && !sub.entry_followup_sent_at) {
        let brCode: string | null = null;
        if (sub.entry_charge_correlation_id) {
          const r = await wooviFetch<Record<string, any>>(
            `/api/v1/charge/${encodeURIComponent(sub.entry_charge_correlation_id)}`,
          );
          const c = (r.data as Record<string, any>)?.charge || r.data;
          const status = String(c?.status || "").toUpperCase();
          if (["COMPLETED", "PAID", "CONFIRMED"].includes(status)) {
            // Webhook perdido: o dinheiro entrou. Replay e segue.
            if (!dryRun) {
              await replayToWebhook({
                event: "OPENPIX:CHARGE_COMPLETED",
                charge: { ...c, correlationID: sub.entry_charge_correlation_id, status },
              });
            }
            report.recuperados.push({ sub: sub.subscription_id, via: "entrada" });
            continue;
          }
          brCode = (c?.brCode as string) || null;
        }
        const text = `Oi, ${String(sub.customer_name || "").split(" ")[0] || "tudo bem"}! `
          + `Sua autorização de débito automático na Aura já está aprovada no seu banco, `
          + `mas o primeiro pagamento de R$ ${money(sub.trial_value_cents || sub.value_cents)} `
          + `não foi concluído — em alguns bancos ele aparece só na tela seguinte à autorização.\n\n`
          + (brCode ? `É só pagar este PIX pra liberar seu acesso agora:\n\n${brCode}` : "")
          + `\n\nSe preferir, me responde aqui que eu te ajudo.`;
        const sent = dryRun ? true : await notify(sub, text);
        if (!dryRun && sent) {
          await supabase.from("woovi_subscriptions")
            .update({ entry_followup_sent_at: new Date().toISOString() }).eq("id", sub.id);
        }
        report.entrada_pendente.push({ sub: sub.subscription_id, email: sub.customer_email, sent, dryRun });
        continue;
      }

      // ---- 1b) Entrada paga, mandato não aprovado -------------------------
      if (entryPaid && !approved && !sub.mandate_followup_sent_at) {
        const link = sub.authorization_url || null;
        const text = `Oi, ${String(sub.customer_name || "").split(" ")[0] || "tudo bem"}! `
          + `Seu pagamento de R$ ${money(sub.trial_value_cents || sub.value_cents)} entrou e seu acesso já está liberado. `
          + `Só faltou uma coisa: a autorização do débito automático de R$ ${money(sub.value_cents)}/mês no app do banco `
          + `(costuma aparecer como "Pix Automático").\n\n`
          + (link ? `Você autoriza por aqui:\n${link}\n\n` : "")
          + `Sem isso sua assinatura não renova — e eu não quero te perder no meio do caminho.`;
        const sent = dryRun ? true : await notify(sub, text);
        if (!dryRun && sent) {
          await supabase.from("woovi_subscriptions")
            .update({ mandate_followup_sent_at: new Date().toISOString() }).eq("id", sub.id);
        }
        report.mandato_pendente.push({ sub: sub.subscription_id, email: sub.customer_email, sent, dryRun });
        continue;
      }

      // ---- 3) Abandono total: QR expirado, nada pago, nada aprovado -------
      const expired = sub.qr_expires_at && String(sub.qr_expires_at) < now.toISOString();
      if (expired && !entryPaid && !approved
          && !["ABANDONADA", "CANCELADA", "REJEITADA"].includes(String(sub.status))) {
        if (!dryRun) {
          if (sub.subscription_id) {
            await wooviFetch(`/api/v1/subscriptions/${encodeURIComponent(sub.subscription_id)}/cancel`,
              { method: "PUT" }).catch(() => {});
          }
          if (sub.entry_charge_correlation_id) {
            await wooviFetch(`/api/v1/charge/${encodeURIComponent(sub.entry_charge_correlation_id)}`,
              { method: "DELETE" }).catch(() => {});
          }
          await supabase.from("woovi_subscriptions").update({
            status: "ABANDONADA",
            last_error: "QR expirou sem pagamento e sem autorização — cancelado pela auditoria",
          }).eq("id", sub.id);
        }
        report.abandonados.push({ sub: sub.subscription_id, email: sub.customer_email, dryRun });
      }
    }

    // ---- 2) Cobranças pagas na Woovi sem registro local -------------------
    const { data: openCharges } = await supabase
      .from("woovi_charges")
      .select("id, installment_id, subscription_id, status, paid_at")
      .is("paid_at", null)
      .gte("created_at", new Date(now.getTime() - 45 * 86400000).toISOString())
      .limit(200);
    for (const c of openCharges || []) {
      const r = await wooviFetch<Record<string, any>>(
        `/api/v1/charge/${encodeURIComponent(String(c.installment_id))}`,
      );
      await new Promise((res) => setTimeout(res, 250));
      if (!r.ok || !r.data) continue;
      const remote = ((r.data as Record<string, any>)?.charge || r.data) as Record<string, any>;
      const status = String(remote?.status || "").toUpperCase();
      if (!["COMPLETED", "PAID", "CONFIRMED"].includes(status)) continue;
      if (dryRun) {
        report.recuperados.push({ charge: c.installment_id, dryRun: true });
        continue;
      }
      const ok = await replayToWebhook({
        event: "OPENPIX:CHARGE_COMPLETED",
        charge: { ...remote, correlationID: String(c.installment_id), status },
      });
      if (ok) report.recuperados.push({ charge: c.installment_id, via: "cobranca" });
    }

    // ---- 4) Mandato revogado no banco ("churn silencioso") ----------------
    // O pagador pode cancelar a autorização direto no app do banco: a Woovi
    // muda o status do mandato e nenhum ciclo é mais debitado. Sem esta
    // varredura o usuário simplesmente para de pagar em silêncio.
    const REVOKED = ["CANCELADA", "REJEITADA", "EXPIRADA", "CANCELLED", "REJECTED", "EXPIRED"];
    const { data: liveSubs } = await supabase
      .from("woovi_subscriptions")
      .select("id, user_id, subscription_id, customer_phone, customer_email, status, plan, value_cents, reauth_notified_at")
      .in("status", MANDATE_ACTIVE_STATUSES)
      .is("replaced_by_subscription_id", null)
      .not("subscription_id", "is", null)
      .limit(300);

    for (const sub of liveSubs || []) {
      const r = await wooviFetch<Record<string, any>>(
        `/api/v1/subscriptions/${encodeURIComponent(String(sub.subscription_id))}`,
      );
      await new Promise((res) => setTimeout(res, 250));
      if (!r.ok || !r.data) continue;
      const remote = ((r.data as Record<string, any>)?.subscription || r.data) as Record<string, any>;
      const remoteStatus = String(remote?.status || "").toUpperCase();
      if (!REVOKED.includes(remoteStatus)) continue;

      // Cancelamento pedido no nosso portal já marca o profile — não é churn silencioso.
      let profileStatus: string | null = null;
      let authUid: string | null = null;
      if (sub.user_id) {
        // ATENÇÃO: woovi_subscriptions.user_id guarda o ID DA LINHA de profiles
        // (é assim que o webhook-woovi grava), não o uid de autenticação.
        const { data: p } = await supabase
          .from("profiles").select("user_id, status").eq("id", sub.user_id).maybeSingle();
        profileStatus = (p?.status as string) || null;
        authUid = (p?.user_id as string) || null;
      }
      const userStillActive = ["active", "trial", "trialing", "past_due"].includes(String(profileStatus));

      if (!dryRun) {
        await supabase.from("woovi_subscriptions").update({
          status: "CANCELADA",
          last_error: `Mandato ${remoteStatus} no banco do pagador (detectado pela auditoria)`,
        }).eq("id", sub.id);
        // Mandato morto não tem o que cobrar: encerra a cadência silenciosa
        // para o cliente não receber a oferta duas vezes (aqui e no dunning).
        await supabase.from("scheduled_tasks")
          .update({ status: "canceled", executed_at: new Date().toISOString() })
          .in("task_type", [
            "woovi_cycle_recycle", "woovi_next_cycle_cobr",
            "woovi_recovery_offer", "woovi_recovery_final",
          ])
          .eq("status", "pending")
          .contains("payload", { subscription_id: sub.subscription_id });
      }

      let sent = false;
      if (userStillActive && !sub.reauth_notified_at) {
        // Quem estava ativo e teve o mandato derrubado no banco volta pelo
        // primeiro degrau da escada de retenção (30% off), não pelo preço
        // cheio de /v2.
        let offerLink = "https://olaaura.com.br/v2";
        if (authUid) {
          await supabase.from("user_portal_tokens")
            .upsert({ user_id: authUid }, { onConflict: "user_id" });
          const { data: tk } = await supabase.from("user_portal_tokens")
            .select("token").eq("user_id", authUid).maybeSingle();
          if (tk?.token) {
            offerLink = `https://olaaura.com.br/cancelar?t=${tk.token}&offer=discount_30`;
          }
        }
        const text = [
          "Oi! O débito automático da sua assinatura foi cancelado no seu banco, então a próxima renovação não vai acontecer.",
          `Se você quiser continuar comigo, dá pra reautorizar em 1 minuto aqui: ${offerLink}`,
          "Se foi você que cancelou de propósito, tudo bem — só me avisa que eu paro de te lembrar.",
        ].join("\n\n");
        if (!dryRun) {
          sent = await notify(sub, text);
          await supabase.from("woovi_subscriptions")
            .update({ reauth_notified_at: new Date().toISOString() })
            .eq("id", sub.id);
        }
      }
      report.reautorizacao.push({
        sub: sub.subscription_id, email: sub.customer_email,
        remoteStatus, userStillActive, sent, dryRun,
      });
    }

    // ---- 5) Backstop de ciclo ---------------------------------------------
    // No trilho Woovi o débito do ciclo depende da Woovi gerar a cobrança E do
    // webhook chegar. Sem esta varredura, um webhook perdido vira usuário
    // usando de graça em silêncio. Para cada mandato vivo com ciclo vencido:
    //   • cobrança existe e está paga na Woovi → replay (fonte única é o webhook);
    //   • cobrança não existe na Woovi → registra a lacuna pra intervenção
    //     (não forçamos criação: cobrança fora do mandato é dinheiro sem contrato).
    const today = brtDate(now);
    const { data: dueSubs } = await supabase
      .from("woovi_subscriptions")
      .select("id, user_id, subscription_id, customer_email, next_charge_date, value_cents, status, last_error")
      .in("status", MANDATE_ACTIVE_STATUSES)
      .is("replaced_by_subscription_id", null)
      .not("subscription_id", "is", null)
      .not("next_charge_date", "is", null)
      .lte("next_charge_date", today)
      .limit(200);

    for (const sub of dueSubs || []) {
      const r = await wooviFetch<Record<string, any>>(
        `/api/v1/subscriptions/${encodeURIComponent(String(sub.subscription_id))}`,
      );
      await new Promise((res) => setTimeout(res, 250));
      if (!r.ok || !r.data) continue;
      const remote = ((r.data as Record<string, any>)?.subscription || r.data) as Record<string, any>;
      const remoteCharges: Record<string, any>[] = Array.isArray(remote?.charges)
        ? remote.charges
        : Array.isArray(remote?.installments) ? remote.installments : [];

      // Cobrança do ciclo já vencido (a partir da data prevista de débito).
      const cycleCharges = remoteCharges.filter((c) => {
        const when = String(c?.createdAt || c?.dueDate || c?.expiresDate || "").slice(0, 10);
        return !when || when >= String(sub.next_charge_date);
      });

      if (cycleCharges.length === 0) {
        if (!dryRun) {
          await supabase.from("woovi_subscriptions").update({
            last_error: `ciclo de ${sub.next_charge_date} sem cobrança na Woovi (detectado pela auditoria)`,
          }).eq("id", sub.id);
        }
        report.ciclo_sem_cobranca.push({
          sub: sub.subscription_id, email: sub.customer_email,
          ciclo: sub.next_charge_date, dryRun,
        });
        continue;
      }

      for (const c of cycleCharges) {
        const status = String(c?.status || "").toUpperCase();
        if (!WOOVI_PAID_STATUSES.includes(status)) continue;
        const correlationID = String(c?.correlationID || c?.identifier || c?.globalID || "");
        if (!correlationID) continue;
        const { data: known } = await supabase
          .from("woovi_charges").select("id, paid_at")
          .eq("installment_id", correlationID).maybeSingle();
        if (known?.paid_at) continue;
        if (dryRun) {
          report.recuperados.push({ charge: correlationID, via: "ciclo", dryRun: true });
          continue;
        }
        const ok = await replayToWebhook({
          event: "OPENPIX:CHARGE_COMPLETED",
          charge: { ...c, correlationID, status },
          subscription: { globalID: remote?.globalID, correlationID: remote?.correlationID },
        });
        if (ok) report.recuperados.push({ charge: correlationID, via: "ciclo" });
      }

      // Rede de segurança da recuperação silenciosa: se nenhuma cobrança do
      // ciclo vencido está paga e o webhook de "ciclo não pago" nunca chegou,
      // a cadência nunca começaria — o cliente pararia de pagar em silêncio.
      const anyPaid = cycleCharges.some((c) =>
        WOOVI_PAID_STATUSES.includes(String(c?.status || "").toUpperCase())
      );
      if (!anyPaid) {
        const { data: pending } = await supabase.from("scheduled_tasks")
          .select("id")
          .in("task_type", [
            "woovi_cycle_recycle", "woovi_next_cycle_cobr",
            "woovi_recovery_offer", "woovi_recovery_final",
          ])
          .eq("status", "pending")
          .contains("payload", { subscription_id: sub.subscription_id })
          .limit(1);
        const alreadyRunning = Array.isArray(pending) && pending.length > 0;
        if (!alreadyRunning) {
          let authUserId: string | null = null;
          if (sub.user_id) {
            const { data: p } = await supabase.from("profiles")
              .select("user_id").eq("id", sub.user_id).maybeSingle();
            authUserId = (p?.user_id as string) || null;
          }
          if (authUserId && !dryRun) {
            await supabase.from("scheduled_tasks").insert({
              user_id: authUserId,
              task_type: "woovi_cycle_recycle",
              execute_at: new Date().toISOString(),
              status: "pending",
              payload: {
                provider: "woovi",
                subscription_id: sub.subscription_id,
                attempt: 1,
                started_at: new Date().toISOString(),
                source: "audit_backstop",
              },
            });
          }
          report.ciclo_sem_cobranca.push({
            sub: sub.subscription_id, email: sub.customer_email,
            ciclo: sub.next_charge_date, recuperacao_aberta: !!authUserId, dryRun,
          });
        }
      }
    }

    return new Response(JSON.stringify({ dryRun, report }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[woovi-pix-audit] erro:", err);
    report.erros.push(String(err));
    return new Response(JSON.stringify({ report }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});