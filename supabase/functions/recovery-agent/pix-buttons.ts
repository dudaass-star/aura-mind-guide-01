/**
 * Roteamento determinístico dos cliques de quick reply dos templates do trilho
 * "copiou o código PIX" (15 min e 2h).
 *
 * Os cliques chegam no webhook-twilio-recovery como TEXTO (campo ButtonText do
 * Twilio) e já são gravados como inbound. Aqui eles deixam de ser "mais uma
 * frase pro LLM" e passam a resolver o problema:
 *
 *   - "Gerar novo código" / "Tive um erro" → devolve um copia-e-cola VÁLIDO na
 *     hora (reaproveita o QR se ainda vale, gera outro se expirou).
 *   - "Já paguei" → confere ao vivo na Woovi; se pagou, confirma o acesso e não
 *     oferece nada.
 *   - Dúvida / "Vou pagar agora" → não é determinístico: segue pro agente
 *     conversacional, mas com o contexto de que a pessoa copiou e travou.
 */

import { hasLiveWooviCommitment } from "../_shared/woovi-recovery-guard.ts";
import { getPhoneVariations, normalizeBrazilianPhone } from "../_shared/zapi-client.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

export type PixButtonIntent = "new_code" | "already_paid" | "conversational" | null;

const RE_NEW_CODE = /(gerar novo c[oó]digo|tive um erro|c[oó]digo (n[aã]o|nao) funciona|expirou)/i;
const RE_ALREADY_PAID = /^\s*(j[aá] paguei|paguei|j[aá] pagou)\s*[.!]?\s*$/i;
const RE_DOUBT = /(ficou uma d[uú]vida|tenho uma d[uú]vida|vou pagar agora)/i;

/**
 * "Dúvida em branco": o lead DECLARA que tem dúvida mas não diz qual (o clique do
 * quick reply "Ficou uma dúvida" é exatamente isso). Aqui o agente não pode
 * adivinhar — tem que perguntar. Só bate em mensagem curta, pra não engolir
 * "tenho uma dúvida: o valor de 29,90 é cobrado quando?".
 */
const RE_DOUBT_BLANK =
  /^\s*(sim,?\s*)?(oi,?\s*)?((eu\s+)?(ainda\s+)?(fiquei|ficou|tenho|teria|tinha|surgiu)\s+(com\s+)?(uma|umas|algumas|uma\s+pequena)?\s*d[uú]vidas?|(queria|gostaria de|posso)\s+(tirar\s+uma\s+d[uú]vida|perguntar\s+(uma\s+coisa|algo))|d[uú]vidas?|posso\s+(te\s+)?perguntar(\s+uma\s+coisa)?)\s*[.!?]*\s*$/i;

export function isBlankDoubt(text: string): boolean {
  const t = (text || "").trim();
  if (!t || t.length > 60) return false;
  return RE_DOUBT_BLANK.test(t);
}

/** Classifica o texto do clique. `null` = não é clique de botão do trilho. */
export function classifyPixButton(text: string): PixButtonIntent {
  const t = (text || "").trim();
  if (!t) return null;
  if (RE_NEW_CODE.test(t)) return "new_code";
  if (RE_ALREADY_PAID.test(t)) return "already_paid";
  if (RE_DOUBT.test(t)) return "conversational";
  return null;
}

/** Assinatura Woovi mais recente do contato (por telefone ou e-mail). */
async function findLatestSubscription(
  supabase: Supa,
  phone: string,
  email?: string | null,
): Promise<Record<string, unknown> | null> {
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const digits = normalizeBrazilianPhone(phone);
  if (digits) {
    const { data } = await supabase
      .from("woovi_subscriptions")
      .select("*")
      .ilike("customer_phone", `%${digits.slice(-8)}%`)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data?.[0]) return data[0];
  }
  if (email) {
    const { data } = await supabase
      .from("woovi_subscriptions")
      .select("*")
      .eq("customer_email", email.toLowerCase())
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data?.[0]) return data[0];
  }
  return null;
}

/** Cliente já ativo no app? (não pode receber código nenhum) */
async function isActiveCustomer(supabase: Supa, phone: string): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .in("phone", getPhoneVariations(phone))
    .in("status", ["active", "trial", "canceling"])
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Trava: no máximo UM código gerado por hora para o mesmo telefone. Sem isso,
 * cliques repetidos no botão criariam mandatos duplicados.
 */
async function recentCodeSent(supabase: Supa, phone: string): Promise<string | null> {
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("recovery_messages")
    .select("body, metadata, created_at")
    .eq("phone", phone)
    .eq("direction", "out")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);
  for (const m of data || []) {
    // deno-lint-ignore no-explicit-any
    if ((m as any)?.metadata?.pix_code_sent) return String((m as any).metadata.pix_code || "") || null;
  }
  return null;
}

function qrStillValid(sub: Record<string, unknown> | null): string | null {
  if (!sub) return null;
  const payload = sub.qr_payload ? String(sub.qr_payload) : "";
  const exp = sub.qr_expires_at ? new Date(String(sub.qr_expires_at)).getTime() : 0;
  if (!payload) return null;
  // 5 min de margem: código que morre no meio do pagamento é pior que nenhum.
  if (exp && exp - Date.now() < 5 * 60 * 1000) return null;
  return payload;
}

export interface PixButtonResult {
  handled: boolean;
  body?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Resolve o clique. Retorna `handled: false` quando o caso deve seguir para o
 * agente conversacional.
 */
export async function handlePixButton(
  supabase: Supa,
  intent: Exclude<PixButtonIntent, null | "conversational">,
  phone: string,
  checkout: { plan?: string | null; billing?: string | null; name?: string | null; email?: string | null } | null,
): Promise<PixButtonResult> {
  const email = checkout?.email ?? null;

  // 1. Já pagou / já autorizou? Nunca oferecer pagamento de novo.
  const live = await hasLiveWooviCommitment(supabase, { email, phone });
  const active = await isActiveCustomer(supabase, phone);
  if (live.committed || active) {
    return {
      handled: true,
      body: "Achei aqui: seu pagamento entrou e o acesso já está liberado. A Aura te chama no WhatsApp oficial dela em alguns minutos — se preferir, você pode escrever primeiro e ela responde. Seu histórico fica em olaaura.com.br/meu-espaco.",
      metadata: { pix_button: intent, resolution: "already_paid", reason: live.reason ?? (active ? "active_profile" : null) },
    };
  }

  if (intent === "already_paid") {
    return {
      handled: true,
      body: "Ainda não vi o pagamento cair aqui — às vezes o banco leva alguns minutos. Se você tem o comprovante, manda a print aqui que eu confiro na hora. Se travou no meio, me diz que eu já te mando um código novo.",
      metadata: { pix_button: intent, resolution: "payment_not_found" },
    };
  }

  // 2. Código novo. Trava de 1 por hora.
  const recent = await recentCodeSent(supabase, phone);
  if (recent) {
    return {
      handled: true,
      body: `Esse é o código que te mandei agora, ainda válido — cola no PIX copia e cola do app do banco:\n\n${recent}\n\nSe der erro na hora de confirmar, me diz qual banco você está usando que eu te ajudo.`,
      metadata: { pix_button: intent, resolution: "code_reused_recent" },
    };
  }

  const sub = await findLatestSubscription(supabase, phone, email);
  const valid = qrStillValid(sub);
  if (valid) {
    return {
      handled: true,
      body: `Seu código continua valendo — é só colar no PIX copia e cola do app do banco:\n\n${valid}\n\nAssim que entrar, a Aura te chama no WhatsApp e a gente já marca seu primeiro encontro guiado pra hoje se você quiser.`,
      metadata: { pix_button: intent, resolution: "qr_reused", pix_code_sent: true, pix_code: valid },
    };
  }

  // 3. QR expirado: gera outro reusando os dados do cadastro anterior.
  const plan = (checkout?.plan || sub?.plan || "") as string;
  const billing = (checkout?.billing || sub?.billing_period || "monthly") as string;
  const name = (checkout?.name || sub?.customer_name || "Cliente") as string;
  const mail = (email || sub?.customer_email || "") as string;
  const cpf = (sub?.customer_cpf || "") as string;

  if (!plan || !mail || !cpf) {
    return {
      handled: true,
      body: "Consigo gerar um código novo pra você agora — só me confirma seu CPF (é o que o banco exige pro PIX Automático) e qual plano você quer, que eu mando o copia e cola na sequência.",
      metadata: { pix_button: intent, resolution: "missing_data", missing: { plan: !plan, email: !mail, cpf: !cpf } },
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke("criar-pix-recorrente-woovi", {
      body: {
        mode: "checkout",
        plan,
        billing,
        name,
        email: mail,
        phone,
        cpf,
        requestKey: `recovery_btn_${normalizeBrazilianPhone(phone)}_${Math.floor(Date.now() / 3600000)}`,
      },
    });
    if (error) throw new Error(error.message);
    if (data?.blocked) {
      return {
        handled: true,
        body: "Sua assinatura já está de pé aqui — não precisa pagar de novo. Qualquer ajuste de plano ou de forma de pagamento você faz em olaaura.com.br/meu-espaco.",
        metadata: { pix_button: intent, resolution: "already_subscribed" },
      };
    }
    const code = data?.copyPaste ? String(data.copyPaste) : "";
    if (!code) throw new Error("sem copyPaste na resposta");
    return {
      handled: true,
      body: `Código novo, gerado agora — cola no PIX copia e cola do app do banco:\n\n${code}\n\nO banco vai mostrar o valor da mensalidade como autorização, mas hoje sai só a primeira semana. Assim que entrar, a Aura te chama e a gente marca seu primeiro encontro guiado.`,
      metadata: { pix_button: intent, resolution: "qr_regenerated", pix_code_sent: true, pix_code: code },
    };
  } catch (e) {
    console.error("[recovery-agent] falha ao gerar PIX novo:", (e as Error)?.message);
    return {
      handled: true,
      body: "O banco recusou a geração agora — isso costuma ser instabilidade do PIX Automático e passa em minutos. Me responde aqui em uns 10 minutos que eu gero de novo pra você, ou entra em olaaura.com.br/v2/checkout que o código sai na tela.",
      metadata: { pix_button: intent, resolution: "generation_failed" },
    };
  }
}

// ============================================================
// Encontro avulso de R$ 6,90 (taster) — resolução determinística
// ------------------------------------------------------------
// Chegou pelo botão do template (Porta B) ou como aceite curto depois de a
// oferta ter saído em texto livre (Porta A). Em nenhum dos casos o LLM decide:
// a elegibilidade é do backend e o código é gerado aqui.
// ============================================================

const RE_TASTER_BUTTON = /(quero experimentar|experimentar (a|uma) sess[aã]o|quero (a )?sess[aã]o avulsa|quero o encontro)/i;
const RE_SHORT_ACCEPT = /^\s*(sim|quero|bora|vamos|manda|fechado|topo|pode mandar|manda o c[oó]digo|quero sim)\s*[.!]?\s*$/i;

/**
 * `button` = clique/pedido explícito. `short_accept` = "quero/bora" solto, que
 * só vale se a oferta já tiver saído nas mensagens anteriores.
 */
export function classifyTasterIntent(text: string): "button" | "short_accept" | null {
  const t = (text || "").trim();
  if (!t) return null;
  if (RE_TASTER_BUTTON.test(t)) return "button";
  if (RE_SHORT_ACCEPT.test(t)) return "short_accept";
  return null;
}

/** A oferta do encontro avulso já saiu para este telefone? */
export async function tasterOfferAlreadySent(supabase: Supa, phone: string): Promise<boolean> {
  const { data } = await supabase
    .from("recovery_messages")
    .select("metadata, body")
    .eq("phone", normalizeBrazilianPhone(phone))
    .eq("direction", "out")
    .order("created_at", { ascending: false })
    .limit(12);
  for (const m of data || []) {
    // deno-lint-ignore no-explicit-any
    const meta = (m as any)?.metadata || {};
    if (meta.taster_offered || meta.taster === true || meta.template === "copiou_taster") return true;
    if (typeof (m as any)?.body === "string" && /6,90/.test((m as any).body) && /45 minutos/i.test((m as any).body)) return true;
  }
  return false;
}

/**
 * Gera o código de R$ 6,90 na hora. Toda trava (cliente ativo, ex-assinante,
 * cooldown, rastro do trilho, kill switch) vive em `criar-pix-taster`.
 */
export async function handleTasterAccept(
  supabase: Supa,
  phone: string,
  checkout: { plan?: string | null; billing?: string | null; name?: string | null; email?: string | null } | null,
  source: string,
): Promise<PixButtonResult> {
  try {
    const { data, error } = await supabase.functions.invoke("criar-pix-taster", {
      body: {
        phone,
        name: checkout?.name ?? null,
        email: checkout?.email ?? null,
        source,
      },
    });
    if (error) throw new Error(error.message);

    if (!data?.ok || !data?.copyPaste) {
      const reason = String(data?.reason || "falha");
      // Não elegível: nunca inventar oferta. Segue conversa normal.
      if (["cliente_ativo", "cliente_ativo_email", "ex_assinante", "ex_assinante_email",
           "taster_ja_usado", "taster_ja_pago", "pagou_asaas", "pagou_woovi",
           "sem_rastro_trilho_pix", "checkout_concluido", "desligado_por_config"].includes(reason)) {
        console.log(`[recovery-agent] taster não elegível: ${reason}`);
        return { handled: false };
      }
      return {
        handled: true,
        body: "O banco recusou a geração agora — costuma ser instabilidade e passa em minutos. Me responde aqui em uns 10 minutos que eu gero de novo pra você.",
        metadata: { taster: true, resolution: `falha_${reason}` },
      };
    }

    const code = String(data.copyPaste);
    return {
      handled: true,
      body:
        "Fechado. Esse é o código de R$ 6,90 do encontro guiado de 45 minutos — PIX comum, copia e cola normal, sem autorizar nada automático:\n\n" +
        `${code}\n\n` +
        "Assim que cair, a Aura te chama no WhatsApp oficial dela e vocês marcam o horário. Você tem 48h pra fazer o encontro — depois, se fizer sentido, você escolhe o plano com calma.",
      metadata: {
        taster: true,
        taster_offered: true,
        resolution: "taster_code_sent",
        correlation_id: data.correlationId ?? null,
        pix_code_sent: true,
        pix_code: code,
      },
    };
  } catch (e) {
    console.error("[recovery-agent] falha no taster:", (e as Error)?.message);
    return {
      handled: true,
      body: "Deu um erro aqui na hora de gerar o código. Me responde em alguns minutos que eu mando pra você.",
      metadata: { taster: true, resolution: "exception" },
    };
  }
}
