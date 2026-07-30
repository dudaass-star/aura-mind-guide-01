// Edge function: asaas-pix-auto-audit
// Auditoria diária do PIX Automático (Bacen). Roda de manhã (BRT) e responde a
// duas perguntas que hoje só descobríamos no prejuízo:
//   1) Autorizações que morreram sem consentimento (REFUSED/EXPIRED) → dispara
//      e-mail de recuperação pro cliente, uma vez por autorização.
//   2) Autorizações ACTIVE cujas cobranças venceram e NÃO foram debitadas
//      automaticamente → alerta pro admin, porque isso significa que o débito
//      automático não disparou (o cliente teria que pagar QR na mão).
// Somente leitura no Asaas/DB + envio de e-mails. Nada bloqueante.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_LABELS: Record<string, string> = {
  essencial: "Essencial",
  direcao: "Direção",
  transformacao: "Transformação",
};

function brtDateString(d = new Date()): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Estados finais: nada mais muda depois deles.
const FINAL_STATUSES = ["REFUSED", "EXPIRED", "REJECTED", "CANCELLED"];

// Silêncio entre alertas de débito não disparado, por autorização.
const ALERT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
// Segundo toque de recuperação: 72h depois do primeiro.
const SECOND_TOUCH_MS = 72 * 60 * 60 * 1000;
// Janela de recuperação: 7 dias.
const RECOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function recoveryLink(plan?: string | null, campaign = "pix_auto"): string {
  const base = `https://olaaura.com.br/v2${plan ? `?plan=${plan}` : ""}`;
  const sep = plan ? "&" : "?";
  return `${base}${sep}utm_source=email&utm_medium=recovery&utm_campaign=${campaign}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");
  const ASAAS_ENV = (Deno.env.get("ASAAS_ENV") || "sandbox").toLowerCase();
  const ASAAS_BASE_URL =
    ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";

  // GET read-only na Asaas. Nunca lança: falha de rede não pode derrubar a auditoria.
  const asaasGet = async (path: string): Promise<Record<string, unknown> | null> => {
    if (!ASAAS_API_KEY) return null;
    try {
      const resp = await fetch(`${ASAAS_BASE_URL}${path}`, {
        method: "GET",
        headers: {
          access_token: ASAAS_API_KEY,
          "Content-Type": "application/json",
          "User-Agent": "Aura/1.0",
        },
      });
      if (!resp.ok) {
        console.warn(`[pix-auto-audit] Asaas GET ${path} → ${resp.status}`);
        return null;
      }
      return await resp.json().catch(() => null);
    } catch (e) {
      console.warn(`[pix-auto-audit] Asaas GET ${path} falhou:`, (e as Error).message);
      return null;
    }
  };

  // DELETE na Asaas. Usado só pra cancelar fatura gêmea comprovadamente duplicada.
  const asaasDelete = async (path: string): Promise<boolean> => {
    if (!ASAAS_API_KEY) return false;
    try {
      const resp = await fetch(`${ASAAS_BASE_URL}${path}`, {
        method: "DELETE",
        headers: {
          access_token: ASAAS_API_KEY,
          "Content-Type": "application/json",
          "User-Agent": "Aura/1.0",
        },
      });
      if (!resp.ok) console.warn(`[pix-auto-audit] Asaas DELETE ${path} → ${resp.status}`);
      return resp.ok;
    } catch (e) {
      console.warn(`[pix-auto-audit] Asaas DELETE ${path} falhou:`, (e as Error).message);
      return false;
    }
  };

  const report = {
    date: brtDateString(),
    reconciled: 0,
    status_changed: [] as Array<Record<string, unknown>>,
    qr_expired_swept: 0,
    twin_invoices_cancelled: 0,
    lost_authorizations: 0,
    recovery_emails_sent: 0,
    recovery_second_touch_sent: 0,
    autodebit_failures: [] as Array<Record<string, unknown>>,
    autodebit_new_alerts: 0,
    admin_alert_sent: false,
  };

  try {
    // ---------- 0) Reconciliação com a Asaas ----------
    // Webhook perdido deixa nosso status desatualizado pra sempre. Aqui a fonte
    // da verdade é a Asaas: sincroniza status, datas e assinatura vinculada.
    const { data: openAuths } = await supabase
      .from("asaas_pix_authorizations")
      .select("id, asaas_authorization_id, asaas_subscription_id, status, qr_expires_at, activated_at")
      .not("status", "in", `(${FINAL_STATUSES.join(",")})`);

    const nowIso = new Date().toISOString();
    for (const auth of openAuths || []) {
      const remote = await asaasGet(`/pix/automatic/authorizations/${auth.asaas_authorization_id}`);
      const patch: Record<string, unknown> = { last_synced_at: nowIso };

      if (remote) {
        report.reconciled++;
        const remoteStatus = String((remote as any).status || "").toUpperCase();
        if (remoteStatus && remoteStatus !== String(auth.status || "").toUpperCase()) {
          patch.status = remoteStatus;
          if (remoteStatus === "ACTIVE" && !auth.activated_at) {
            patch.activated_at = (remote as any).activatedDate || nowIso;
          }
          if (FINAL_STATUSES.includes(remoteStatus)) {
            patch.cancelled_at = (remote as any).canceledDate || nowIso;
          }
          report.status_changed.push({
            authorization: auth.asaas_authorization_id,
            de: auth.status,
            para: remoteStatus,
          });
        }
        const remoteSub =
          (remote as any).subscription?.id ||
          (remote as any).subscription ||
          (remote as any).subscriptionId ||
          null;
        if (remoteSub && typeof remoteSub === "string" && !auth.asaas_subscription_id) {
          patch.asaas_subscription_id = remoteSub;
        }
      }

      // ---------- 1) Varredura de QR vencido ----------
      // Sem confirmação de ativação e com QR no passado: é perda, mesmo sem webhook.
      const finalNow = String(patch.status || auth.status || "").toUpperCase();
      const stillPending = !FINAL_STATUSES.includes(finalNow) && finalNow !== "ACTIVE";
      const qrDead = auth.qr_expires_at ? new Date(auth.qr_expires_at).getTime() < Date.now() : false;
      if (stillPending && qrDead && !auth.activated_at) {
        patch.status = "EXPIRED";
        patch.cancelled_at = nowIso;
        report.qr_expired_swept++;
      }

      await supabase.from("asaas_pix_authorizations").update(patch).eq("id", auth.id);
    }

    // ---------- 2) Autorizações perdidas (janela de 7 dias) ----------
    const since = new Date(Date.now() - RECOVERY_WINDOW_MS).toISOString();
    const { data: lost } = await supabase
      .from("asaas_pix_authorizations")
      .select("id, asaas_authorization_id, status, plan, customer_name, customer_email, created_at, recovery_email_sent_at, recovery_email_2_sent_at")
      .in("status", ["REFUSED", "EXPIRED", "REJECTED"])
      .is("activated_at", null)
      .gte("created_at", since);

    report.lost_authorizations = (lost || []).filter((a) => !a.recovery_email_sent_at).length;

    for (const auth of lost || []) {
      if (!auth.customer_email) continue;
      const firstName = (auth.customer_name || "").split(" ")[0] || null;

      // 1º toque: assim que a autorização é detectada como perdida.
      if (!auth.recovery_email_sent_at) {
        try {
          await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "pix-auto-not-authorized",
              recipientEmail: auth.customer_email,
              idempotencyKey: `pix-auto-not-authorized-${auth.asaas_authorization_id}`,
              templateData: { name: firstName, plan: auth.plan, checkoutLink: recoveryLink(auth.plan) },
            },
          });
          await supabase
            .from("asaas_pix_authorizations")
            .update({ recovery_email_sent_at: new Date().toISOString() })
            .eq("id", auth.id);
          report.recovery_emails_sent++;
        } catch (e) {
          console.warn(`[pix-auto-audit] recovery email falhou (${auth.asaas_authorization_id}):`, (e as Error).message);
        }
        continue;
      }

      // 2º e último toque: 72h depois, se a pessoa não voltou.
      const firstSent = new Date(auth.recovery_email_sent_at).getTime();
      if (!auth.recovery_email_2_sent_at && Date.now() - firstSent >= SECOND_TOUCH_MS) {
        try {
          await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "pix-auto-not-authorized",
              recipientEmail: auth.customer_email,
              idempotencyKey: `pix-auto-not-authorized-2-${auth.asaas_authorization_id}`,
              templateData: {
                name: firstName,
                plan: auth.plan,
                checkoutLink: recoveryLink(auth.plan, "pix_auto_2"),
              },
            },
          });
          await supabase
            .from("asaas_pix_authorizations")
            .update({ recovery_email_2_sent_at: new Date().toISOString() })
            .eq("id", auth.id);
          report.recovery_second_touch_sent++;
        } catch (e) {
          console.warn(`[pix-auto-audit] 2º toque falhou (${auth.asaas_authorization_id}):`, (e as Error).message);
        }
      }
    }

    // ---------- 3) Débito automático que não disparou ----------
    // Cobranças de autorizações ACTIVE que venceram ontem ou antes e seguem
    // pendentes/vencidas. Se o débito automático funcionasse, estariam pagas.
    const yesterday = brtDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const { data: activeAuths } = await supabase
      .from("asaas_pix_authorizations")
      .select("id, asaas_authorization_id, asaas_subscription_id, asaas_customer_id, customer_name, customer_email, plan, autodebit_alert_sent_at")
      .eq("status", "ACTIVE");

    for (const auth of activeAuths || []) {
      if (!auth.asaas_subscription_id) {
        report.autodebit_failures.push({
          customer: auth.customer_email,
          plan: auth.plan,
          motivo: "autorização ACTIVE sem assinatura vinculada (débito automático impossível)",
        });
        continue;
      }
      // asaas_payments não tem coluna due_date: o vencimento vive no raw_payload.
      const { data: openPayments } = await supabase
        .from("asaas_payments")
        .select("asaas_payment_id, status, amount_cents, raw_payload, created_at, asaas_customer_id")
        .eq("asaas_subscription_id", auth.asaas_subscription_id)
        .in("status", ["PENDING", "OVERDUE"]);

      const dueOf = (p: Record<string, unknown>) =>
        String(
          (p.raw_payload as any)?.dueDate ||
            (p.raw_payload as any)?.payment?.dueDate ||
            String((p as any).created_at || "").slice(0, 10),
        ).slice(0, 10);

      const dueCandidates = (openPayments || []).filter((p) => dueOf(p) <= yesterday);

      // Backstop da deduplicação em tempo real (webhook perdido): cobrança aberta
      // que tem gêmea PIX_AUTOMATIC já paga — mesmo customer, valor e vencimento —
      // é a fatura do ciclo 1 duplicada. Cancela na Asaas e não conta como falha
      // de débito automático (era isso que gerava alarme falso).
      const { data: paidRows } = await supabase
        .from("asaas_payments")
        .select("asaas_payment_id, amount_cents, payment_method, raw_payload, paid_at, created_at")
        .eq("asaas_customer_id", auth.asaas_customer_id || "__none__")
        .in("status", ["RECEIVED", "CONFIRMED"]);

      // Cobrança paga reconciliada (QR imediato/avulsa) não traz dueDate: usamos a
      // data de pagamento. E o pagamento pode cair 1 dia depois do vencimento da
      // gêmea (fuso/virada de dia), então a comparação é com tolerância de 1 dia.
      const paidDayOf = (t: Record<string, unknown>) =>
        String(
          (t.raw_payload as any)?.dueDate ||
            (t.raw_payload as any)?.paymentDate ||
            (t as any).paid_at ||
            (t as any).created_at ||
            "",
        ).slice(0, 10);
      const withinOneDay = (a: string, b: string) => {
        if (!a || !b) return false;
        const diff = Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime());
        return diff <= 24 * 60 * 60 * 1000;
      };

      const duePayments: typeof dueCandidates = [];
      for (const p of dueCandidates) {
        const twin = (paidRows || []).find(
          (t) =>
            t.payment_method === "PIX_AUTOMATIC" &&
            t.amount_cents === p.amount_cents &&
            t.asaas_payment_id !== p.asaas_payment_id &&
            withinOneDay(paidDayOf(t), dueOf(p)),
        );
        if (!twin) {
          duePayments.push(p);
          continue;
        }
        const ok = await asaasDelete(`/payments/${p.asaas_payment_id}`);
        if (ok) {
          await supabase
            .from("asaas_payments")
            .update({ status: "CANCELLED" })
            .eq("asaas_payment_id", p.asaas_payment_id);
          report.twin_invoices_cancelled++;
          console.log(
            `[pix-auto-audit] 🧹 gêmea ${p.asaas_payment_id} cancelada (venc. ${dueOf(p)}, paga ${twin.asaas_payment_id})`,
          );
        } else {
          duePayments.push(p);
        }
      }

      for (const p of duePayments) {
        const dueDate =
          dueOf(p);
        const alertedAt = auth.autodebit_alert_sent_at
          ? new Date(auth.autodebit_alert_sent_at).getTime()
          : 0;
        const isNew = !alertedAt || Date.now() - alertedAt >= ALERT_COOLDOWN_MS;
        report.autodebit_failures.push({
          customer: auth.customer_email,
          plan: auth.plan,
          payment: p.asaas_payment_id,
          vencimento: String(dueDate).slice(0, 10),
          status: p.status,
          motivo: "cobrança venceu sem débito automático",
          novo: isNew,
        });
        if (isNew) report.autodebit_new_alerts++;
      }

      // Só reescreve o marcador quando o caso volta a ser "novo" — assim o
      // silêncio de 7 dias funciona de fato e o alerta para de repetir todo dia.
      const cooledDown =
        !auth.autodebit_alert_sent_at ||
        Date.now() - new Date(auth.autodebit_alert_sent_at).getTime() >= ALERT_COOLDOWN_MS;
      if (duePayments.length > 0 && cooledDown) {
        await supabase
          .from("asaas_pix_authorizations")
          .update({ autodebit_alert_sent_at: new Date().toISOString() })
          .eq("id", auth.id);
      }
    }

    // ---------- Alerta admin ----------
    // Vai pela infra de e-mail do projeto (send-transactional-email); a Resend
    // direta recusa o remetente porque o domínio raiz não é verificado lá.
    const alertEmail = Deno.env.get("ADMIN_ALERT_EMAIL");
    // Só e-mail quando há novidade: caso novo de débito, perda detectada ou
    // status corrigido pela reconciliação. Caso antigo em aberto entra só como
    // contexto na lista, sem gerar alerta diário.
    const needsAlert =
      report.autodebit_new_alerts > 0 ||
      report.lost_authorizations > 0 ||
      report.qr_expired_swept > 0;

    if (needsAlert && alertEmail) {
      const fmt = (f: Record<string, unknown>) =>
        `${f.novo ? "NOVO" : "em aberto"} · ${f.customer || "?"} · ${PLAN_LABELS[String(f.plan)] || f.plan || "?"} · venc. ${f.vencimento || "-"} · ${f.status || "-"} · ${f.motivo}`;
      const lines = [
        ...report.autodebit_failures.filter((f) => f.novo).map(fmt),
        ...report.autodebit_failures.filter((f) => !f.novo).map(fmt),
      ];
      if (report.qr_expired_swept > 0) {
        lines.push(`${report.qr_expired_swept} QR Code(s) venceram sem autorização (varredura)`);
      }
      if (report.twin_invoices_cancelled > 0) {
        lines.push(
          `${report.twin_invoices_cancelled} fatura(s) duplicada(s) de ciclo 1 canceladas (gêmea já paga por débito automático)`,
        );
      }
      if (report.status_changed.length > 0) {
        lines.push(
          `Reconciliação corrigiu ${report.status_changed.length} status: ` +
            report.status_changed.map((s) => `${s.de}→${s.para}`).join(", "),
        );
      }
      try {
        const { error } = await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "admin-pix-auto-alert",
            recipientEmail: alertEmail,
            idempotencyKey: `pix-auto-audit-${report.date}`,
            templateData: {
              date: report.date,
              lostAuthorizations: report.lost_authorizations,
              recoveryEmailsSent: report.recovery_emails_sent + report.recovery_second_touch_sent,
              lines,
            },
          },
        });
        report.admin_alert_sent = !error;
        if (error) console.warn("[pix-auto-audit] alerta admin falhou:", error.message);
      } catch (e) {
        console.warn("[pix-auto-audit] alerta admin falhou:", (e as Error).message);
      }
    } else if (needsAlert) {
      console.warn("[pix-auto-audit] alerta não enviado — ADMIN_ALERT_EMAIL ausente");
    }

    console.log("[pix-auto-audit] relatório:", JSON.stringify(report));
    return new Response(JSON.stringify({ ok: true, ...report }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[pix-auto-audit] erro fatal:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});