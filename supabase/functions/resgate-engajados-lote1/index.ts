// Disparo pontual (Lote 1) de reencontro para clientes super engajados inativos.
// Lista fixa e idempotente: pula quem já recebeu reativação nos últimos 30 dias
// ou falou com a AURA nas últimas 24h. Respeita horário silencioso 22h-08h BRT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanPhoneNumber } from "../_shared/zapi-client.ts";
import { sendProactive } from "../_shared/whatsapp-provider.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOTE1 = [
  "63bf6d7b-d62a-4555-8f09-cca74c0cbdd1","3e769be3-b881-4761-b6c2-7818506b0f8e",
  "1696c4fe-e71d-41ca-9907-4119eb8e14ae","2c9876d6-a03e-402f-955d-c1edf483b2b9",
  "6f56ef68-681d-4215-b2a6-43c86c8dddc7","aa5147bc-c94a-46e8-a80d-3e6a09ecba89",
  "5e33a7ea-8f90-4629-8f69-4d43a2958a1e","7cc08615-b8db-46ac-855b-19af8689fb6b",
  "4ccbd746-c445-45d5-8fdc-a1dfc16b895d","9d589c32-370f-472a-b8ce-8e828c27b81e",
  "df761d75-657b-404c-9a95-16055d60c3c3","18e7b407-b14f-416a-bbe5-56b94b2446ac",
  "6d37f544-4082-4f62-8ee8-b52c54a36b49","e1ff6aa3-b4e8-42a3-9e7b-7fc27291fc85",
  "1c7c75b0-3979-4919-84a0-a2673df9005e","22f890a7-3c2f-4ad9-8caa-cd81345e51ec",
  "70974d6f-e50c-4c92-b751-bfff6800c4ae","967a7fe0-92ec-4c1e-8fa5-d5bbc2e0ee3b",
  "073f2242-a86b-492b-b459-ccb6ff6581e7",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false;
    const hour = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
    if (hour >= 22 || hour < 8) return json({ error: "Horário silencioso" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: users, error } = await sb.from("profiles")
      .select("user_id, name, phone, status, last_reactivation_sent").in("user_id", LOTE1);
    if (error) throw error;

    const now = Date.now();
    const results: any[] = [];
    for (const u of users ?? []) {
      const nome = u.name?.split(" ")[0] || "";
      const r: any = { nome };
      if (!u.phone || u.status === "active") { results.push({ ...r, skip: "sem telefone/ativo" }); continue; }
      if (u.last_reactivation_sent && now - new Date(u.last_reactivation_sent).getTime() < 30 * 864e5) {
        results.push({ ...r, skip: "já recebeu" }); continue;
      }
      const { data: last } = await sb.from("messages").select("created_at").eq("user_id", u.user_id)
        .order("created_at", { ascending: false }).limit(1);
      if (last?.[0] && now - new Date(last[0].created_at).getTime() < 864e5) {
        results.push({ ...r, skip: "conversa <24h" }); continue;
      }
      const msg = `Oi${nome ? `, ${nome}` : ""}. 💜 Faz um tempo que a gente não conversa, e lembrei de você e dos nossos encontros.|||Como você tá por aí? Se quiser retomar, tô aqui: 👉 https://olaaura.com.br/meu-espaco`;
      if (dryRun) { results.push({ ...r, would_send: true }); continue; }
      const res = await sendProactive(cleanPhoneNumber(u.phone), msg, "reconnect", u.user_id);
      if (res.success) {
        await sb.from("profiles").update({ last_reactivation_sent: new Date().toISOString() }).eq("user_id", u.user_id);
        await sb.from("messages").insert({ user_id: u.user_id, role: "assistant", content: msg });
        results.push({ ...r, sent: true });
      } else results.push({ ...r, error: res.error });
      await new Promise((ok) => setTimeout(ok, 1500));
    }
    return json({ dry_run: dryRun, total: results.length, results });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
