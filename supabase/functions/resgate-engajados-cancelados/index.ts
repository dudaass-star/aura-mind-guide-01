// Campanha pontual de reencontro para clientes cancelados super engajados.
// Fora da janela de 24h a Meta só entrega template aprovado: enviamos o
// template da categoria `reconnect` (cheking_7dias2). Se a pessoa responder,
// a janela abre e o process-webhook-message devolve a resposta acolhedora com
// o link do espaço (/meu-espaco → banner "Reativar").
// Padrão: dry_run. Idempotente via profiles.last_reactivation_sent (30 dias).
// Respeita horário silencioso 22h-08h BRT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { sendProactive } from "../_shared/whatsapp-provider.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LIMITE = 38;
const MIN_MENSAGENS = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false;
    const hour = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
    if (!dryRun && (hour >= 22 || hour < 8)) return json({ error: "Horário silencioso" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: perfis, error } = await sb.from("profiles")
      .select("id, user_id, name, phone, status, plan_expires_at, last_reactivation_sent")
      .eq("status", "canceled")
      .not("phone", "is", null);
    if (error) throw error;

    const agora = Date.now();
    const elegiveis: any[] = [];
    for (const p of perfis ?? []) {
      if (p.plan_expires_at && Date.parse(p.plan_expires_at) > agora) continue; // ainda com acesso
      const { count } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("user_id", p.user_id);
      if ((count ?? 0) >= MIN_MENSAGENS) elegiveis.push({ ...p, msgs: count });
    }
    elegiveis.sort((a, b) => b.msgs - a.msgs);
    const lote = elegiveis.slice(0, LIMITE);

    const results: any[] = [];
    for (const u of lote) {
      const nome = u.name?.trim().split(/\s+/)[0] || "";
      const r: any = { nome, msgs: u.msgs };
      if (u.last_reactivation_sent && agora - Date.parse(u.last_reactivation_sent) < 30 * 864e5) {
        results.push({ ...r, skip: "reencontro nos últimos 30 dias" }); continue;
      }
      const { data: last } = await sb.from("messages").select("created_at").eq("user_id", u.user_id)
        .order("created_at", { ascending: false }).limit(1);
      if (last?.[0] && agora - Date.parse(last[0].created_at) < 864e5) {
        results.push({ ...r, skip: "conversa <24h" }); continue;
      }
      const texto = `Oi${nome ? `, ${nome}` : ""}! 💜 Passando pra saber como você está.`;
      if (dryRun) { results.push({ ...r, would_send: true }); continue; }
      const res = await sendProactive(cleanPhoneNumber(u.phone), texto, "reconnect", u.user_id);
      if (res.success) {
        await sb.from("profiles").update({ last_reactivation_sent: new Date().toISOString() }).eq("id", u.id);
        await sb.from("messages").insert({ user_id: u.user_id, role: "assistant", content: texto });
        results.push({ ...r, sent: true });
      } else results.push({ ...r, error: res.error });
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    return json({
      dry_run: dryRun,
      total: results.length,
      enviaria_ou_enviou: results.filter((x) => x.would_send || x.sent).length,
      results,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
