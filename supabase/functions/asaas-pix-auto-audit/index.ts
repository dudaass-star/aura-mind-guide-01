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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const report = {
    date: brtDateString(),
    lost_authorizations: 0,
    recovery_emails_sent: 0,
    autodebit_failures: [] as Array<Record<string, unknown>>,
    admin_alert_sent: false,
  };

  try {
    // ---------- 1) Autorizações perdidas nas últimas 48h ----------
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: lost } = await supabase
      .from("asaas_pix_authorizations")
      .select("id, asaas_authorization_id, status, plan, customer_name, customer_email, created_at, recovery_email_sent_at")
      .in("status", ["REFUSED", "EXPIRED", "REJECTED"])
      .is("activated_at", null)
      .is("recovery_email_sent_at", null)
      .gte("created_at", since);

    report.lost_authorizations = lost?.length || 0;

    for (const auth of lost || []) {
      if (!auth.customer_email) continue;
      const firstName = (auth.customer_name || "").split(" ")[0] || null;
      const link = `https://olaaura.com.br/v2${auth.plan ? `?plan=${auth.plan}` : ""}${auth.plan ? "&" : "?"}utm_source=email&utm_medium=recovery&utm_campaign=pix_auto`;
      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "pix-auto-not-authorized",
            recipientEmail: auth.customer_email,
            idempotencyKey: `pix-auto-not-authorized-${auth.asaas_authorization_id}`,
            templateData: { name: firstName, plan: auth.plan, checkoutLink: link },
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
    }

    // ---------- 2) Débito automático que não disparou ----------
    // Cobranças de autorizações ACTIVE que venceram ontem ou antes e seguem
    // pendentes/vencidas. Se o débito automático funcionasse, estariam pagas.
    const yesterday = brtDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const { data: activeAuths } = await supabase
      .from("asaas_pix_authorizations")
      .select("id, asaas_authorization_id, asaas_subscription_id, customer_name, customer_email, plan, autodebit_alert_sent_at")
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
        .select("asaas_payment_id, status, amount_cents, raw_payload, created_at")
        .eq("asaas_subscription_id", auth.asaas_subscription_id)
        .in("status", ["PENDING", "OVERDUE"]);

      const duePayments = (openPayments || []).filter((p) => {
        const dueDate =
          (p.raw_payload as any)?.dueDate ||
          (p.raw_payload as any)?.payment?.dueDate ||
          String(p.created_at || "").slice(0, 10);
        return String(dueDate).slice(0, 10) <= yesterday;
      });

      for (const p of duePayments) {
        const dueDate =
          (p.raw_payload as any)?.dueDate ||
          (p.raw_payload as any)?.payment?.dueDate ||
          String(p.created_at || "").slice(0, 10);
        report.autodebit_failures.push({
          customer: auth.customer_email,
          plan: auth.plan,
          payment: p.asaas_payment_id,
          vencimento: String(dueDate).slice(0, 10),
          status: p.status,
          motivo: "cobrança venceu sem débito automático",
        });
      }

      if (duePayments.length > 0) {
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
    const needsAlert = report.autodebit_failures.length > 0 || report.lost_authorizations > 0;

    if (needsAlert && alertEmail) {
      const lines = report.autodebit_failures.map(
        (f) =>
          `${f.customer || "?"} · ${PLAN_LABELS[String(f.plan)] || f.plan || "?"} · venc. ${f.vencimento || "-"} · ${f.status || "-"} · ${f.motivo}`,
      );
      try {
        const { error } = await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "admin-pix-auto-alert",
            recipientEmail: alertEmail,
            idempotencyKey: `pix-auto-audit-${report.date}`,
            templateData: {
              date: report.date,
              lostAuthorizations: report.lost_authorizations,
              recoveryEmailsSent: report.recovery_emails_sent,
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