/**
 * Agente de resposta automática para leads que responderam ao template de
 * recuperação de carrinho abandonado (subaccount Twilio de recovery).
 *
 * Fluxo (chamado fire-and-forget pelo webhook-twilio-recovery):
 *  1. Carrega config (kill switch)
 *  2. GUARD: telefone pertence a usuário ativo/trial/canceling? → pausa, NÃO responde
 *  3. Quiet hours 22-08 BRT → skip
 *  4. Conversa já bateu limite ou foi pausada → skip
 *  5. Saudação muito curta → skip
 *  6. Stop words (atendente/humano/parar) → pausa, NÃO responde
 *  7. Carrega histórico + contexto checkout + KB injetada
 *  8. Chama Lovable AI Gateway (Gemini Flash)
 *  9. Parse tags [ENVIAR_LINK]/[ESCALAR_HUMANO]/[STOP]
 * 10. Envia via Twilio subaccount, grava recovery_messages, atualiza conversa
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhoneVariations, normalizeBrazilianPhone } from "../_shared/zapi-client.ts";
import { classifyPixButton, handlePixButton, classifyTasterIntent, handleTasterAccept, tasterOfferAlreadySent, isBlankDoubt } from "./pix-buttons.ts";
import { isTasterTestPhone } from "../_shared/taster.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHECKOUT_URL = "https://olaaura.com.br/v2/checkout?utm_source=whatsapp&utm_medium=recovery_agent&utm_campaign=auto_reply";
const SUPPORT_EMAIL = "suporte@olaaura.com.br";
// `duvida_tecnica` (16 itens, quase todos sobre PIX Automático) SAIU do
// always-include: quando ela entrava em todo prompt, o agente explicava
// autorização/8º dia mesmo pra quem falou de outra coisa. Agora entra por
// relevância (palavra do lead ou contexto de "copiou o código").
const ALWAYS_CATEGORIES = [
  "preco", "garantia", "como_funciona", "pagamento", "seguranca", "beneficio",
  "objecao",
];

const HISTORY_LIMIT = 12;
const MAX_KB_ITEMS = 40;

/**
 * Valores por plano, alinhados a `src/pages/CheckoutV2.tsx` (1ª semana) e
 * `src/lib/plan-pricing.ts` (mensal). Ficam aqui pra que o agente fale sempre
 * o número do plano DAQUELE lead, em vez de número chumbado no prompt.
 */
const PLAN_VALUES: Record<string, { label: string; trial: string; monthly: string }> = {
  essencial: { label: "Essencial", trial: "6,90", monthly: "29,90" },
  direcao: { label: "Direção", trial: "9,90", monthly: "49,90" },
  transformacao: { label: "Transformação", trial: "19,90", monthly: "79,90" },
};

function normalizePlanKey(plan?: string | null): string | null {
  if (!plan) return null;
  const p = plan.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (p.includes("essencial")) return "essencial";
  if (p.includes("direcao")) return "direcao";
  if (p.includes("transforma")) return "transformacao";
  return null;
}

const STOP_WORDS = [
  /\batendente\b/i, /\bhumano\b/i, /\bpessoa de verdade\b/i,
  /\bn[aã]o quero\b/i, /\bpara de me mandar\b/i, /\bparem? de mandar\b/i,
  /\bremove(r)? meu n[uú]mero\b/i, /\bdescadastr/i, /\bsair da lista\b/i,
];


/**
 * O lead abriu o assunto cobrança automática / banco / autorização? Só nesse
 * caso o agente recebe a explicação completa do PIX Automático.
 */
const RE_PIX_TOPIC =
  /(pix autom|autoriza|autoriz[aá]|d[eé]bito|debitar|recorren|mandato|banco|app do banco|assinatura recorrente|cobran[cç]a autom|desconta|8[ºo]?\s*dia|oitavo dia|revoga|cart[aã]o|renova)/i;

/** O lead está pedindo o link / dizendo que vai pagar agora? */
const RE_ASK_LINK =
  /(manda(r)? o link|me manda o link|qual o link|link do checkout|onde (eu )?pago|quero (pagar|assinar|continuar|fechar)|vou pagar|como (eu )?pago|manda o c[oó]digo|reenvia)/i;

function pixTopicActive(text: string, historyTxt: string): boolean {
  if (RE_PIX_TOPIC.test(text || "")) return true;
  // Só o rabo do histórico: assunto de 5 mensagens atrás não deve reabrir aula de PIX.
  const tail = (historyTxt || "").split("\n").slice(-2).join("\n");
  return RE_PIX_TOPIC.test(tail);
}

/** Bloco de valores concretos do plano escolhido (só o mensal tem 1ª semana). */
function renderPlanValues(plan?: string | null, billing?: string | null, pixContext = false): string {
  const key = normalizePlanKey(plan);
  if (!key) {
    return `- Plano não identificado no checkout: NÃO cite valor específico. Se o lead perguntar preço, pergunte qual plano ele quer ou use a faixa da base.`;
  }
  const v = PLAN_VALUES[key];
  const isMonthly = !billing || /month|mensal/i.test(billing);
  if (!isMonthly) {
    return `- Plano: ${v.label} (ciclo ${billing}). Ciclo longo NÃO tem 1ª semana promocional: é pagamento à vista do ciclo. Valor mensal cheio de referência: R$ ${v.monthly}. Use os valores por mês do ciclo que estão na base.`;
  }
  if (!pixContext) {
    // Versão enxuta: o lead não falou de banco/autorização. Nada de 8º dia aqui.
    return [
      `- Plano: ${v.label} mensal.`,
      `- Sai HOJE (1ª semana): R$ ${v.trial}. Mensalidade depois: R$ ${v.monthly}.`,
      `- Use SOMENTE esses números. Nunca cite valor de outro plano.`,
      `- NÃO explique autorização bancária, débito automático nem "8º dia": ele não perguntou isso.`,
    ].join("\n");
  }
  const firstCharge = new Date(Date.now() + 7 * 86400000).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return [
    `- Plano: ${v.label} mensal.`,
    `- Sai HOJE (1ª semana): R$ ${v.trial}.`,
    `- Valor que o app do banco mostra como autorização (mensalidade): R$ ${v.monthly} — NÃO é cobrado hoje.`,
    `- 1º débito do valor cheio: 8º dia (por volta de ${firstCharge}). Cancelando antes, não paga nada.`,
    `- Use SOMENTE esses números. Nunca cite valor de outro plano.`,
  ].join("\n");
}


function isShortGreeting(text: string): boolean {
  const cleaned = text.trim().toLowerCase().replace(/[!.?,;]+/g, "");
  if (cleaned.length === 0) return true;
  const words = cleaned.split(/\s+/);
  if (words.length > 3) return false;
  const greetingTokens = new Set([
    "oi", "ola", "olá", "bom", "boa", "dia", "tarde", "noite",
    "obrigado", "obrigada", "obg", "vlw", "valeu", "blz", "ok",
    "👍", "🙏", "❤", "❤️", "👋", "🌿",
  ]);
  return words.every(w => greetingTokens.has(w) || /^[\p{Emoji}]+$/u.test(w));
}

function isQuietHourBRT(start: number, end: number): boolean {
  // BRT = UTC-3
  const nowUtc = new Date();
  const brtHour = (nowUtc.getUTCHours() - 3 + 24) % 24;
  if (start === end) return false;
  if (start < end) return brtHour >= start && brtHour < end;
  // janela cruza meia-noite (ex: 22 → 8)
  return brtHour >= start || brtHour < end;
}

interface KbItem { id: string; category: string; question: string; answer: string; keywords: string[]; }

async function loadKb(supabase: any, lastInbound: string, pixContext = false): Promise<KbItem[]> {
  // Always-include base
  const { data: base } = await supabase
    .from("recovery_knowledge_base")
    .select("id, category, question, answer, keywords, priority")
    .eq("is_active", true)
    .in("category", ALWAYS_CATEGORIES)
    .order("priority", { ascending: false });

  const lowered = (lastInbound || "").toLowerCase();
  const tokens = lowered.split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3);

  // Keyword match (fora dos always)
  const { data: matches } = await supabase
    .from("recovery_knowledge_base")
    .select("id, category, question, answer, keywords, priority")
    .eq("is_active", true)
    .not("category", "in", `(${ALWAYS_CATEGORIES.map(c => `"${c}"`).join(",")})`);

  const scored = (matches || []).map((m: any) => {
    let score = 0;
    for (const kw of (m.keywords || [])) {
      if (lowered.includes(String(kw).toLowerCase())) score += 3;
    }
    for (const t of tokens) {
      if ((m.question || "").toLowerCase().includes(t)) score += 1;
    }
    // Dúvida técnica (PIX Automático) só ganha peso quando o assunto está na mesa.
    if (m.category === "duvida_tecnica") {
      if (!pixContext && score < 3) score = 0;
      else if (pixContext && score > 0) score += 2;
    }
    return { item: m, score };
  }).filter((x: any) => x.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, pixContext ? 6 : 5)

    .map((x: any) => x.item);

  const merged: KbItem[] = [...(base || []), ...scored].slice(0, MAX_KB_ITEMS);
  // dedupe por id
  const seen = new Set<string>();
  return merged.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
}

function renderKb(items: KbItem[]): string {
  return items.map(it => `- (${it.category}) ${it.question}\n  → ${it.answer}`).join("\n");
}

/**
 * Vitrine de valor em 3 níveis de desejo (regra: memória e conveniência são
 * pressupostos, não argumentos de venda — o lead já espera isso).
 *  - A "CENAS QUE GERAM DESEJO": o que a pessoa QUER pra si. É daqui que o
 *    agente escolhe, sempre.
 *  - B "PROVAS DE APOIO": conforto/prova — só como reforço de uma cena A.
 *  - C "PRESSUPOSTOS": só se o lead perguntar diretamente.
 * Itens já citados no histórico são marcados como "JÁ CITADO" (anti-repetição).
 */
type Tier = "A" | "B" | "C";
const VALUE_SHOWCASE: { id: string; tier: Tier; text: string; probe: RegExp }[] = [
  // ---- NÍVEL A — cenas que geram desejo ----
  {
    id: "encontro",
    tier: "A",
    text: "Encontro guiado de 45 minutos, marcado pra hoje à noite se você quiser: você escreve a hora no WhatsApp, e naquele horário ela te chama. Quarenta e cinco minutos só seus, sem espera de semanas, sem sala de espera, sem ter que contar sua vida do começo. Ela puxa o fio de onde parou, vai fundo no que está travando de verdade — e você sai dali com uma leitura do que está acontecendo e um caminho concreto pra semana, escrito, guardado no seu espaço. Não é o bate-papo do dia a dia.",
    probe: /45\s*min|sess(ão|ao|ões|oes)|encontro guiado/i,
  },
  {
    id: "meditacao",
    tier: "A",
    text: "Meditação guiada na hora exata em que aperta: 23h, você deitada sem conseguir desligar a cabeça, escreve pra ela que não consegue dormir — e em segundos chega um áudio, a voz dela te conduzindo, respiração por respiração, até o corpo soltar. Não é link pra procurar depois, não é abrir outro app: é um áudio feito pra aquele momento, pra sono, ansiedade, medo, culpa, cansaço. Você escuta e dorme.",
    probe: /medita/i,
  },
  {
    id: "jornada",
    tier: "A",
    text: "Uma trilha sua, com episódio novo chegando toda semana: sobre o que VOCÊ está vivendo agora — ansiedade, sono, propósito, autoestima, relacionamento — em pedaços curtos que caem no WhatsApp e conversam com o que você contou. Ela te conduz no seu ritmo, e uma semana depois você olha pra trás e percebe que entendeu algo que antes só doía. Na semana seguinte tem mais.",
    probe: /jornada|trilha|epis[oó]dio/i,
  },

  // ---- NÍVEL B — provas de apoio (reforço, nunca argumento principal) ----
  {
    id: "audio",
    tier: "B",
    text: "Você pode responder por áudio quando não dá pra digitar — no carro, na fila, deitado — e ela escuta, às vezes responde por áudio também.",
    probe: /\báudio\b|\baudio\b/i,
  },
  {
    id: "madrugada",
    tier: "B",
    text: "Sem horário comercial e sem fila: responde em minutos, de madrugada ou fim de semana.",
    probe: /madrugada|3h|24\/7|24 horas|qualquer hora/i,
  },
  {
    id: "portal",
    tier: "B",
    text: "Seu espaço no site (olaaura.com.br/meu-espaco) guarda histórico dos encontros, insights, meditações recebidas e jornadas em curso. Login sem senha.",
    probe: /meu-espaco|meu espaço|portal/i,
  },
  // ---- NÍVEL C — pressupostos (só se o lead perguntar) ----
  {
    id: "memoria",
    tier: "C",
    text: "Ela lembra do que você contou — não te faz recomeçar do zero nem repetir sua vida. (Isso o lead já espera; não use como argumento de venda, só se ele perguntar.)",
    probe: /lembra|memór|memor/i,
  },
];

function renderValueShowcase(historyTxt: string): string {
  const block = (tier: Tier, title: string, note: string) => {
    const items = VALUE_SHOWCASE.filter(v => v.tier === tier).map(v => {
      const used = v.probe.test(historyTxt);
      return `- ${v.text}${used ? "  [JÁ CITADO — não repita]" : ""}`;
    });
    return `${title} (${note}):\n${items.join("\n")}`;
  };
  return [
    block("A", "NÍVEL A — CENAS QUE GERAM DESEJO", "escolha UMA destas, sempre em cena e no presente"),
    "",
    block("B", "NÍVEL B — PROVAS DE APOIO", "só como reforço de uma cena do nível A, nunca sozinho"),
    "",
    block("C", "NÍVEL C — PRESSUPOSTOS (NÃO VENDA)", "o lead já espera isso; só mencione se ELE perguntar"),
  ].join("\n");
}


/**
 * Retorna o perfil do telefone quando ele JÁ é cliente (ativo/trial/canceling/past_due).
 * Antes isso derrubava a execução (`skip: active_user`) e o cliente ficava sem
 * resposta nenhuma — agora só muda o modo do agente para SUPORTE.
 */
async function getCustomer(supabase: any, phone: string): Promise<{ status: string; name: string | null } | null> {
  const variations = getPhoneVariations(phone);
  const { data } = await supabase
    .from("profiles")
    .select("id, status, name")
    .in("phone", variations)
    .in("status", ["active", "trial", "canceling", "past_due"])
    .limit(1)
    .maybeSingle();
  return data ? { status: data.status, name: data.name ?? null } : null;
}

async function sendTwilioFreeText(phone: string, text: string): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const sid = Deno.env.get("TWILIO_RECOVERY_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_RECOVERY_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_RECOVERY_FROM");
  if (!sid || !token || !from) return { ok: false, error: "twilio_recovery_secrets_missing" };
  const fromFormatted = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
  const toFormatted = `whatsapp:+${normalizeBrazilianPhone(phone)}`;
  const basic = btoa(`${sid}:${token}`);
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { "Authorization": `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: toFormatted, From: fromFormatted, Body: text }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, error: json?.message || `HTTP ${resp.status}` };
  return { ok: true, sid: json?.sid };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const payload = await req.json().catch(() => ({}));
    const { phone: rawPhone, inbound_text, flush_pending } = payload || {};

    // ─── Modo cron: responde o que chegou durante o horário silencioso ───
    // Sem isso, mensagem de madrugada era descartada e nunca voltava.
    if (flush_pending) {
      const { data: pendentes } = await supabase
        .from("recovery_conversations")
        .select("phone, pending_inbound")
        .not("pending_reply_at", "is", null)
        .limit(50);
      let flushed = 0;
      for (const p of pendentes || []) {
        await supabase.from("recovery_conversations")
          .update({ pending_reply_at: null, pending_inbound: null })
          .eq("phone", p.phone);
        try {
          await supabase.functions.invoke("recovery-agent", {
            body: { phone: p.phone, inbound_text: p.pending_inbound || "" },
          });
          flushed++;
        } catch (e) {
          console.error("[recovery-agent] flush falhou para", p.phone.slice(0, 6) + "***", e);
        }
      }
      console.log(`[recovery-agent] flush_pending: ${flushed}/${(pendentes || []).length}`);
      return new Response(JSON.stringify({ ok: true, flushed }), { status: 200, headers: corsHeaders });
    }

    if (!rawPhone || typeof rawPhone !== "string") {
      return new Response(JSON.stringify({ skipped: "missing_phone" }), { status: 200, headers: corsHeaders });
    }
    const phone = rawPhone.replace(/\D/g, "");
    let text = (inbound_text || "").toString();

    // 1. Config + kill switch
    const { data: cfg } = await supabase.from("recovery_agent_config").select("*").eq("id", 1).maybeSingle();
    if (!cfg || !cfg.enabled) {
      console.log(`[recovery-agent] disabled (cfg.enabled=${cfg?.enabled})`);
      return new Response(JSON.stringify({ skipped: "disabled" }), { status: 200, headers: corsHeaders });
    }

    // 2. Já é cliente? Não cala mais — muda para modo SUPORTE (sem venda, sem link).
    const customer = await getCustomer(supabase, phone);

    // 3. Quiet hours → enfileira para responder na abertura do dia (08h BRT)
    if (isQuietHourBRT(cfg.silent_hours_start, cfg.silent_hours_end)) {
      await supabase.from("recovery_conversations").update({
        pending_reply_at: new Date().toISOString(),
        pending_inbound: text.slice(0, 1000),
        updated_at: new Date().toISOString(),
      }).eq("phone", phone);
      console.log("[recovery-agent] quiet_hours → enfileirado");
      return new Response(JSON.stringify({ skipped: "quiet_hours", queued: true }), { status: 200, headers: corsHeaders });
    }

    // 4. Conversa
    const { data: conv } = await supabase
      .from("recovery_conversations")
      .select("phone, auto_reply_count, needs_human, auto_paused_reason, checkout_session_id, name, last_inbound_at")
      .eq("phone", phone).maybeSingle();

    // Pausas definitivas: só quando o próprio lead pediu para parar / falar com humano.
    const HARD_PAUSES = ["user_requested_human", "lead_declined", "escalated_email"];
    if (conv?.needs_human && HARD_PAUSES.includes(conv?.auto_paused_reason || "")) {
      console.log(`[recovery-agent] pausa definitiva (${conv?.auto_paused_reason})`);
      return new Response(JSON.stringify({ skipped: conv?.auto_paused_reason }), { status: 200, headers: corsHeaders });
    }

    // Cota de respostas: zera quando o lead reabre a conversa depois de 48h.
    let replyCount = conv?.auto_reply_count ?? 0;
    const lastIn = conv?.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : 0;
    const reopened = lastIn > 0 && Date.now() - lastIn > 48 * 3600 * 1000;
    if (reopened && replyCount > 0) {
      replyCount = 0;
      await supabase.from("recovery_conversations").update({
        auto_reply_count: 0, needs_human: false, auto_paused_reason: null,
      }).eq("phone", phone);
      console.log("[recovery-agent] cota resetada (conversa reaberta)");
    }
    if (replyCount >= cfg.max_auto_replies) {
      await supabase.from("recovery_conversations").update({
        needs_human: true, auto_paused_reason: "limit_reached", updated_at: new Date().toISOString(),
      }).eq("phone", phone);
      console.log("[recovery-agent] limit_reached");
      return new Response(JSON.stringify({ skipped: "limit_reached" }), { status: 200, headers: corsHeaders });
    }

    // 5. Mensagem só com anexo: descreve o anexo em vez de sumir.
    let mediaOnly = false;
    if (!text.trim()) {
      const { data: lastIn2 } = await supabase
        .from("recovery_messages")
        .select("media_url, body")
        .eq("phone", phone).eq("direction", "in")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (lastIn2?.media_url) {
        mediaOnly = true;
        text = "[o lead enviou um anexo sem texto — normalmente é comprovante de pagamento ou print da tela do banco]";
      } else {
        return new Response(JSON.stringify({ skipped: "empty_inbound" }), { status: 200, headers: corsHeaders });
      }
    }

    // 5b. Mensagem curta ("ok", "obrigada") não é mais ignorada: vira resposta curta.
    const shortAck = !mediaOnly && isShortGreeting(text);

    // 5c. "Ficou uma dúvida" sem dizer qual: o agente NÃO adivinha, ele pergunta.
    const blankDoubt = !mediaOnly && isBlankDoubt(text);

    // 6. Stop words
    if (STOP_WORDS.some(re => re.test(text))) {
      await supabase.from("recovery_conversations").update({
        needs_human: true, auto_paused_reason: "user_requested_human", updated_at: new Date().toISOString(),
      }).eq("phone", phone);
      console.log("[recovery-agent] stop_word");
      return new Response(JSON.stringify({ skipped: "stop_word" }), { status: 200, headers: corsHeaders });
    }

    // 7. Contexto
    const { data: history } = await supabase
      .from("recovery_messages")
      .select("direction, body, created_at, sent_by_admin, metadata")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    const historyAsc = (history || []).reverse();

    let checkout: any = null;
    if (conv?.checkout_session_id) {
      const { data: ck } = await supabase
        .from("checkout_sessions")
        .select("plan, billing, name, email, created_at, pix_copied_at")
        .eq("id", conv.checkout_session_id).maybeSingle();
      checkout = ck;
    }
    if (!checkout) {
      // Clique de botão pode chegar antes de o checkout estar vinculado à conversa.
      const { data: ck2 } = await supabase
        .from("checkout_sessions")
        .select("plan, billing, name, email, created_at, pix_copied_at")
        .in("phone", getPhoneVariations(phone))
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      checkout = ck2 || null;
    }

    // 6b. Clique de quick reply do trilho "copiou o código PIX": resolve na hora.
    const pixIntent = classifyPixButton(text);
    if (pixIntent === "new_code" || pixIntent === "already_paid") {
      const res = await handlePixButton(supabase, pixIntent, phone, checkout);
      if (res.handled && res.body) {
        const sendBtn = await sendTwilioFreeText(phone, res.body);
        const nowBtn = new Date().toISOString();
        await supabase.from("recovery_messages").insert({
          phone, direction: "out", body: res.body, message_sid: sendBtn.sid || null, sent_by_admin: false,
          metadata: { bot: true, ...(res.metadata || {}) },
        });
        await supabase.from("recovery_conversations").upsert({
          phone,
          last_outbound_at: nowBtn,
          last_bot_reply_at: nowBtn,
          last_message_preview: res.body.slice(0, 200),
          auto_reply_count: replyCount + 1,
          pending_reply_at: null,
          pending_inbound: null,
          updated_at: nowBtn,
        }, { onConflict: "phone" });
        console.log(`[recovery-agent] pix_button=${pixIntent} resolution=${res.metadata?.resolution} sent=${sendBtn.ok}`);
        return new Response(JSON.stringify({ ok: sendBtn.ok, pix_button: pixIntent, resolution: res.metadata?.resolution }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 6c. Encontro avulso de R$ 6,90: elegibilidade SEMPRE do backend.
    // O LLM nunca decide se pode oferecer, e nunca gera código.
    let tasterEligible = false;
    try {
      const { data: tEl } = await supabase.functions.invoke("criar-pix-taster", {
        body: { phone, email: checkout?.email ?? null, dryRun: true },
      });
      tasterEligible = tEl?.eligible === true;
    } catch (e) {
      console.warn("[recovery-agent] dryRun taster falhou:", (e as Error)?.message);
    }

    // Bypass de TESTE: telefones em system_config.taster_test_phones passam
    // pelo trilho mesmo sendo cliente ativo, senão é impossível validar ponta
    // a ponta com a própria conta. Não afeta nenhum outro número.
    const tasterTestBypass = await isTasterTestPhone(supabase, phone);

    // Aceite: clique do template (Porta B) ou "quero/bora" depois de a oferta ter saído.
    const tasterIntent = classifyTasterIntent(text);
    if ((!customer || tasterTestBypass) && tasterEligible && tasterIntent) {
      const okToGenerate = tasterIntent === "button" || await tasterOfferAlreadySent(supabase, phone);
      if (okToGenerate) {
        const res = await handleTasterAccept(
          supabase, phone, checkout,
          tasterIntent === "button" ? "porta_b" : "porta_a",
        );
        if (res.handled && res.body) {
          const sendT = await sendTwilioFreeText(phone, res.body);
          const nowT = new Date().toISOString();
          await supabase.from("recovery_messages").insert({
            phone, direction: "out", body: res.body, message_sid: sendT.sid || null, sent_by_admin: false,
            metadata: { bot: true, ...(res.metadata || {}) },
          });
          await supabase.from("recovery_conversations").upsert({
            phone,
            last_outbound_at: nowT,
            last_bot_reply_at: nowT,
            last_message_preview: res.body.slice(0, 200),
            auto_reply_count: replyCount + 1,
            pending_reply_at: null,
            pending_inbound: null,
            updated_at: nowT,
          }, { onConflict: "phone" });
          console.log(`[recovery-agent] taster=${tasterIntent} resolution=${res.metadata?.resolution} sent=${sendT.ok}`);
          return new Response(JSON.stringify({ ok: sendT.ok, taster: tasterIntent, resolution: res.metadata?.resolution }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const kbItems = await loadKb(supabase, text);

    // 8. Monta prompt
    const planTxt = checkout?.plan ? `${checkout.plan}${checkout.billing ? ` (${checkout.billing})` : ""}` : "não identificado";
    const nameTxt = conv?.name || checkout?.name || customer?.name || "alguém";
    const historyTxt = historyAsc.map(m => {
      const who = m.direction === "in" ? "Lead" : (m.sent_by_admin ? "Admin" : "Aura");
      return `${who}: ${(m.body || "[mídia]").slice(0, 300)}`;
    }).join("\n");

    // Modo SUPORTE: já é cliente. Resolve a dúvida, não vende, não manda checkout.
    const supportBlock = customer ? `
MODO SUPORTE (IMPORTANTE): esta pessoa JÁ É CLIENTE (status: ${customer.status}). NÃO venda, NÃO ofereça plano, NÃO mande link de checkout, NÃO mostre vitrine de valor.
Responda a dúvida dela de forma direta e resolutiva usando a base de conhecimento (cobrança, acesso, como usar, cancelamento).
- Acesso e histórico: olaaura.com.br/meu-espaco (login sem senha, pelo email/telefone do cadastro).
- A conversa com a Aura acontece no WhatsApp oficial dela, não neste número.
- Cancelamento: pelo site, em 1 minuto, sem precisar falar com ninguém.
- Se for caso de cobrança específica que você não tem como conferir, oriente o email ${SUPPORT_EMAIL} e emita [ESCALAR_HUMANO].
` : "";

    const modeInstructions = customer
      ? `Responda curto (2-4 frases), humano, resolvendo o que a pessoa perguntou. Sem venda e sem cena de valor.
NUNCA responda uma dúvida que ela não formulou: se a mensagem não diz QUAL é a dúvida, apenas pergunte, em uma frase.
Termine com UMA das tags em linha separada: [ESCALAR_HUMANO] ou nenhuma.`
      : `Antes de escrever: identifique a trava real de ${nameTxt} e defina O QUE essa mensagem precisa fazer o lead entender ou sentir. Escreva com suas próprias palavras, ancorado no que ele acabou de dizer — sem abertura padrão, sem bordão, sem repetir formulação já usada no histórico.
Sua mensagem tem DUAS camadas: (1) destrava o que ele perguntou, (2) mostra UMA cena do NÍVEL A da vitrine — em cena e no presente, como se estivesse acontecendo com ele agora, não como lista de recursos. Nunca abra a mensagem por um item do nível C. Se as cenas A que conversam com a mensagem já estão marcadas como JÁ CITADO, aprofunde uma delas com um detalhe novo em vez de descer pra B ou C. Itens do nível B só entram como reforço de uma cena A (ex: "e dá pra responder por áudio mesmo"); nunca como argumento principal.
NUNCA SE DIMINUA: não abra a mensagem por negação ("não é...", "não faz...", "não substitui..."), não se posicione como versão menor de terapia, de psicólogo ou de app nenhum, e não use palavra que esvazia ("ferramenta", "assistente", "apoio pra organizar pensamentos", "praticar autoconhecimento", "complementa", "não substitui", "não faz diagnóstico"). Ressalva clínica só se ELE pedir tratamento/diagnóstico/remédio ou sinalizar risco — e nunca como abertura ou fecho.
Se ele perguntar O QUE a Aura é ou comparar com algo ("é terapia?", "é um robô?", "é tipo app de meditação?"), responda pelo que ela É, em cena, e deixe a diferença aparecer sozinha (disponibilidade e continuidade como vantagem, nunca como limitação). Definição funcional sem cena do NÍVEL A na mesma mensagem é ERRO.
Feche com convite, não com ressalva: uma cena ou UMA pergunta concreta ("quer marcar o primeiro encontro pra hoje à noite?", "quer que eu gere o código agora?"). Mensagem NÃO termina em link: link é resposta a pedido, não assinatura.
NÃO EXPLIQUE PIX AUTOMÁTICO, AUTORIZAÇÃO NO BANCO NEM "8º DIA" SE ELE NÃO PERGUNTOU — nem de bônus no fim. Se ele falou de dinheiro apertado, de preço ou de qualquer outro assunto, responda AQUELE assunto: reconheça em poucas palavras, diga em UMA frase o valor que sai hoje e siga pelo que ele ganha. Aula de cobrança automática sem pergunta é o que te faz parecer robô.
LINK É EXCEÇÃO: só emita [ENVIAR_LINK] se ele pediu o link, disse que vai pagar/quer continuar, ou se a dúvida que travava foi resolvida agora E o link ainda não foi enviado nesta conversa. Nos outros casos, sem tag.

NUNCA ADIVINHE A DÚVIDA: se ele não disse QUAL é a dúvida (ex: "ficou uma dúvida"), não escolha um assunto por ele nem despeje explicação — pergunte qual é, em uma frase, e pare. Encher de informação sem ele ter perguntado é o que faz você parecer robô.
Curto e humano: até 5 frases quando for explicação de PIX Automático ou de valor; menos nos outros casos.
Termine com UMA das tags em linha separada: [ENVIAR_LINK], [ESCALAR_HUMANO], [STOP], [OFERECER_TASTER] ou nenhuma.`;


    const shortAckInstruction = shortAck ? `
ATENÇÃO — A MENSAGEM É CURTA ("ok", "obrigada", "beleza"): responda em NO MÁXIMO 2 frases, sem reabrir argumento, sem repetir explicação e SEM mandar link. Feche com leveza. NÃO emita nenhuma tag.
` : "";

    const mediaInstruction = mediaOnly ? `
ATENÇÃO — VEIO SÓ UM ANEXO, SEM TEXTO: trate como "paguei / mandei o comprovante, e agora?". Confirme que o pagamento cai automaticamente no acesso, diga que a Aura chama no WhatsApp em poucos minutos depois da confirmação, e ofereça o ${SUPPORT_EMAIL} caso não chegue. Não peça pra reenviar o anexo. Não venda.
` : "";

    // Trilho "copiou o código PIX": a pessoa já abriu o app do banco. Não é lead
    // frio — é alguém a um passo de entrar, que travou ou ficou em dúvida.
    const copiedPixInstruction = (!blankDoubt && (checkout?.pix_copied_at || pixIntent === "conversational")) ? `
CONTEXTO DECISIVO: esta pessoa COPIOU o código PIX e não concluiu — ela já decidiu, travou no último passo (dúvida de última hora, erro do banco ou insegurança). NÃO recomece a venda do zero e não explique tudo de novo. Trate a dúvida específica dela de frente, em duas ou três frases, e feche com o próximo passo concreto ("te mando o código novo agora?" / "quer marcar o primeiro encontro pra hoje à noite?"). Se ela sinalizar erro ou código expirado, diga que você gera um novo na hora — você realmente gera.
` : "";


    // Carta na manga: encontro guiado avulso de R$ 6,90, PIX comum, sem autorizar
    // débito automático. Só existe pra quem travou exatamente nessa objeção —
    // e só quando o backend já disse que a pessoa é elegível.
    const tasterInstruction = (!blankDoubt && (!customer || tasterTestBypass) && tasterEligible) ? `
CARTA NA MANGA (use SÓ se a trava for autorização de cobrança automática, medo de recorrência, "não quero deixar autorizado", "quero testar antes" ou preço): existe um encontro guiado de 45 minutos AVULSO por R$ 6,90, num PIX comum de copia e cola, SEM autorizar nada automático e SEM virar assinatura. É um encontro só, com 48h pra fazer, e depois a pessoa decide com calma se escolhe um plano.
Regras: ofereça no máximo UMA vez; descreva em cena ("um encontro de 45 minutos, marcado pra hoje à noite se você quiser"); NUNCA gere ou invente código PIX — quem gera é o sistema; NÃO ofereça se a trava for outra (dúvida técnica, erro do banco, comparação com terapia). Se for oferecer, termine com [OFERECER_TASTER] em vez de [ENVIAR_LINK] e feche perguntando se quer que você mande o código de R$ 6,90.
` : "";

    const blankDoubtInstruction = blankDoubt ? `
ATENÇÃO — ELE DISSE QUE TEM UMA DÚVIDA MAS NÃO DISSE QUAL: sua ÚNICA tarefa nesta mensagem é perguntar qual é a dúvida. UMA frase curta, no tom de quem está ali do lado ("claro, ${nameTxt} — qual ficou?" / "manda a dúvida que eu te respondo agora"). PROIBIDO: adivinhar o assunto, explicar PIX Automático, citar valores, mostrar cena de valor, mandar link, oferecer encontro avulso, listar qualquer coisa. NÃO emita nenhuma tag.
` : "";

    const contextBlock = `${supportBlock}
BASE DE CONHECIMENTO:
${renderKb(kbItems)}

CONTEXTO DO CHECKOUT:
- Nome: ${nameTxt}
- Plano iniciado: ${planTxt}

VALORES DO PLANO DESTE LEAD:
${renderPlanValues(checkout?.plan, checkout?.billing, pixContext)}
${(customer || blankDoubt) ? "" : `
O QUE ${nameTxt.toUpperCase()} GANHA AO ENTRAR:
${renderValueShowcase(historyTxt)}

- Link pra retomar (envie SOMENTE se emitir [ENVIAR_LINK]): ${CHECKOUT_URL}`}
- Email de suporte: ${SUPPORT_EMAIL}

HISTÓRICO DA CONVERSA:
${historyTxt}

MENSAGEM ATUAL DO LEAD:
"${text}"
${blankDoubtInstruction}${shortAckInstruction}${mediaInstruction}${copiedPixInstruction}${tasterInstruction}
${modeInstructions}`;


    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[recovery-agent] LOVABLE_API_KEY missing");
      return new Response(JSON.stringify({ skipped: "no_api_key" }), { status: 200, headers: corsHeaders });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model || "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: cfg.system_prompt },
          { role: "user", content: contextBlock },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errTxt = await aiResp.text().catch(() => "");
      console.error("[recovery-agent] AI error", aiResp.status, errTxt.slice(0, 200));
      return new Response(JSON.stringify({ error: "ai_failed", status: aiResp.status }), { status: 200, headers: corsHeaders });
    }

    const aiJson = await aiResp.json();
    let raw = (aiJson?.choices?.[0]?.message?.content || "").trim();
    if (!raw) {
      console.warn("[recovery-agent] empty response");
      return new Response(JSON.stringify({ skipped: "empty_response" }), { status: 200, headers: corsHeaders });
    }

    // 9. Parse tags (cliente em modo suporte nunca recebe link de checkout)
    let sendLink = !customer && /\[ENVIAR_LINK\]/i.test(raw);
    const escalate = /\[ESCALAR_HUMANO\]/i.test(raw);
    const stop = /\[STOP\]/i.test(raw);
    const offerTaster = (!customer || tasterTestBypass) && tasterEligible && /\[OFERECER_TASTER\]/i.test(raw);
    let body = raw.replace(/\[(ENVIAR_LINK|ESCALAR_HUMANO|STOP|OFERECER_TASTER)\]/gi, "").trim();
    if (customer) body = body.replace(new RegExp(CHECKOUT_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "").trim();

    // Trava anti-robô: link não é assinatura de mensagem. Se o link já saiu nas
    // últimas 24h e o lead NÃO pediu, não manda de novo (nem o modelo escolhe).
    const askedLink = RE_ASK_LINK.test(text);
    if (sendLink && !askedLink) {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data: recentOut } = await supabase
        .from("recovery_messages")
        .select("body")
        .in("phone", phoneMatchList(phone))
        .eq("direction", "out")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(15);
      const alreadySent = (recentOut || []).some((m: any) => typeof m?.body === "string" && m.body.includes("/v2/checkout"));
      if (alreadySent) {
        sendLink = false;
        console.log("[recovery-agent] link suprimido: já enviado nas últimas 24h e lead não pediu");
      }
    }

    // O modelo pode ter colado o link no texto sem tag (ou com a tag suprimida).
    if (!sendLink && !customer && body.includes(CHECKOUT_URL)) {
      body = body.split(CHECKOUT_URL).join("").replace(/\n{3,}/g, "\n\n").trim();
    }

    if (sendLink && offerTaster) {
      // Oferta de encontro avulso e link de plano na mesma mensagem = ruído. O
      // encontro é justamente pra quem NÃO quer autorizar cobrança agora.
      console.log("[recovery-agent] taster ofertado: link de checkout suprimido");
    }
    if (sendLink && !offerTaster && !body.includes(CHECKOUT_URL)) {
      body = `${body}\n\n${CHECKOUT_URL}`;
    }

    if (escalate && !body.toLowerCase().includes(SUPPORT_EMAIL)) {
      body = `${body}\n\nSe quiser, manda um email pra ${SUPPORT_EMAIL} que o time responde por aí.`;
    }

    if (!body) {
      console.warn("[recovery-agent] body empty after tag strip");
      return new Response(JSON.stringify({ skipped: "empty_after_strip" }), { status: 200, headers: corsHeaders });
    }

    // 10. Envia
    const send = await sendTwilioFreeText(phone, body);
    if (!send.ok) {
      console.error("[recovery-agent] Twilio send failed", send.error);
      return new Response(JSON.stringify({ error: "twilio_failed", details: send.error }), { status: 200, headers: corsHeaders });
    }

    const nowIso = new Date().toISOString();
    const kbIds = kbItems.map(k => k.id);

    await supabase.from("recovery_messages").insert({
      phone, direction: "out", body, message_sid: send.sid || null, sent_by_admin: false,
      metadata: { bot: true, kb_used: kbIds, tags: { sendLink, escalate, stop, offerTaster }, ...(offerTaster ? { taster_offered: true } : {}) },
    });

    const newCount = replyCount + 1;
    const shouldPause = stop || escalate || newCount >= cfg.max_auto_replies;
    const pauseReason = stop ? "lead_declined" : (escalate ? "escalated_email" : (newCount >= cfg.max_auto_replies ? "limit_reached" : null));

    await supabase.from("recovery_conversations").upsert({
      phone,
      last_outbound_at: nowIso,
      last_bot_reply_at: nowIso,
      last_message_preview: body.slice(0, 200),
      auto_reply_count: newCount,
      needs_human: shouldPause,
      auto_paused_reason: pauseReason,
      pending_reply_at: null,
      pending_inbound: null,
      updated_at: nowIso,
    }, { onConflict: "phone" });

    if (kbIds.length > 0) {
      // Best-effort: incrementa usage_count via RPC dedicado (nunca pode derrubar o envio)
      try {
        const { error: rpcErr } = await supabase.rpc("increment_recovery_kb_usage", { _ids: kbIds });
        if (rpcErr) console.warn("[recovery-agent] increment_recovery_kb_usage falhou:", rpcErr.message);
      } catch (e) {
        console.warn("[recovery-agent] increment_recovery_kb_usage erro:", (e as any)?.message);
      }
    }

    console.log(`[recovery-agent] sent phone=${phone.slice(0,6)}*** count=${newCount} tags=${JSON.stringify({sendLink,escalate,stop})}`);
    return new Response(JSON.stringify({ ok: true, sid: send.sid, auto_reply_count: newCount, paused: shouldPause }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[recovery-agent] fatal", err);
    return new Response(JSON.stringify({ error: "internal" }), { status: 500, headers: corsHeaders });
  }
});