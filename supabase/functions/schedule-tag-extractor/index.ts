// ============================================================================
// schedule-tag-extractor — micro-agente de re-confirmação da 1ª sessão D0
// ----------------------------------------------------------------------------
// Responsabilidade ÚNICA: detectar quando a Aura confirmou verbalmente o
// agendamento da 1ª sessão (D0) sem emitir [AGENDAR_SESSAO:...] e enviar uma
// mensagem proativa de re-confirmação para o usuário. NUNCA escreve em
// `sessions` — a criação continua acontecendo pelo regex literal no
// aura-agent quando o usuário responde "sim" à re-confirmação.
//
// - Modelo: google/gemini-2.5-flash-lite (tool calling, JSON Schema)
// - Política: ultra-conservador — qualquer ambiguidade → confirmed=false
// - Lock: aura-agent setou profiles.extractor_pending=true antes do invoke;
//   este worker SEMPRE limpa a flag no finally (sucesso, falha ou abort)
// - Idempotente: pode rodar várias vezes; só envia mensagem se confirmed=true
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendProactive } from "../_shared/whatsapp-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SAFETY_NET_SYSTEM_PROMPT = `Você é um detector ultra-conservador de aceite de agendamento da 1ª sessão.

Recebe a ÚLTIMA mensagem do usuário e a ÚLTIMA resposta da Aura. Decide se houve um agendamento confirmado de fato.

REGRA DE OURO: na dúvida, confirmed=false. É MUITO pior re-confirmar uma sessão que não existe do que perder uma re-confirmação.

✅ confirmed=true APENAS quando TODAS as 3 condições abaixo são verdadeiras:

1. ACEITE NO TURNO IMEDIATAMENTE ANTERIOR — a ÚLTIMA mensagem do usuário (não uma anterior) precisa ter aceite explícito: "sim", "bora", "vamos", "fechado", "combinado", "topo", "agora", "pode ser", "pode marcar", "ok".

2. EXECUÇÃO ATIVA NA RESPOSTA ATUAL — a ÚLTIMA resposta da Aura (não uma anterior) precisa conter pelo menos UMA frase de execução ativa, no presente/futuro imediato:
   - "vou marcar", "vou abrir agora", "vou começar"
   - "começar nossa primeira sessão", "começar agora"
   - "nossos 45 minutos", "nossa sessão de 45 min"
   - "marcado", "fechado", "combinado" (quando dito como afirmação, não pergunta)

3. FRASES AMBÍGUAS SÓ CONTAM COM HORÁRIO CONCRETO — expressões como "deixei salvo", "travar no calendário", "tá no calendário", "nos vemos" só justificam confirmed=true se a MESMA resposta da Aura mencionar um horário/data concreto (ex: "20h", "amanhã 10h", "daqui 15 min", "agora"). Sem horário concreto, essas frases podem se referir a sessões já existentes ou a planos futuros — confirmed=false.

❌ confirmed=false quando:
- A Aura só perguntou ("quer marcar?", "que horário fica melhor?", "podemos começar?")
- O usuário respondeu vago ("talvez", "depois", "não sei", "deixa eu ver")
- A Aura está apenas explicando como funciona o produto
- O aceite do usuário foi em turno antigo (não imediatamente antes)
- A frase "executiva" da Aura está em mensagem antiga, não na atual
- Há QUALQUER ambiguidade

Se confirmed=true, extraia o horário sugerido (datetime_hint) — formato livre como "agora", "hoje à noite", "amanhã 20h". Se não houver horário claro, deixe null.`;

const DETECTOR_TOOL = {
  type: "function" as const,
  function: {
    name: "evaluate_schedule_intent",
    description: "Avalia se houve agendamento confirmado da 1ª sessão D0",
    parameters: {
      type: "object",
      properties: {
        confirmed: { type: "boolean", description: "true APENAS se aceite + confirmação foram inequívocos" },
        datetime_hint: { type: ["string", "null"], description: "Horário em linguagem natural ou null" },
        reasoning: { type: "string", description: "1 frase curta explicando a decisão" },
      },
      required: ["confirmed", "datetime_hint", "reasoning"],
      additionalProperties: false,
    },
  },
};

interface DetectorResult {
  confirmed: boolean;
  datetime_hint: string | null;
  reasoning: string;
}

async function callDetector(
  lastUserMessage: string,
  lastAuraResponse: string,
  apiKey: string,
): Promise<DetectorResult | null> {
  const userBlock = `ÚLTIMA MENSAGEM DO USUÁRIO:\n"${lastUserMessage.slice(0, 600)}"\n\nÚLTIMA RESPOSTA DA AURA:\n"${lastAuraResponse.slice(0, 800)}"`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: SAFETY_NET_SYSTEM_PROMPT },
        { role: "user", content: userBlock },
      ],
      tools: [DETECTOR_TOOL],
      tool_choice: { type: "function", function: { name: "evaluate_schedule_intent" } },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`❌ schedule-tag-extractor: AI gateway ${response.status}: ${body.slice(0, 300)}`);
    return null;
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    console.error("❌ schedule-tag-extractor: tool_call ausente");
    return null;
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    return {
      confirmed: !!parsed.confirmed,
      datetime_hint: typeof parsed.datetime_hint === "string" ? parsed.datetime_hint : null,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch (err) {
    console.error("❌ schedule-tag-extractor: falha ao decodificar tool arguments:", err);
    return null;
  }
}

function buildReconfirmText(datetimeHint: string | null): string {
  // Mensagem ultra-curta, em PT-BR informal, fácil de responder com "sim".
  // Repete o horário sugerido quando temos algum, senão deixa aberto.
  if (datetimeHint && datetimeHint.trim().length > 0) {
    return `Só pra confirmar: nossa primeira sessão fica marcada pra ${datetimeHint.trim()}? Me responde "sim" pra eu travar aqui no calendário 💜`;
  }
  return `Só pra confirmar nossa primeira sessão: qual horário fica melhor pra você? Pode ser hoje mesmo se quiser — me diz que eu já marco aqui 💜`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let userId: string | null = null;

  try {
    const body = await req.json().catch(() => null);
    userId = typeof body?.userId === "string" ? body.userId : null;
    const lastUserMessage = typeof body?.lastUserMessage === "string" ? body.lastUserMessage : "";
    const lastAuraResponse = typeof body?.lastAuraResponse === "string" ? body.lastAuraResponse : "";

    if (!userId || !lastUserMessage || !lastAuraResponse) {
      return new Response(
        JSON.stringify({ ok: false, error: "userId, lastUserMessage, lastAuraResponse são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      console.error("❌ schedule-tag-extractor: LOVABLE_API_KEY ausente");
      return new Response(
        JSON.stringify({ ok: false, error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Reconfere o estado do perfil — se a flag D0 já caiu (ex: aura emitiu tag
    // em turno paralelo) ou o usuário já tem sessão pendente, abortamos.
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, user_id, phone, pending_first_session_invite, current_session_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile) {
      console.warn(`⚠️ [SAFETY_NET] perfil não encontrado para user_id=${userId}`);
      return new Response(JSON.stringify({ ok: false, reason: "no_profile" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profile.pending_first_session_invite) {
      console.log(`🏷️ [SAFETY_NET] flag D0 já consumida (user=${userId}) — abortando`);
      return new Response(JSON.stringify({ ok: true, reason: "flag_already_cleared" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.current_session_id) {
      console.log(`🏷️ [SAFETY_NET] usuário já em sessão ativa — abortando`);
      return new Response(JSON.stringify({ ok: true, reason: "session_active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profile.phone) {
      console.warn(`⚠️ [SAFETY_NET] perfil sem telefone — abortando`);
      return new Response(JSON.stringify({ ok: false, reason: "no_phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chama o detector
    const result = await callDetector(lastUserMessage, lastAuraResponse, lovableApiKey);
    if (!result) {
      return new Response(JSON.stringify({ ok: false, reason: "detector_failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`🏷️ [SAFETY_NET] detector → confirmed=${result.confirmed} hint=${result.datetime_hint} reason="${result.reasoning}"`);

    if (!result.confirmed) {
      return new Response(
        JSON.stringify({ ok: true, confirmed: false, reasoning: result.reasoning }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Envia re-confirmação proativa. A Aura tem 24h de janela aberta porque o
    // usuário acabou de mandar mensagem — então o sendProactive vai por texto
    // livre (sem template).
    const text = buildReconfirmText(result.datetime_hint);
    const sendResult = await sendProactive(profile.phone, text, "checkin", userId);

    if (!sendResult.success) {
      console.error(`❌ [SAFETY_NET] envio falhou: ${sendResult.error}`);
      return new Response(
        JSON.stringify({ ok: false, reason: "send_failed", error: sendResult.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`✅ [SAFETY_NET] re-confirmação enviada para user=${userId} via ${sendResult.provider}`);

    return new Response(
      JSON.stringify({ ok: true, confirmed: true, datetime_hint: result.datetime_hint, sent: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ schedule-tag-extractor: erro inesperado:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } finally {
    // SEMPRE liberar o lock — sucesso, falha ou abort
    if (userId) {
      try {
        await supabase
          .from("profiles")
          .update({ extractor_pending: false, extractor_pending_at: null })
          .eq("user_id", userId);
      } catch (lockErr) {
        console.error("⚠️ [SAFETY_NET] falha ao liberar lock:", lockErr);
      }
    }
  }
});