// ============================================================================
// Micro-classificador semântico (Camada 2) do recovery-agent.
// Só roda quando os regex (Camada 1) não reconheceram nada. A IA apenas
// ROTULA a intenção; quem gera cobrança é sempre o código determinístico.
// Política conservadora: abaixo do limiar de confiança → general_doubt.
// ============================================================================

export type RecoveryIntent =
  | "accept_taster"
  | "replace_pix"
  | "already_paid"
  | "general_doubt";

export const INTENT_MIN_CONFIDENCE = 0.8;

const SYSTEM_PROMPT = `Você classifica a intenção da ÚLTIMA mensagem de um lead no WhatsApp, considerando a última mensagem enviada pela Aura.
Intenções possíveis:
- accept_taster: a Aura ofereceu o encontro avulso de R$ 6,90 (pagamento único) e o lead ACEITOU ou pediu o código/chave/pix para pagar ("fechado", "pod ser", "manda a chave", "como faço pra pagar?").
- replace_pix: o lead relata que o código/QR PIX deu erro, não funciona, expirou, ou pede um código novo.
- already_paid: o lead afirma que já pagou / fez o pix.
- general_doubt: qualquer outra coisa (dúvidas, recusas, conversa, ambiguidades).
REGRA: na dúvida, general_doubt. accept_taster SÓ se a última mensagem da Aura ofereceu os R$ 6,90 avulso.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "classify_intent",
    description: "Classifica a intenção transacional do lead",
    parameters: {
      type: "object",
      properties: {
        intent: { type: "string", enum: ["accept_taster", "replace_pix", "already_paid", "general_doubt"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["intent", "confidence"],
      additionalProperties: false,
    },
  },
};

/** Decide o rótulo final a partir da saída bruta do modelo (testável sem rede). */
export function resolveIntent(raw: unknown): RecoveryIntent {
  // deno-lint-ignore no-explicit-any
  const r = raw as any;
  const valid = ["accept_taster", "replace_pix", "already_paid", "general_doubt"];
  if (!r || !valid.includes(r.intent)) return "general_doubt";
  const conf = typeof r.confidence === "number" ? r.confidence : 0;
  if (conf < INTENT_MIN_CONFIDENCE) return "general_doubt";
  return r.intent as RecoveryIntent;
}

/** Mensagens muito curtas ou longas demais não valem a chamada. */
export function shouldClassify(text: string): boolean {
  const t = (text || "").trim();
  return t.length >= 2 && t.length <= 400;
}

export async function classifyRecoveryIntentWithAI(
  lastAuraMsg: string,
  userText: string,
  timeoutMs = 2500,
): Promise<RecoveryIntent> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key || !shouldClassify(userText)) return "general_doubt";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Última mensagem da Aura:\n"${(lastAuraMsg || "").slice(0, 600)}"\n\nMensagem do lead:\n"${userText.slice(0, 400)}"` },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "classify_intent" } },
      }),
    });
    if (!resp.ok) return "general_doubt";
    const json = await resp.json();
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return resolveIntent(args ? JSON.parse(args) : null);
  } catch (e) {
    console.warn("[intent-classifier] falhou:", (e as Error)?.message);
    return "general_doubt";
  } finally {
    clearTimeout(timer);
  }
}
