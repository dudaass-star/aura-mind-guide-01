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
  wooviFetch, brtDate, getSubscriptionCustomerCorrelation, listInstallments,
  MANDATE_ACTIVE_STATUSES, WOOVI_PAID_STATUSES,
  findScheduledInstallment, daysUntil, WooviUnavailable,
  findUnpaidInstallment, createInstallmentCobr, normalizeMandateStatus,
  cycleRetryWindow,
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
  const onlyExtrato = body.only === "extrato" || body.only === "extrato_debug";
  const debugExtrato = body.only === "extrato_debug";

  const report: Record<string, unknown[]> = {
    entrada_pendente: [], mandato_pendente: [], recuperados: [], abandonados: [],
    reautorizacao: [], ciclo_sem_cobranca: [], cobertura: [], status_sincronizado: [],
    duplicados: [], vencimento_backfill: [],
    erros: [],
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

    // ---- 5) Garantia preventiva e backstop de ciclo ------------------------
    // A Woovi deveria criar a CobR automaticamente quatro dias antes do débito,
    // mas houve mandatos aprovados em que ela nunca apareceu. Antes, a Aura só
    // percebia isso depois do vencimento. Agora, ao entrar na janela legal do
    // Bacen (5–10 dias antes), confirmamos a parcela e agendamos a criação manual
    // da CobR. A tarefa é deduplicada por assinatura + vencimento.
    const today = brtDate(now);
    const tenDaysAhead = brtDate(new Date(now.getTime() + 10 * 86400000));
    // Lote pequeno e ordenado pelo vencimento mais próximo: a Woovi devolve 429
    // quando varremos dezenas de mandatos de uma vez, e 429 cegava a guarda.
    // Quem sobra é pego na rodada seguinte (a cada 15 min), já que a ordem é
    // sempre "quem vence primeiro".
    const { data: upcomingSubs } = await supabase
      .from("woovi_subscriptions")
      .select("id, user_id, subscription_id, customer_email, next_charge_date, value_cents, status, last_error")
      .in("status", MANDATE_ACTIVE_STATUSES)
      .is("replaced_by_subscription_id", null)
      .not("subscription_id", "is", null)
      .not("next_charge_date", "is", null)
      .gte("next_charge_date", today)
      .lte("next_charge_date", tenDaysAhead)
      .order("next_charge_date", { ascending: true })
      .limit(25);

    for (const sub of (onlyExtrato ? [] : upcomingSubs) || []) {
      let installment: Awaited<ReturnType<typeof findScheduledInstallment>> = null;
      try {
        installment = await findScheduledInstallment(String(sub.subscription_id));
      } catch (e) {
        if (e instanceof WooviUnavailable) {
          // Woovi indisponível/limitada: NÃO concluímos nada. Reconferimos na
          // próxima rodada — este é justamente o caso que antes virava
          // "parcela ausente" e deixava o cliente sem cobrança.
          report.ciclo_sem_cobranca.push({
            sub: sub.subscription_id, email: sub.customer_email,
            ciclo: sub.next_charge_date, motivo: `woovi indisponível (${e.status}) — reconferir`,
            dryRun,
          });
          continue;
        }
        throw e;
      }

      // Parcela existe e JÁ tem CobR criada: está tudo em ordem, não tocar.
      // (Tentar criar de novo devolve 400 "A parcela já tem cobr" e queima o
      // limite de taxa da Woovi, cegando as outras proteções.)
      if (installment?.globalID && installment.hasCobr) {
        // Limpa diagnóstico velho: enquanto líamos o vencimento no campo errado,
        // mandatos saudáveis ficaram marcados como "sem parcela/sem cobrança".
        if (sub.last_error && !dryRun) {
          await supabase.from("woovi_subscriptions")
            .update({ last_error: null }).eq("id", sub.id);
        }
        continue;
      }

      if (!installment?.globalID) {
        // Sem parcela AGENDADA. Não existe criar parcela por fora (a Woovi
        // responde 405 em POST /subscriptions/{id}/installments): o que existe é
        // criar/retentar a CobR de uma parcela que já está lá. Se houver parcela
        // em aberto SEM CobR, disparamos a cobrança dela; senão, fica para
        // intervenção.
        let repaired = false;
        let detail = "";
        try {
          const unpaid = await findUnpaidInstallment(String(sub.subscription_id));
          if (unpaid?.globalID && unpaid.hasCobr) {
            detail = " (parcela já tem cobrança criada)";
            repaired = true;
          } else if (unpaid?.globalID && !dryRun) {
            const cobr = await createInstallmentCobr(
              unpaid.globalID, Number(sub.value_cents || 0) || undefined,
            );
            repaired = cobr.ok;
            detail = repaired ? "" : ` (cobr ${cobr.status})`;
          } else if (!unpaid?.globalID) {
            detail = " (nenhuma parcela em aberto)";
          }
        } catch (e) {
          if (e instanceof WooviUnavailable) {
            report.ciclo_sem_cobranca.push({
              sub: sub.subscription_id, email: sub.customer_email,
              ciclo: sub.next_charge_date,
              motivo: `woovi indisponível (${e.status}) — reconferir`, dryRun,
            });
            continue;
          }
          throw e;
        }
        if (!dryRun) {
          await supabase.from("woovi_subscriptions").update({
            last_error: repaired
              ? null
              : `ciclo de ${sub.next_charge_date} sem parcela agendada na Woovi${detail}`,
          }).eq("id", sub.id);
        }
        report.ciclo_sem_cobranca.push({
          sub: sub.subscription_id, email: sub.customer_email,
          ciclo: sub.next_charge_date,
          motivo: repaired ? "parcela em aberto — cobrança disparada" : `parcela agendada ausente${detail}`,
          dryRun,
        });
        continue;
      }

      if (!installment.dueDate) continue;
      const lead = daysUntil(installment.dueDate);
      if (lead < 5 || lead > 10) continue;

      const { data: existing } = await supabase.from("scheduled_tasks")
        .select("id")
        .eq("task_type", "woovi_next_cycle_cobr")
        .contains("payload", {
          subscription_id: sub.subscription_id,
          next_due_date: installment.dueDate,
        })
        .limit(1);
      if (Array.isArray(existing) && existing.length > 0) continue;

      let authUserId: string | null = null;
      if (sub.user_id) {
        const { data: profile } = await supabase.from("profiles")
          .select("user_id").eq("id", sub.user_id).maybeSingle();
        authUserId = (profile?.user_id as string) || null;
      }
      if (authUserId && !dryRun) {
        await supabase.from("scheduled_tasks").insert({
          user_id: authUserId,
          task_type: "woovi_next_cycle_cobr",
          execute_at: new Date().toISOString(),
          status: "pending",
          payload: {
            provider: "woovi",
            subscription_id: sub.subscription_id,
            next_due_date: installment.dueDate,
            source: "pre_due_guard",
          },
        });
      }
    }

    // ---- Mandatos duplicados do mesmo cliente --------------------------------
    // Troca de plano cria um mandato novo; o antigo continuava vivo na Woovi e
    // aqui. Isso é risco de débito dobrado e polui o "ciclo sem cobrança" com
    // mandatos que ninguém usa mais. Mantemos o mais recente e aposentamos os
    // anteriores (cancelando também na Woovi).
    if (!onlyExtrato) {
      const { data: liveAll } = await supabase
        .from("woovi_subscriptions")
        .select("id, user_id, subscription_id, customer_email, created_at, mandate_approved_at, entry_paid_at")
        .in("status", MANDATE_ACTIVE_STATUSES)
        .is("replaced_by_subscription_id", null)
        .not("subscription_id", "is", null)
        .limit(1000);
      // O mandato que vale é o que o cliente autorizou/pagou por último — não
      // necessariamente o criado por último (QR gerado e abandonado é comum).
      const mandateRank = (r: Record<string, any>) => Math.max(
        Date.parse(r.mandate_approved_at || "") || 0,
        Date.parse(r.entry_paid_at || "") || 0,
        Date.parse(r.created_at || "") || 0,
      );
      const ordered = [...(liveAll || [])].sort((a, b) => mandateRank(b) - mandateRank(a));
      const seen = new Map<string, string>(); // chave do cliente → mandato mantido
      for (const row of ordered) {
        const key = String(row.user_id || row.customer_email || row.id).toLowerCase();
        const keeper = seen.get(key);
        if (!keeper) { seen.set(key, String(row.subscription_id)); continue; }
        report.duplicados.push({
          sub: row.subscription_id, email: row.customer_email, mantido: keeper, dryRun,
        });
        if (dryRun) continue;
        await wooviFetch(
          `/api/v1/subscriptions/${encodeURIComponent(String(row.subscription_id))}/cancel`,
          { method: "PUT" },
        ).catch(() => {});
        await supabase.from("woovi_subscriptions").update({
          status: "CANCELADA",
          replaced_by_subscription_id: keeper,
          last_error: `substituído pelo mandato ${keeper}`,
        }).eq("id", row.id);
      }
    }


    // No trilho Woovi o débito do ciclo depende da Woovi gerar a cobrança E do
    // webhook chegar. Sem esta varredura, um webhook perdido vira usuário
    // usando de graça em silêncio. Para cada mandato vivo com ciclo vencido:
    //   • cobrança existe e está paga na Woovi → replay (fonte única é o webhook);
    //   • cobrança não existe na Woovi → registra a lacuna pra intervenção
    //     (não forçamos criação: cobrança fora do mandato é dinheiro sem contrato).
    const SUB_COLS =
      "id, user_id, subscription_id, customer_email, next_charge_date, start_date, value_cents, status, last_error";
    const { data: dueSubs } = await supabase
      .from("woovi_subscriptions")
      .select(SUB_COLS)
      .in("status", MANDATE_ACTIVE_STATUSES)
      .is("replaced_by_subscription_id", null)
      .not("subscription_id", "is", null)
      .not("next_charge_date", "is", null)
      .lte("next_charge_date", today)
      .limit(200);

    // Mandato nativo (troca de plano / retenção) não tem entrada: a 1ª parcela é
    // já a mensalidade e o `next_charge_date` aponta pro ciclo SEGUINTE. Caso
    // real: parcela 1 com CobR criada há 5 dias, nunca paga, e ninguém olhando
    // porque o vencimento gravado era do mês seguinte. Aqui entram todos os
    // mandatos vivos que começaram há mais de 1 dia e nunca tiveram nenhuma
    // cobrança paga.
    const { data: neverPaidSubs } = await supabase
      .from("woovi_subscriptions")
      .select(SUB_COLS)
      .in("status", MANDATE_ACTIVE_STATUSES)
      .is("replaced_by_subscription_id", null)
      .is("entry_paid_at", null)
      .not("subscription_id", "is", null)
      .lte("start_date", new Date(Date.now() - 86400000).toISOString().slice(0, 10))
      .limit(100);

    const seenSubs = new Set<string>();
    const dueQueue: Record<string, any>[] = [];
    for (const s of [...(dueSubs || []), ...(neverPaidSubs || [])]) {
      const key = String(s.subscription_id);
      if (seenSubs.has(key)) continue;
      // Nunca pagou nada: o ciclo a auditar é o começo do mandato, não a data
      // do próximo débito.
      const hasPaid = await supabase
        .from("woovi_charges")
        .select("id", { count: "exact", head: true })
        .eq("subscription_id", key)
        .not("paid_at", "is", null);
      if ((hasPaid.count || 0) === 0) {
        s.next_charge_date = String(s.start_date || s.next_charge_date || today).slice(0, 10);
      } else if (!s.next_charge_date || String(s.next_charge_date) > today) {
        continue; // ciclo ainda não venceu
      }
      seenSubs.add(key);
      dueQueue.push(s);
    }

    for (const sub of (onlyExtrato ? [] : dueQueue) || []) {
      const r = await wooviFetch<Record<string, any>>(
        `/api/v1/subscriptions/${encodeURIComponent(String(sub.subscription_id))}`,
      );
      await new Promise((res) => setTimeout(res, 250));
      if (!r.ok || !r.data) {
        // Silêncio da Woovi (429/5xx) não é "mandato sem cobrança": registra pra
        // reconferência na próxima varredura em vez de sumir do radar.
        report.ciclo_sem_cobranca.push({
          sub: sub.subscription_id, email: sub.customer_email,
          ciclo: sub.next_charge_date,
          motivo: `woovi indisponível (${r.status}) — reconferir`, dryRun,
        });
        continue;
      }
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
        // Ciclo vencido sem pagamento não pode conviver com acesso liberado
        // além do que o cliente pagou (caso real: entrada de teste paga, plano
        // anual de acesso liberado por engano na reconciliação).
        if (!dryRun) {
          const { enforceWooviAccessCap } = await import("../_shared/woovi-access.ts");
          const cap = await enforceWooviAccessCap(supabase, sub.user_id);
          if (cap.capped) {
            report.cobertura.push({
              sub: sub.subscription_id, email: sub.customer_email,
              acesso_alinhado_ate: cap.until,
            });
          }
        }
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

    // ---- 5b) Cobertura: todo mandato vivo precisa ter parcela na Woovi ------
    // O painel da Woovi mostrou 8 parcelas agendadas para dezenas de mandatos
    // vivos — ou seja, a criação automática da parcela falha em silêncio muito
    // antes do vencimento, e a guarda 5 só enxerga a janela de 10 dias.
    // Aqui varremos TODOS os mandatos vivos com vencimento futuro, em lotes
    // rotativos (a Woovi devolve 429 se varrermos dezenas de uma vez). A rotação
    // é derivada do relógio: com o cron de 15 min, o ciclo inteiro é coberto
    // várias vezes por dia sem precisar de coluna nova.
    const coverageBatch = Number.isFinite(Number(body.coverage_batch))
      && Number(body.coverage_batch) >= 0
        ? Number(body.coverage_batch)
        : 8;
    if (!onlyExtrato && coverageBatch > 0) {
      const { count: liveCount } = await supabase
        .from("woovi_subscriptions")
        .select("id", { count: "exact", head: true })
        .in("status", MANDATE_ACTIVE_STATUSES)
        .is("replaced_by_subscription_id", null)
        .not("subscription_id", "is", null)
        .gt("next_charge_date", tenDaysAhead);

      const total = liveCount || 0;
      if (total > 0) {
        const round = Math.floor(now.getTime() / (15 * 60 * 1000));
        const offset = (round * coverageBatch) % total;
        const { data: coverSubs } = await supabase
          .from("woovi_subscriptions")
          .select("id, user_id, subscription_id, customer_email, next_charge_date, value_cents, status")
          .in("status", MANDATE_ACTIVE_STATUSES)
          .is("replaced_by_subscription_id", null)
          .not("subscription_id", "is", null)
          .gt("next_charge_date", tenDaysAhead)
          .order("next_charge_date", { ascending: true })
          .range(offset, offset + coverageBatch - 1);

        for (const sub of coverSubs || []) {
          try {
            const inst = await findScheduledInstallment(String(sub.subscription_id));
            if (inst?.globalID) continue; // parcela existe: nada a fazer

            // Sem parcela agendada e fora da janela legal do Bacen (5–10 dias):
            // não há o que criar agora. Antes de registrar a lacuna, confirmamos
            // na Woovi se o mandato ainda está vivo — foi assim que apareceu a
            // diferença de "ativas" entre o painel dela e o nosso banco.
            const r = await wooviFetch<Record<string, any>>(
              `/api/v1/subscriptions/${encodeURIComponent(String(sub.subscription_id))}`,
            );
            if (!r.ok) {
              report.cobertura.push({
                sub: sub.subscription_id, email: sub.customer_email,
                ciclo: sub.next_charge_date,
                motivo: `woovi indisponível (${r.status}) — reconferir`, dryRun,
              });
              continue;
            }
            const remote = ((r.data as any)?.subscription || r.data) as Record<string, any>;
            const localStatus = normalizeMandateStatus(
              remote?.status ?? remote?.pixAutomatic?.status,
              String(sub.status),
            );
            if (localStatus !== String(sub.status)) {
              if (!dryRun) {
                await supabase.from("woovi_subscriptions")
                  .update({ status: localStatus })
                  .eq("id", sub.id);
              }
              report.status_sincronizado.push({
                sub: sub.subscription_id, email: sub.customer_email,
                de: sub.status, para: localStatus, dryRun,
              });
              continue;
            }

            if (!dryRun) {
              await supabase.from("woovi_subscriptions").update({
                last_error: `ciclo de ${sub.next_charge_date} sem parcela agendada na Woovi (cobertura)`,
              }).eq("id", sub.id);
            }
            report.cobertura.push({
              sub: sub.subscription_id, email: sub.customer_email,
              ciclo: sub.next_charge_date, motivo: "sem parcela agendada na Woovi", dryRun,
            });
          } catch (e) {
            if (e instanceof WooviUnavailable) {
              report.cobertura.push({
                sub: sub.subscription_id, email: sub.customer_email,
                ciclo: sub.next_charge_date,
                motivo: `woovi indisponível (${e.status}) — reconferir`, dryRun,
              });
              // Limite de taxa: insistir só piora. O resto do lote fica para a
              // próxima rodada.
              break;
            }
            throw e;
          }
        }
      }
    }

    // ---- 5c) Vencimento das mensalidades (backfill) -------------------------
    // A CobR do PIX Automático não traz vencimento no webhook, então TODA
    // mensalidade ficou gravada sem `due_date` — dava para saber que pagou, não
    // se pagou no dia certo. Aqui perguntamos a data à própria Woovi, em lotes
    // pequenos para não queimar o limite de taxa.
    if (!onlyExtrato) {
      const { data: noDue } = await supabase
        .from("woovi_charges")
        .select("id, subscription_id, installment_id, value_cents, paid_at")
        .eq("kind", "cycle")
        .is("due_date", null)
        .order("paid_at", { ascending: false })
        .limit(6);
      for (const row of noDue || []) {
        try {
          const installments = await listInstallments(String(row.subscription_id));
          const paidMs = row.paid_at ? Date.parse(String(row.paid_at)) : NaN;
          const candidates = installments
            .map((i: Record<string, any>) => ({
              due: String(i?.dueDate || i?.dateGenerateCharge || i?.cobr?.dueDate || "").slice(0, 10),
              value: Number(i?.value),
              status: String(i?.status || "").toUpperCase(),
            }))
            .filter((i) => !!i.due);
          // A parcela certa é a liquidada de mesmo valor com vencimento mais
          // próximo da data do pagamento.
          const best = candidates
            .filter((i) => !Number.isFinite(i.value) || i.value === Number(row.value_cents))
            .sort((a, b) =>
              Math.abs(Date.parse(`${a.due}T12:00:00-03:00`) - paidMs)
              - Math.abs(Date.parse(`${b.due}T12:00:00-03:00`) - paidMs)
            )[0];
          if (!best?.due) continue;
          if (!dryRun) {
            await supabase.from("woovi_charges")
              .update({ due_date: best.due }).eq("id", row.id);
          }
          report.vencimento_backfill.push({
            charge: row.installment_id, sub: row.subscription_id,
            vencimento: best.due, pago_em: row.paid_at, dryRun,
          });
        } catch (e) {
          if (e instanceof WooviUnavailable) break;
          throw e;
        }
      }
    }


    // ---- 6) Reconciliação pelo extrato -------------------------------------
    // Ponto cego descoberto em 19/08: a parcela do carnê (Pix Automático) é
    // liquidada e aparece SÓ no extrato — não vem em /api/v1/charge e o webhook
    // de cobrança não chega. Resultado: dinheiro na conta e nenhum registro
    // local (nem woovi_charges, nem entry_paid_at, nem acesso).
    // Aqui varremos o extrato dos últimos 10 dias, casamos o pagador (CPF, com
    // fallback de e-mail/telefone) com um mandato nosso e, se não houver
    // pagamento local equivalente, fazemos replay pro webhook — que continua
    // sendo a única fonte de verdade da ativação.
    //
    // Pagador diferente do titular (marido/familiar pagando pela cliente) não
    // casa por CPF/e-mail/telefone. Nesses casos casamos pelo MANDATO: valor
    // igual ao esperado e vencimento previsto perto da data do pagamento, num
    // mandato ativo que não tem pagamento registrado no ciclo.
    // Janela padrão de 30 dias: com 10 dias, pagamentos de ciclo antigos (pagos
    // por familiar, sem webhook) ficavam para trás e a pessoa aparecia como
    // inadimplente. Ajustável por `body.extrato_days`.
    const extratoDays = Number.isFinite(Number(body.extrato_days))
      && Number(body.extrato_days) > 0
        ? Math.min(Number(body.extrato_days), 90)
        : 30;
    const extratoSince = new Date(now.getTime() - extratoDays * 86400000).toISOString();
    const onlyDigits = (v: unknown) => String(v || "").replace(/\D/g, "");
    // A Woovi devolve no máximo 100 lançamentos por página (ela ignora limites
    // maiores) e pagina por `skip`. Sem paginar, uma janela de 30 dias parava no
    // 100º lançamento e pagamentos mais antigos ficavam invisíveis.
    const TX_PAGE = 100;
    const TX_MAX_PAGES = 6;
    const transactions: Record<string, any>[] = [];
    for (let page = 0; page < TX_MAX_PAGES; page++) {
      const tx = await wooviFetch<Record<string, any>>(
        `/api/v1/transaction?limit=${TX_PAGE}&skip=${page * TX_PAGE}`,
      );
      const list: Record<string, any>[] = Array.isArray((tx.data as any)?.transactions)
        ? (tx.data as any).transactions
        : [];
      transactions.push(...list);
      if (list.length < TX_PAGE) break;
      const oldest = list
        .map((t) => String(t?.time || t?.createdAt || ""))
        .filter(Boolean)
        .sort()[0];
      if (oldest && oldest < extratoSince) break;
      if ((tx.data as any)?.pageInfo?.hasNextPage === false) break;
    }

    // Modo inspeção: devolve o extrato cru da janela (usado para vincular
    // pagamento órfão à mão, quando o pagador não é o titular).
    if (debugExtrato) {
      const probe: Record<string, unknown>[] = [];
      for (const id of (Array.isArray(body.probe_subs) ? body.probe_subs : []) as string[]) {
        try {
          probe.push({ sub: id, owner: await getSubscriptionCustomerCorrelation(String(id)) });
        } catch (e) {
          probe.push({ sub: id, erro: (e as Error).message });
        }
      }
      for (const p of (Array.isArray(body.probe_paths) ? body.probe_paths : []) as string[]) {
        const r = await wooviFetch<Record<string, any>>(String(p));
        probe.push({ path: p, status: r.status, data: r.data ?? r.raw?.slice?.(0, 1500) });
      }
      const inWindow = transactions
        .filter((t) => String(t?.time || t?.createdAt || "") >= extratoSince)
        .map((t) => ({
          time: t?.time || t?.createdAt,
          value: t?.value,
          subType: t?.subType,
          payer: t?.payer?.name,
          payer_cpf: t?.payer?.taxID?.taxID || t?.debitParty?.holder?.taxID?.taxID,
          payer_email: t?.payer?.email,
          payer_phone: t?.payer?.phone,
          payer_correlation: t?.payer?.correlationID,
          charge_correlation: t?.charge?.correlationID,
          e2e: t?.endToEndId,
        }));

      // Resumo de conferência contra o painel da Woovi: quanto entrou na janela,
      // quantos desses pagamentos já estão gravados aqui e quantos não estão.
      const { data: knownForSummary } = await supabase.from("woovi_charges")
        .select("installment_id").not("installment_id", "is", null).limit(5000);
      const knownSummarySet = new Set(
        (knownForSummary || []).map((r: Record<string, any>) => String(r.installment_id)),
      );
      const byValue: Record<string, { n: number; total: number; sem_registro: number }> = {};
      let n = 0, total = 0, semRegistro = 0;
      for (const t of inWindow) {
        const v = Number(t.value || 0);
        if (v <= 0) continue;
        n++; total += v;
        const known = knownSummarySet.has(String(t.e2e))
          || knownSummarySet.has(String(t.charge_correlation));
        if (!known) semRegistro++;
        const key = (v / 100).toFixed(2);
        byValue[key] ||= { n: 0, total: 0, sem_registro: 0 };
        byValue[key].n++;
        byValue[key].total += v / 100;
        if (!known) byValue[key].sem_registro++;
      }

      return new Response(JSON.stringify({
        debugExtrato: true,
        probe,
        resumo: {
          janela_dias: extratoDays,
          entradas_no_extrato: n,
          total_recebido: Number((total / 100).toFixed(2)),
          sem_registro_local: semRegistro,
          por_valor: byValue,
        },
        ...(body.summary_only === true ? {} : { transactions: inWindow }),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Identificadores já gravados: pagamento conhecido nem entra na varredura
    // (era isso que estourava o tempo — dezenas de consultas na Woovi por nada).
    const { data: knownIds } = await supabase.from("woovi_charges")
      .select("installment_id").not("installment_id", "is", null).limit(2000);
    const knownIdSet = new Set((knownIds || []).map((r: Record<string, any>) => String(r.installment_id)));
    // Parcelas da Woovi consultadas nesta rodada (mandato → lista), com teto de
    // chamadas: a prova é caríssima em API e não pode derrubar a auditoria.
    const installmentCache = new Map<string, Record<string, any>[]>();
    let proofCalls = 0;
    const PROOF_CALL_BUDGET = 4; // a Woovi limita a taxa (429 com espera de 60s)
    const installmentsOf = async (subId: string): Promise<Record<string, any>[]> => {
      if (installmentCache.has(subId)) return installmentCache.get(subId)!;
      if (proofCalls >= PROOF_CALL_BUDGET) throw new Error("orçamento de prova esgotado");
      proofCalls++;
      const list = await listInstallments(subId);
      installmentCache.set(subId, list);
      return list;
    };

    for (const t of transactions) {
      const when = String(t?.time || t?.createdAt || "");
      if (!when || when < extratoSince) continue;
      if (String(t?.type || "PAYMENT").toUpperCase() !== "PAYMENT") continue;
      const value = Number(t?.value || 0);
      if (!value) continue;
      if (knownIdSet.has(String(t?.endToEndId || "")) || knownIdSet.has(String(t?.transactionID || ""))) continue;

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
      const payerName = String(payer?.name || t?.debitParty?.holder?.name || "").trim();
      const payerCorrelation = String(payer?.correlationID || "").trim();

      // Caminho seguro 1: pagamento de COBRANÇA traz o correlationID da própria
      // cobrança — é o mesmo identificador que gravamos em woovi_charges.
      const chargeCorrelation = String((t?.charge as Record<string, any>)?.correlationID || "").trim();
      if (!sub && chargeCorrelation) {
        const { data: byCharge } = await supabase.from("woovi_charges")
          .select("subscription_id").eq("installment_id", chargeCorrelation).limit(1);
        const subId = byCharge?.[0]?.subscription_id;
        if (subId) {
          const { data } = await supabase.from("woovi_subscriptions")
            .select("*").eq("subscription_id", subId).limit(1);
          sub = data?.[0] ?? null;
        }
      }

      // Fallback: pagou outra pessoa (marido/familiar). Casa pelo mandato ativo
      // com valor igual e vencimento previsto perto da data do pagamento; o nome
      // do pagador desempata quando há mais de um candidato.
      let lastMatchDiag: Record<string, unknown> | null = null;
      if (!sub) {
        const payDay = when.slice(0, 10);
        // Janela estreita: o débito do mandato cai no dia previsto (± poucos dias).
        // Janela larga só encobria o candidato certo, porque o limite de linhas
        // cortava justamente quem vencia no dia do pagamento.
        const from = brtDate(new Date(Date.parse(`${payDay}T12:00:00-03:00`) - 7 * 86400000));
        const to = brtDate(new Date(Date.parse(`${payDay}T12:00:00-03:00`) + 3 * 86400000));
        const { data: candidates } = await supabase.from("woovi_subscriptions")
          .select("*")
          .in("status", MANDATE_ACTIVE_STATUSES)
          .is("replaced_by_subscription_id", null)
          .not("subscription_id", "is", null)
          .eq("value_cents", value)
          .gte("next_charge_date", from)
          .lte("next_charge_date", to)
          .order("next_charge_date", { ascending: true })
          .limit(20);
        let pool = Array.isArray(candidates) ? candidates : [];

        // PROVA na Woovi (fim das heurísticas): a parcela do mandato guarda o
        // endToEndId/identifierId do débito. Quando ele é IGUAL ao do extrato, o
        // dono do pagamento está provado — mesmo com CPF, e-mail e telefone
        // diferentes (quem pagou foi marido/familiar, o extrato só mostra ele).
        // A Woovi limita a taxa, então checamos primeiro os mandatos mais
        // suspeitos: os que estão anotados como "sem cobrança" e os de
        // vencimento mais perto do pagamento.
        const txId = String(t?.transactionID || "");
        const e2eNow = String(t?.endToEndId || "");
        const payMs = Date.parse(`${payDay}T12:00:00-03:00`);
        const suspects = [...pool].sort((a, b) => {
          const flag = (x: Record<string, any>) => /sem cobran|sem parcela/i.test(String(x.last_error || "")) ? 0 : 1;
          if (flag(a) !== flag(b)) return flag(a) - flag(b);
          const d = (x: Record<string, any>) =>
            Math.abs(Date.parse(`${x.next_charge_date}T12:00:00-03:00`) - payMs);
          return d(a) - d(b);
        }).slice(0, 4);
        let provenFound = false;
        let proofBlocked = false;
        for (const c of suspects) {
          try {
            const list = await installmentsOf(String(c.subscription_id));
            const hit = list.some((i) => {
              const cobr = (i?.cobr || {}) as Record<string, any>;
              const ids = [cobr?.endToEndId, cobr?.identifierId,
                ...(Array.isArray(cobr?.tries) ? cobr.tries.map((x: any) => x?.endToEndId) : [])]
                .filter(Boolean).map(String);
              return (!!e2eNow && ids.includes(e2eNow)) || (!!txId && ids.includes(txId));
            });
            if (hit) { pool = [c]; provenFound = true; break; }
          } catch (_e) { proofBlocked = true; /* indisponibilidade não decide nada */ }
        }
        // Sem prova e com mais de um candidato: não adivinhamos dono de dinheiro.
        lastMatchDiag = {
          e2e: e2eNow, candidatos: pool.length, provado: provenFound,
          woovi_indisponivel: proofBlocked,
          checados: suspects.map((c) => c.customer_name),
        };
        if (!provenFound && !proofBlocked && pool.length > 1) pool = [];

        // Mandato que já teve este ciclo pago não disputa o pagamento.
        if (pool.length > 1) {
          const open: Record<string, any>[] = [];
          for (const c of pool) {
            const { data: paid } = await supabase.from("woovi_charges")
              .select("id").eq("subscription_id", c.subscription_id)
              .eq("value_cents", value).not("paid_at", "is", null).limit(1);
            if (!Array.isArray(paid) || paid.length === 0) open.push(c);
          }
          if (open.length > 0) pool = open;
        }

        // Sobrenome do pagador desempata (familiar pagando pela cliente).
        if (pool.length > 1 && payerName) {
          const norm = (v: string) =>
            v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const tokens = norm(payerName).split(/\s+/).filter((w) => w.length > 2);
          const bySurname = pool.filter((c) =>
            tokens.some((w) => norm(String(c.customer_name || "")).includes(w))
          );
          if (bySurname.length === 1) pool = bySurname;
        }

        // Último desempate: o mandato cujo ciclo previsto está mais perto do
        // pagamento E que a auditoria já marcou como "ciclo sem cobrança".
        if (pool.length > 1) {
          const flagged = pool.filter((c) => /sem cobran/i.test(String(c.last_error || "")));
          if (flagged.length === 1) pool = flagged;
        }

        // Só aceita quando sobra UM candidato: dinheiro não se atribui no chute.
        if (pool.length === 1) {
          const matched = pool[0] as Record<string, any>;
          sub = matched;
          console.log(`🔎 extrato: pagamento de ${value} casado pelo mandato ${matched.subscription_id} (pagador diferente)`);
        }
      }
      if (!sub?.subscription_id) {
        report.ciclo_sem_cobranca.push({
          orfao: true, valor: value, quando: when, pagador: payerName || null,
          motivo: "pagamento no extrato sem mandato correspondente", dryRun,
          diag: lastMatchDiag,
        });
        continue;
      }

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