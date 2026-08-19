// Edge function (cron): auditoria/reconciliação do trilho PIX Automático da Woovi
// na jornada COMPOSTA (cobrança de entrada `cob` + mandato `rec` no mesmo QR).
//
// Por que existe: o QR é único, mas o app do banco pode confirmar as duas partes
// em telas separadas (BB mostra junto; Nubank mostra o mandato e só depois a
// cobrança). Quem para no meio fica em estado parcial:
//   • mandato aprovado, entrada NÃO paga → nenhum acesso liberado → cutucar com a
//     cobrança de entrada. ATENÇÃO: no trial o 1º débito do mandato cai em D+7
//     (não mais D+30), então se o QR expirar sem a entrada paga cancelamos o
//     mandato — senão o cliente é debitado em R$ 29,90 sem nunca ter tido acesso.
//   • entrada paga, mandato NÃO aprovado → acesso liberado pelo webhook, mas sem
//     débito automático. A janela é de 7 dias (trial): 1º lembrete imediato,
//     2º perto do 5º dia e, passado o 7º, entra na régua de retenção.
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

/** Trial pago do PIX: entrada compra 7 dias e o 1º débito do mandato cai em D+7. */
const TRIAL_DAYS = 7;
/** Dia da janela em que mandamos o 2º (e último) lembrete de autorização. */
const MANDATE_REMINDER2_DAY = 5;

function daysSince(iso: string): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return (Date.now() - t) / 86400000;
}

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

// deno-lint-ignore no-explicit-any
type Supa = any;

/**
 * Follow-up proativo do trilho PIX.
 *
 * Cuidado importante: fora da janela de 24h o WhatsApp só aceita template, e o
 * template `reconnect` carrega UMA variável (o primeiro nome) — o texto longo
 * NÃO viaja nele. Antes, este follow-up mandava o texto direto e o cliente
 * recebia só o envelope ("Estou de volta! 💜 there"), sem link nenhum, porque
 * `sub.user_id` guarda profiles.id e não o user_id usado para resolver o nome.
 *
 * Agora: resolvemos o perfil de verdade (profiles.user_id), gravamos o texto em
 * `pending_insight` com o marcador [CONTENT] — que o process-webhook-message
 * entrega determinísticamente no clique do botão — e só então disparamos o
 * template. Se a janela de 24h estiver aberta, o texto sai inteiro na hora.
 */
async function notify(supabase: Supa, sub: Record<string, any>, text: string): Promise<boolean> {
  const raw = (sub.customer_phone as string) || "";
  if (!raw) return false;
  const phone = normalizeBrazilianPhone(raw);
  if (!phone) return false;

  let userId: string | undefined;
  try {
    let prof: { user_id: string } | null = null;
    if (sub.user_id) {
      const { data } = await supabase.from("profiles").select("user_id").eq("id", sub.user_id).maybeSingle();
      prof = data ?? null;
    }
    if (!prof) {
      const { data } = await supabase.from("profiles").select("user_id").eq("phone", phone).maybeSingle();
      prof = data ?? null;
    }
    userId = prof?.user_id ?? undefined;
  } catch (e) {
    console.warn("[woovi-pix-audit] perfil não resolvido:", (e as Error).message);
  }

  if (userId) {
    try {
      await supabase.from("profiles")
        .update({ pending_insight: `[CONTENT]${text}` })
        .eq("user_id", userId);
    } catch (e) {
      console.warn("[woovi-pix-audit] pending_insight não gravado:", (e as Error).message);
    }
  }

  try {
    const res = await sendProactive(phone, text, "reconnect", userId);
    if (!res?.success) {
      await supabase.from("failed_message_log").insert({
        function_name: "woovi-pix-audit",
        user_id: userId ?? null,
        phone,
        content: text.slice(0, 2000),
        error: (res?.error || "sem sucesso").slice(0, 1000),
      }).then(() => {}, () => {});
    }
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
  // Reparo pontual: reenvia o 1º aviso de mandato para uma assinatura mesmo que
  // ela já esteja marcada como avisada. Serve para os casos em que o aviso
  // "saiu" mas chegou quebrado (template sem o texto/link).
  const resendMandateFor = typeof body.resend_mandate_step1_for === "string"
    ? body.resend_mandate_step1_for
    : null;
  // Modo rápido (`{ only: "extrato" }`): roda SÓ a varredura 6, que é a única
  // fonte da parcela do carnê. Serve para um cron curto (a cada 10 min) que
  // reconcilia o pagamento em minutos — assim quem acabou de pagar não parece
  // abandono para as rotinas de recuperação.
  const onlyExtrato = body.only === "extrato";

  const report: Record<string, unknown[]> = {
    entrada_pendente: [], mandato_pendente: [], recuperados: [], abandonados: [],
    reautorizacao: [], ciclo_sem_cobranca: [], erros: [],
  };

  try {
    const now = new Date();
    const graceBefore = new Date(now.getTime() - PARTIAL_GRACE_MINUTES * 60 * 1000).toISOString();
    // 10 dias: precisa cobrir a janela inteira do trial (7 dias) + a virada do
    // dia 7 sem mandato, que é quando abrimos a régua de retenção.
    const since = new Date(now.getTime() - 10 * 86400000).toISOString();

    const { data: composed } = await supabase
      .from("woovi_subscriptions")
      .select("*")
      .eq("creation_mode", "composed")
      .eq("creation_status", "completed")
      .gte("created_at", since)
      .is("replaced_by_subscription_id", null)
      .limit(300);

    for (const sub of (onlyExtrato ? [] : composed) || []) {
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
        const sent = dryRun ? true : await notify(supabase, sub, text);
        if (!dryRun && sent) {
          await supabase.from("woovi_subscriptions")
            .update({ entry_followup_sent_at: new Date().toISOString() }).eq("id", sub.id);
        }
        report.entrada_pendente.push({ sub: sub.subscription_id, email: sub.customer_email, sent, dryRun });
        continue;
      }

      // ---- 1b) Entrada paga, mandato não aprovado -------------------------
      // A janela é curta (7 dias do trial): 1º lembrete assim que detectamos,
      // 2º perto do 5º dia e, se o 7º passar, entra na régua de retenção —
      // antes esse cliente simplesmente sumia em silêncio.
      if (entryPaid && !approved) {
        const age = daysSince(created);
        const forceResend = !!resendMandateFor
          && (sub.subscription_id === resendMandateFor || sub.id === resendMandateFor);
        const firstSent = !!sub.mandate_followup_sent_at && !forceResend;
        const secondSent = !!sub.mandate_followup2_sent_at;
        const firstName = String(sub.customer_name || "").split(" ")[0] || "tudo bem";
        const link = sub.authorization_url || null;

        if (!firstSent) {
          const text = `Oi, ${firstName}! `
            + `Seu pagamento de R$ ${money(sub.trial_value_cents || sub.value_cents)} entrou e seu acesso já está liberado. `
            + `Só faltou uma coisa: a autorização do débito automático de R$ ${money(sub.value_cents)}/mês no app do banco `
            + `(costuma aparecer como "Pix Automático").\n\n`
            + (link ? `Você autoriza por aqui:\n${link}\n\n` : "")
            + `Sem isso sua assinatura não renova — e eu não quero te perder no meio do caminho.`;
          const sent = dryRun ? true : await notify(supabase, sub, text);
          if (!dryRun && sent) {
            await supabase.from("woovi_subscriptions")
              .update({ mandate_followup_sent_at: new Date().toISOString() }).eq("id", sub.id);
          }
          report.mandato_pendente.push({ sub: sub.subscription_id, email: sub.customer_email, step: 1, sent, dryRun });
          continue;
        }

        if (!secondSent && age >= MANDATE_REMINDER2_DAY) {
          const text = `Oi, ${firstName}! Passando só pra lembrar: `
            + `sua semana de teste na Aura termina em breve e a autorização do débito automático `
            + `de R$ ${money(sub.value_cents)}/mês ainda não apareceu aqui.\n\n`
            + (link ? `É 1 minuto no app do banco:\n${link}\n\n` : "")
            + `Se não autorizar, seu acesso simplesmente para — e eu prefiro continuar com você.`;
          const sent = dryRun ? true : await notify(supabase, sub, text);
          if (!dryRun && sent) {
            await supabase.from("woovi_subscriptions")
              .update({ mandate_followup2_sent_at: new Date().toISOString() }).eq("id", sub.id);
          }
          report.mandato_pendente.push({ sub: sub.subscription_id, email: sub.customer_email, step: 2, sent, dryRun });
          continue;
        }

        // Janela vencida sem mandato: entrega pra régua de retenção (30% off →
        // Lite), a mesma do dunning. Uma vez por mandato.
        if (age >= TRIAL_DAYS + 1) {
          let authUid: string | null = null;
          if (sub.user_id) {
            const { data: p } = await supabase
              .from("profiles").select("user_id").eq("id", sub.user_id).maybeSingle();
            authUid = (p?.user_id as string) || null;
          }
          const { data: pending } = await supabase.from("scheduled_tasks")
            .select("id").eq("task_type", "woovi_recovery_offer")
            .in("status", ["pending", "executing", "completed"])
            .contains("payload", { subscription_id: sub.subscription_id }).limit(1);
          const already = Array.isArray(pending) && pending.length > 0;
          if (authUid && !already && !dryRun) {
            await supabase.from("scheduled_tasks").insert({
              user_id: authUid,
              task_type: "woovi_recovery_offer",
              execute_at: new Date().toISOString(),
              status: "pending",
              payload: {
                provider: "woovi",
                subscription_id: sub.subscription_id,
                offer_step: 1,
                source: "mandate_never_authorized",
              },
            });
          }
          report.mandato_pendente.push({
            sub: sub.subscription_id, email: sub.customer_email,
            step: "retencao", aberta: !!authUid && !already, dryRun,
          });
        }
        continue;
      }

      // ---- 3) Abandono total: QR expirado, nada pago, nada aprovado -------
      const expired = sub.qr_expires_at && String(sub.qr_expires_at) < now.toISOString();

      // 3b) QR expirado, mandato aprovado, entrada NUNCA paga: com o 1º débito
      // em D+7 isso viraria uma cobrança cheia em quem não tem acesso. Derruba
      // o mandato e a cobrança de entrada antes do dia 7.
      if (expired && approved && !entryPaid
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
            status: "CANCELADA",
            last_error: "mandato aprovado sem a entrada paga e QR expirado — cancelado para não debitar sem acesso",
          }).eq("id", sub.id);
        }
        report.abandonados.push({
          sub: sub.subscription_id, email: sub.customer_email,
          motivo: "mandato_sem_entrada", dryRun,
        });
        continue;
      }

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
    for (const c of (onlyExtrato ? [] : openCharges) || []) {
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

    for (const sub of (onlyExtrato ? [] : liveSubs) || []) {
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
          sent = await notify(supabase, sub, text);
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

    for (const sub of (onlyExtrato ? [] : dueSubs) || []) {
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

    // ---- 6) Reconciliação pelo extrato -------------------------------------
    // Ponto cego descoberto em 19/08: a parcela do carnê (Pix Automático) é
    // liquidada e aparece SÓ no extrato — não vem em /api/v1/charge e o webhook
    // de cobrança não chega. Resultado: dinheiro na conta e nenhum registro
    // local (nem woovi_charges, nem entry_paid_at, nem acesso).
    // Aqui varremos o extrato dos últimos 3 dias, casamos o pagador (CPF, com
    // fallback de e-mail/telefone) com um mandato nosso e, se não houver
    // pagamento local equivalente, fazemos replay pro webhook — que continua
    // sendo a única fonte de verdade da ativação.
    const extratoSince = new Date(now.getTime() - 3 * 86400000).toISOString();
    const onlyDigits = (v: unknown) => String(v || "").replace(/\D/g, "");
    const tx = await wooviFetch<Record<string, any>>("/api/v1/transaction?limit=100");
    const transactions: Record<string, any>[] = Array.isArray((tx.data as any)?.transactions)
      ? (tx.data as any).transactions
      : [];

    for (const t of transactions) {
      const when = String(t?.time || t?.createdAt || "");
      if (!when || when < extratoSince) continue;
      if (String(t?.type || "PAYMENT").toUpperCase() !== "PAYMENT") continue;
      const value = Number(t?.value || 0);
      if (!value) continue;

      const payer = (t?.payer || {}) as Record<string, any>;
      const cpf = onlyDigits(payer?.taxID?.taxID || t?.debitParty?.holder?.taxID?.taxID);
      const email = String(payer?.email || "").toLowerCase();
      const phone = onlyDigits(payer?.phone);

      let sub: Record<string, any> | null = null;
      if (cpf) {
        const { data } = await supabase.from("woovi_subscriptions")
          .select("*").eq("customer_cpf", cpf)
          .order("created_at", { ascending: false }).limit(1);
        sub = data?.[0] ?? null;
      }
      if (!sub && email) {
        const { data } = await supabase.from("woovi_subscriptions")
          .select("*").eq("customer_email", email)
          .order("created_at", { ascending: false }).limit(1);
        sub = data?.[0] ?? null;
      }
      if (!sub && phone) {
        const { data } = await supabase.from("woovi_subscriptions")
          .select("*").ilike("customer_phone", `%${phone.slice(-8)}%`)
          .order("created_at", { ascending: false }).limit(1);
        sub = data?.[0] ?? null;
      }
      if (!sub?.subscription_id) continue;

      // Já registrado? Aceita match por identificador do extrato ou por
      // valor+janela (o webhook grava o correlationID da cobrança, não o E2E).
      const e2e = String(t?.endToEndId || t?.transactionID || "");
      const { data: known } = await supabase.from("woovi_charges")
        .select("id, installment_id, value_cents, paid_at")
        .eq("subscription_id", sub.subscription_id)
        .not("paid_at", "is", null)
        .limit(50);
      const already = (known || []).some((c: Record<string, any>) =>
        String(c.installment_id) === e2e
        || (Number(c.value_cents) === value
          && Math.abs(Date.parse(String(c.paid_at)) - Date.parse(when)) < 3 * 86400000)
      );
      if (already) continue;

      if (dryRun) {
        report.recuperados.push({ sub: sub.subscription_id, via: "extrato", value, when, dryRun: true });
        continue;
      }

      const ok = await replayToWebhook({
        event: "OPENPIX:CHARGE_COMPLETED",
        charge: {
          correlationID: e2e || `extrato:${sub.subscription_id}:${when}`,
          status: "COMPLETED",
          value,
          paidAt: when,
          comment: "reconciliado pelo extrato Woovi",
        },
        subscription: {
          globalID: sub.subscription_id,
          correlationID: sub.correlation_id,
          subscriptionId: sub.subscription_id,
        },
        pix: { subType: t?.subType || null, endToEndId: e2e },
      });
      report.recuperados.push({
        sub: sub.subscription_id, email: sub.customer_email,
        via: "extrato", value, when, replay: ok,
      });
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