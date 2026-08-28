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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHECKOUT_URL = "https://olaaura.com.br/v2/checkout?utm_source=whatsapp&utm_medium=recovery_agent&utm_campaign=auto_reply";
const SUPPORT_EMAIL = "suporte@olaaura.com.br";
const ALWAYS_CATEGORIES = [
  "preco", "garantia", "como_funciona", "pagamento", "seguranca", "beneficio",
  "duvida_tecnica", "objecao",
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

/** Bloco de valores concretos do plano escolhido (só o mensal tem 1ª semana). */
function renderPlanValues(plan?: string | null, billing?: string | null): string {
  const key = normalizePlanKey(plan);
  if (!key) {
    return `- Plano não identificado no checkout: NÃO cite valor específico. Se o lead perguntar preço, pergunte qual plano ele quer ou use a faixa da base.`;
  }
  const v = PLAN_VALUES[key];
  const isMonthly = !billing || /month|mensal/i.test(billing);
  if (!isMonthly) {
    return `- Plano: ${v.label} (ciclo ${billing}). Ciclo longo NÃO tem 1ª semana promocional: é pagamento à vista do ciclo. Valor mensal cheio de referência: R$ ${v.monthly}. Use os valores por mês do ciclo que estão na base.`;
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

const STOP_WORDS = [
  /\batendente\b/i, /\bhumano\b/i, /\bpessoa de verdade\b/i,
  /\bn[aã]o quero\b/i, /\bpara de me mandar\b/i, /\bparem? de mandar\b/i,
  /\bremove(r)? meu n[uú]mero\b/i, /\bdescadastr/i, /\bsair da lista\b/i,
];

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

async function loadKb(supabase: any, lastInbound: string): Promise<KbItem[]> {
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
    return { item: m, score };
  }).filter((x: any) => x.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5)
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
        .select("plan, billing, name, email, created_at")
        .eq("id", conv.checkout_session_id).maybeSingle();
      checkout = ck;
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
Termine com UMA das tags em linha separada: [ESCALAR_HUMANO] ou nenhuma.`
      : `Antes de escrever: identifique a trava real de ${nameTxt} e defina O QUE essa mensagem precisa fazer o lead entender ou sentir. Escreva com suas próprias palavras, ancorado no que ele acabou de dizer — sem abertura padrão, sem bordão, sem repetir formulação já usada no histórico.
Sua mensagem tem DUAS camadas: (1) destrava o que ele perguntou, (2) mostra UMA cena do NÍVEL A da vitrine — em cena e no presente, como se estivesse acontecendo com ele agora, não como lista de recursos. Nunca abra a mensagem por um item do nível C. Se as cenas A que conversam com a mensagem já estão marcadas como JÁ CITADO, aprofunde uma delas com um detalhe novo em vez de descer pra B ou C. Itens do nível B só entram como reforço de uma cena A (ex: "e dá pra responder por áudio mesmo"); nunca como argumento principal.
NUNCA SE DIMINUA: não abra a mensagem por negação ("não é...", "não faz...", "não substitui..."), não se posicione como versão menor de terapia, de psicólogo ou de app nenhum, e não use palavra que esvazia ("ferramenta", "assistente", "apoio pra organizar pensamentos", "praticar autoconhecimento", "complementa", "não substitui", "não faz diagnóstico"). Ressalva clínica só se ELE pedir tratamento/diagnóstico/remédio ou sinalizar risco — e nunca como abertura ou fecho.
Se ele perguntar O QUE a Aura é ou comparar com algo ("é terapia?", "é um robô?", "é tipo app de meditação?"), responda pelo que ela É, em cena, e deixe a diferença aparecer sozinha (disponibilidade e continuidade como vantagem, nunca como limitação). Definição funcional sem cena do NÍVEL A na mesma mensagem é ERRO.
A última linha antes do link é convite, não ressalva: uma cena ou UMA pergunta concreta de fechamento ("quer marcar o primeiro encontro pra hoje à noite?").
Se a trava envolve cobrança, deixe claro o valor que sai hoje e que o valor cheio é autorização futura, usando os números do bloco acima.
Curto e humano: até 5 frases quando for explicação de PIX Automático ou de valor; menos nos outros casos.
Termine com UMA das tags em linha separada: [ENVIAR_LINK], [ESCALAR_HUMANO], [STOP] ou nenhuma.`;


    const shortAckInstruction = shortAck ? `
ATENÇÃO — A MENSAGEM É CURTA ("ok", "obrigada", "beleza"): responda em NO MÁXIMO 2 frases, sem reabrir argumento e sem repetir explicação. Feche com leveza. Se ele ainda não pagou e a conversa já explicou o que precisava, emita [ENVIAR_LINK] pra deixar o caminho na mão dele.
` : "";

    const mediaInstruction = mediaOnly ? `
ATENÇÃO — VEIO SÓ UM ANEXO, SEM TEXTO: trate como "paguei / mandei o comprovante, e agora?". Confirme que o pagamento cai automaticamente no acesso, diga que a Aura chama no WhatsApp em poucos minutos depois da confirmação, e ofereça o ${SUPPORT_EMAIL} caso não chegue. Não peça pra reenviar o anexo. Não venda.
` : "";

    const contextBlock = `${supportBlock}
BASE DE CONHECIMENTO:
${renderKb(kbItems)}

CONTEXTO DO CHECKOUT:
- Nome: ${nameTxt}
- Plano iniciado: ${planTxt}

VALORES DO PLANO DESTE LEAD:
${renderPlanValues(checkout?.plan, checkout?.billing)}
${customer ? "" : `
O QUE ${nameTxt.toUpperCase()} GANHA AO ENTRAR:
${renderValueShowcase(historyTxt)}

- Link pra retomar (envie SOMENTE se emitir [ENVIAR_LINK]): ${CHECKOUT_URL}`}
- Email de suporte: ${SUPPORT_EMAIL}

HISTÓRICO DA CONVERSA:
${historyTxt}

MENSAGEM ATUAL DO LEAD:
"${text}"
${shortAckInstruction}${mediaInstruction}
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
    const sendLink = !customer && /\[ENVIAR_LINK\]/i.test(raw);
    const escalate = /\[ESCALAR_HUMANO\]/i.test(raw);
    const stop = /\[STOP\]/i.test(raw);
    let body = raw.replace(/\[(ENVIAR_LINK|ESCALAR_HUMANO|STOP)\]/gi, "").trim();
    if (customer) body = body.replace(new RegExp(CHECKOUT_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "").trim();

    if (sendLink && !body.includes(CHECKOUT_URL)) {
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
      metadata: { bot: true, kb_used: kbIds, tags: { sendLink, escalate, stop } },
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