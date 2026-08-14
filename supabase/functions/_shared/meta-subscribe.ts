// Evento `Subscribe`: a conversão comercial de verdade — a 1ª cobrança CHEIA do
// ciclo (dia 8), depois da 1ª semana por R$ 6,90.
//
// Por que existe: o `Purchase` mede AQUISIÇÃO e hoje sai sempre com value 6,90
// (entrada única de todo o funil). Isso faz o Meta acusar "todos os eventos com
// o mesmo preço" e calcular o ROAS sobre 6,90. O `Subscribe` carrega o valor
// real do ciclo (29,90 / 59,70 / 118,80 ...), dando receita correta.
//
// IMPORTANTE: `Subscribe` é MEDIÇÃO, não alvo de campanha. A otimização segue
// no `Purchase` (evento frequente e barato = CAC menor).
//
// Fire-and-forget: nunca lança, nunca bloqueia ativação/renovação.
import { resolveMetaIdentity } from "./meta-identity.ts";
import { sendOpenAiConversion } from "./openai-capi.ts";
import { sendGa4Purchase } from "./ga4-purchase.ts";

const PLAN_LABELS: Record<string, string> = {
  essencial: "Essencial",
  direcao: "Direção",
  transformacao: "Transformação",
};

export async function fireSubscribeConversion(
  supabase: any,
  args: {
    /** Determinístico por cobrança (ex.: `sub_xxx-in_yyy`) — garante dedupe. */
    eventId: string;
    email?: string | null;
    phone?: string | null;
    firstName?: string | null;
    fbp?: string | null;
    fbc?: string | null;
    /** Valor efetivamente cobrado no ciclo, em reais. */
    value: number;
    plan: string;
    billingCycle?: string | null;
    source: string;
  },
): Promise<void> {
  try {
    if (!args.email && !args.phone) {
      console.log(`[${args.source}] ⏭️ Subscribe sem email/telefone — ignorado`);
      return;
    }
    if (!Number.isFinite(args.value) || args.value <= 0) {
      console.log(`[${args.source}] ⏭️ Subscribe sem valor válido — ignorado`);
      return;
    }

    const { data: prior } = await supabase
      .from("meta_capi_log").select("id")
      .eq("event_id", args.eventId).eq("event_name", "Subscribe")
      .eq("meta_status", 200).limit(1).maybeSingle();
    if (prior) {
      console.log(`[${args.source}] ⏭️ Subscribe já enviado (${args.eventId})`);
      return;
    }

    const ident = await resolveMetaIdentity(supabase, {
      email: args.email, phone: args.phone, fbp: args.fbp, fbc: args.fbc,
    });

    const planName = PLAN_LABELS[args.plan] || args.plan;
    const contentName = `Assinatura ${planName}${args.billingCycle ? ` (${args.billingCycle})` : ""}`;

    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${url}/functions/v1/meta-capi`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        event_name: "Subscribe",
        event_id: args.eventId,
        event_source_url: "https://olaaura.com.br/obrigado",
        source: args.source,
        user_data: {
          email: args.email || undefined,
          phone: args.phone || undefined,
          first_name: args.firstName || undefined,
          ...(ident.fbp && { fbp: ident.fbp }),
          ...(ident.fbc && { fbc: ident.fbc }),
        },
        custom_data: {
          value: args.value,
          currency: "BRL",
          content_name: contentName,
          content_category: args.plan,
          ...(args.billingCycle && { predicted_ltv: args.value }),
        },
      }),
    });

    await sendOpenAiConversion({
      eventType: "subscribe",
      eventId: args.eventId,
      value: args.value,
      currency: "BRL",
      contentName,
      source: args.source,
    });

    await sendGa4Purchase({
      email: args.email || undefined,
      transactionId: args.eventId,
      value: args.value,
      plan: args.plan,
      planName,
      eventName: "subscribe",
      eventSourceUrl: "https://olaaura.com.br/obrigado",
      source: args.source,
    });

    console.log(`[${args.source}] ✅ Subscribe enviado (${args.eventId}, R$ ${args.value})`);
  } catch (e) {
    console.warn(`[${args.source}] ⚠️ Subscribe falhou (non-blocking):`, (e as Error)?.message);
  }
}