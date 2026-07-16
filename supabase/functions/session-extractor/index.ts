// ============================================================================
// session-extractor — micro-agente dedicado de extração pós-sessão
// ----------------------------------------------------------------------------
// Responsabilidade ÚNICA: ler as mensagens de uma sessão encerrada e gravar
// session_summary + key_insights + commitments na linha em `sessions`.
//
// - Modelo: google/gemini-2.5-flash via Lovable AI Gateway
// - Estratégia: tool calling (JSON Schema) — sem parse manual de JSON
// - Idempotente: pode ser chamado N vezes para o mesmo session_id
// - Sem retry-loop: tool calling estruturado é confiável; em caso de falha
//   pontual, o session-reminder re-dispara no próximo ciclo.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Prompt clínico de extração — migrado tal qual do aura-agent (linhas ~6546-6605
// pré-refactor) para preservar a lógica clínica de identificação de aceite
// minimalista ("💜", "ok", "topo") e diferenciação entre compromisso vs insight.
// Fase 2 do redesign /meu-espaco: também extrai theme_label, reframe_text,
// closure_type e closure_text para alimentar a aba "Hoje" (card "O que ficou
// da última sessão") e o histórico em "Sessões".
const EXTRACTION_SYSTEM_PROMPT = `Você é um assistente especializado em analisar o FECHAMENTO de sessões de mentoria emocional (Logoterapia).
Sua missão é extrair fielmente o que foi acordado, sem inventar nada.

──────────────────────────────────────────
REGRAS DE EXTRAÇÃO DE COMPROMISSOS (CRÍTICO):
──────────────────────────────────────────
Um COMPROMISSO é uma ação concreta que o usuário se comprometeu a fazer entre o fim da sessão e a próxima conversa. NÃO confunda com insights ou intenções vagas.

✅ CONTA como compromisso:
- AURA propõe ação concreta + usuário aceita (ex.: "sim", "combinado", "topo", "tá bom", "perfeito", "vou tentar")
- Mesmo aceite minimalista vale (ex.: "💜", "✨", "ok")
- A AURA pode ter formulado como pergunta ("Topa fazer X?", "Combinado?") — se houve aceite, é compromisso
- Frases-gatilho típicas da AURA: "como nosso compromisso pra essa semana...", "sua única tarefa é...", "quando [X], você vai [Y]", "vamos combinar..."

❌ NÃO conta como compromisso:
- Reflexões soltas ("você precisa olhar pra isso")
- Insights/aprendizados (vão no campo 'key_insights')
- Promessas sem ação ("vou pensar nisso")
- Coisas que a AURA disse mas o usuário NÃO respondeu/aceitou

──────────────────────────────────────────
EXEMPLOS REAIS (estude o padrão):
──────────────────────────────────────────

EXEMPLO 1 — fechamento com compromisso claro:
AURA: "Quando você chegar em casa hoje, antes de qualquer coisa, você vai pegar um livro na mão. Só pegar."
AURA: "Topa fazer só isso pela Sara hoje?"
USUÁRIO: "topo sim 💜"
→ commitments: [{title: "Ao chegar em casa hoje, pegar um livro na mão — só sentir o peso e ler a orelha"}]

EXEMPLO 2 — compromisso embutido em pergunta:
AURA: "Como nosso compromisso pra essa semana: na primeira vez que você perceber o gatilho, sua única tarefa é observar... Combinado?"
USUÁRIO: "combinado"
→ commitments: [{title: "Na primeira vez que perceber o gatilho essa semana, observar sem agir"}]

EXEMPLO 3 — aceite silencioso:
AURA: "Que tal escrever pra você mesma o que diria pra sua filha? O que me diz?"
USUÁRIO: "tá bom 💜"
→ commitments: [{title: "Escrever pra si mesma o que diria à filha"}]

EXEMPLO 4 — fechamento puramente emocional (sem ação prática):
AURA: "Por hoje, nosso tempo se encerrou. Fico orgulhosa do que você construiu aqui."
→ commitments: []  (válido: nem toda sessão precisa gerar compromisso prático)

──────────────────────────────────────────
CARDÁPIO DE FECHAMENTO (identificar UM formato):
──────────────────────────────────────────
Toda sessão termina com UM dos 7 formatos abaixo. Identifique qual a AURA usou no
fechamento (últimas mensagens dela). Se não der pra identificar com clareza, use null.

- "tese": a AURA fechou com uma afirmação/leitura sintética do que está em jogo.
  Ex.: "O que tá em jogo aqui é menos sobre ele e mais sobre você se permitir descansar."
- "encruzilhada": a AURA explicitou duas direções/caminhos possíveis, sem escolher.
  Ex.: "De um lado, você cuida. Do outro, você se cobra. Os dois lados são reais."
- "leitura": a AURA devolveu uma leitura do que percebeu na pessoa (espelho).
  Ex.: "O que eu vejo é uma pessoa que aprendeu a ser forte cedo demais."
- "experimento": a AURA propôs uma experiência prática pra fazer entre sessões.
  Ex.: "Topa testar essa semana: toda vez que sentir, anote uma palavra."
- "pergunta-pra-carregar": a AURA deixou UMA pergunta forte pra a pessoa carregar.
  Ex.: "Carrega isso essa semana: o que essa raiva tá protegendo?"
- "escolha-binaria": a AURA colocou uma escolha clara entre duas opções concretas.
  Ex.: "Você quer continuar tentando ou quer começar a se preparar pra soltar?"
- "micro-passo": a AURA propôs UMA ação pequena e concreta (exceção, não padrão).
  Ex.: "Antes de dormir hoje, escreva uma frase pra você mesma."

REGRAS:
- closure_text = a frase/pergunta/proposta literal da AURA que fecha o ciclo (até 240 chars).
- closure_type = qual dos 7 formatos. null se ambíguo ou ausente.
- reframe_text = a síntese do reframe da sessão (a virada de perspectiva que a AURA devolveu). Pode ser null se a sessão foi puramente exploratória.
- theme_label = 2-5 palavras nomeando o tema central (ex.: "limites com a mãe", "medo de errar no trabalho"). Sem ponto final.

──────────────────────────────────────────
CAMPOS DE INSTRUMENTAÇÃO (M2 — gate conversacional):
──────────────────────────────────────────
- last_user_emotional_state: como o USUÁRIO estava emocionalmente na ÚLTIMA fala dele antes do encerramento.
  Valores permitidos: 'sereno' | 'aliviado' | 'esperancoso' | 'reflexivo' | 'ambivalente' | 'vulneravel' | 'em_choro' | 'raivoso' | 'ansioso' | 'evasivo' | 'silencio' | null.
  Use 'silencio' se a última fala foi um "ok"/emoji vazio ou nenhuma resposta ao fechamento da AURA. null se ambíguo.
- had_dated_bridge: true se a AURA deixou uma ponte com REFERÊNCIA TEMPORAL concreta (ex.: "amanhã cedo", "sexta que vem", "no próximo domingo"). false se a ponte foi vaga ("qualquer hora", "quando quiser") ou inexistente.
- commitment_confirmed: true se houve pelo menos UM compromisso proposto pela AURA com aceite EXPLÍCITO do usuário ("topo", "combinado", "vou fazer", "💜"). false se compromissos foram apenas sugeridos sem aceite, ou inexistentes.
- closure_state (derivado — como a última interação ficou, para gate de outbounds):
   • 'fechada_tranquila' → aterrissagem com estado sereno/aliviado/esperancoso
   • 'fechada_com_direcao' → aterrissagem + commitment_confirmed=true OU had_dated_bridge=true
   • 'aberta_com_pergunta' → AURA deixou pergunta sem resposta do usuário
   • 'aberta_vulneravel' → usuário terminou em estado vulneravel/em_choro/raivoso/ansioso
   • 'aberta_em_silencio' → última fala do usuário foi vazia/emoji ou silêncio pós-fechamento

──────────────────────────────────────────
REGRAS GERAIS:
──────────────────────────────────────────
- summary: 2-3 frases sobre o tema central e a virada que aconteceu na sessão
- key_insights: pelo menos 2 quando possível (mudanças de perspectiva, padrões nomeados, reconhecimentos)
- commitments: array vazio É VÁLIDO se a sessão foi puramente emocional/exploratória
- Português brasileiro claro, na voz do usuário (1ª pessoa quando fizer sentido)`;

const EXTRACTION_TOOL = {
  type: "function" as const,
  function: {
    name: "extract_session_data",
    description: "Extrai resumo, insights e compromissos de uma sessão de mentoria emocional encerrada",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Resumo de 2-3 frases sobre o tema central e a virada/conclusão da sessão",
        },
        key_insights: {
          type: "array",
          items: { type: "string" },
          description: "Lista de aprendizados/reconhecimentos que emergiram (idealmente 2-4 itens)",
        },
        commitments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Descrição da ação concreta acordada" },
            },
            required: ["title"],
            additionalProperties: false,
          },
          description: "Compromissos práticos assumidos (pode ser vazio se sessão foi puramente emocional)",
        },
        theme_label: {
          type: ["string", "null"],
          description: "2-5 palavras nomeando o tema central da sessão. Ex.: 'limites com a mãe'. null se ambíguo.",
        },
        reframe_text: {
          type: ["string", "null"],
          description: "Síntese da virada de perspectiva (reframe) entregue pela AURA. null se a sessão foi puramente exploratória.",
        },
        closure_type: {
          type: ["string", "null"],
          enum: [
            "tese",
            "encruzilhada",
            "leitura",
            "experimento",
            "pergunta-pra-carregar",
            "escolha-binaria",
            "micro-passo",
            null,
          ],
          description: "Qual dos 7 formatos do Cardápio de Fechamento a AURA usou. null se ambíguo/ausente.",
        },
        closure_text: {
          type: ["string", "null"],
          description: "Frase/pergunta/proposta literal da AURA que fecha o ciclo (até 240 caracteres). null se não houve fechamento claro.",
        },
        last_user_emotional_state: {
          type: ["string", "null"],
          enum: ['sereno','aliviado','esperancoso','reflexivo','ambivalente','vulneravel','em_choro','raivoso','ansioso','evasivo','silencio', null],
          description: "Estado emocional do USUÁRIO na última fala antes do encerramento.",
        },
        had_dated_bridge: {
          type: "boolean",
          description: "true se a AURA deixou ponte com referência temporal concreta (data/dia/prazo).",
        },
        commitment_confirmed: {
          type: "boolean",
          description: "true se ao menos um compromisso proposto pela AURA teve aceite explícito do usuário.",
        },
        closure_state: {
          type: ["string", "null"],
          enum: ['fechada_tranquila','fechada_com_direcao','aberta_com_pergunta','aberta_vulneravel','aberta_em_silencio', null],
          description: "Estado consolidado da última interação, usado como gate para outbounds automáticos.",
        },
      },
      required: [
        "summary",
        "key_insights",
        "commitments",
        "theme_label",
        "reframe_text",
        "closure_type",
        "closure_text",
        "last_user_emotional_state",
        "had_dated_bridge",
        "commitment_confirmed",
        "closure_state",
      ],
      additionalProperties: false,
    },
  },
};

interface ExtractionResult {
  summary: string;
  key_insights: string[];
  commitments: Array<{ title: string }>;
  theme_label: string | null;
  reframe_text: string | null;
  closure_type: string | null;
  closure_text: string | null;
  last_user_emotional_state: string | null;
  had_dated_bridge: boolean;
  commitment_confirmed: boolean;
  closure_state: string | null;
}

/**
 * Chama Gemini Flash via Lovable AI Gateway com tool calling forçado.
 * Retorna null em caso de falha (sem retries — quem chama decide re-disparar).
 */
async function callExtractor(
  conversationText: string,
  apiKey: string,
): Promise<ExtractionResult | null> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: `Conversa completa da sessão (analise e extraia):\n\n${conversationText}` },
      ],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "function", function: { name: "extract_session_data" } },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`❌ session-extractor: AI gateway ${response.status}: ${body.slice(0, 300)}`);
    return null;
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    console.error("❌ session-extractor: tool_call ausente na resposta");
    return null;
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    const ALLOWED_CLOSURE = new Set([
      "tese",
      "encruzilhada",
      "leitura",
      "experimento",
      "pergunta-pra-carregar",
      "escolha-binaria",
      "micro-passo",
    ]);
    const rawClosureType =
      typeof parsed.closure_type === "string" ? parsed.closure_type.trim().toLowerCase() : null;
    const closure_type =
      rawClosureType && ALLOWED_CLOSURE.has(rawClosureType) ? rawClosureType : null;
    const closure_text =
      typeof parsed.closure_text === "string" && parsed.closure_text.trim()
        ? parsed.closure_text.trim().slice(0, 240)
        : null;
    const reframe_text =
      typeof parsed.reframe_text === "string" && parsed.reframe_text.trim()
        ? parsed.reframe_text.trim().slice(0, 800)
        : null;
    const theme_label =
      typeof parsed.theme_label === "string" && parsed.theme_label.trim()
        ? parsed.theme_label.trim().slice(0, 80)
        : null;
    const ALLOWED_EMO = new Set(['sereno','aliviado','esperancoso','reflexivo','ambivalente','vulneravel','em_choro','raivoso','ansioso','evasivo','silencio']);
    const rawEmo = typeof parsed.last_user_emotional_state === 'string' ? parsed.last_user_emotional_state.trim().toLowerCase() : null;
    const last_user_emotional_state = rawEmo && ALLOWED_EMO.has(rawEmo) ? rawEmo : null;
    const ALLOWED_CLOSURE_STATE = new Set(['fechada_tranquila','fechada_com_direcao','aberta_com_pergunta','aberta_vulneravel','aberta_em_silencio']);
    const rawState = typeof parsed.closure_state === 'string' ? parsed.closure_state.trim().toLowerCase() : null;
    const closure_state = rawState && ALLOWED_CLOSURE_STATE.has(rawState) ? rawState : null;
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      key_insights: Array.isArray(parsed.key_insights) ? parsed.key_insights : [],
      commitments: Array.isArray(parsed.commitments)
        ? parsed.commitments.filter((c: any) => c && typeof c.title === "string")
        : [],
      theme_label,
      reframe_text,
      closure_type,
      closure_text,
      last_user_emotional_state,
      had_dated_bridge: parsed.had_dated_bridge === true,
      commitment_confirmed: parsed.commitment_confirmed === true,
      closure_state,
    };
  } catch (err) {
    console.error("❌ session-extractor: falha ao decodificar tool arguments:", err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const sessionId = body?.session_id;

    if (!sessionId || typeof sessionId !== "string") {
      return new Response(
        JSON.stringify({ error: "session_id (string) é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      console.error("❌ session-extractor: LOVABLE_API_KEY ausente");
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1) Carrega a sessão
    const { data: session, error: sessionErr } = await supabase
      .from("sessions")
      .select("id, user_id, started_at, ended_at, status")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr || !session) {
      console.error(`❌ session-extractor: sessão ${sessionId} não encontrada`, sessionErr);
      return new Response(
        JSON.stringify({ error: "session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) Busca mensagens trocadas durante a sessão (started_at .. ended_at OU now)
    const upperBound = session.ended_at ?? new Date().toISOString();
    const { data: sessionMessages } = await supabase
      .from("messages")
      .select("content, role, created_at")
      .eq("user_id", session.user_id)
      .gte("created_at", session.started_at)
      .lte("created_at", upperBound)
      .order("created_at", { ascending: true })
      .limit(120);

    if (!sessionMessages || sessionMessages.length < 3) {
      console.log(`ℹ️ session-extractor: sessão ${sessionId} com menos de 3 mensagens — extração mínima`);
      await supabase
        .from("sessions")
        .update({
          session_summary: "Sessão muito curta para análise estruturada.",
          key_insights: [],
          commitments: [],
        })
        .eq("id", sessionId);
      return new Response(
        JSON.stringify({ ok: true, reason: "too_few_messages", message_count: sessionMessages?.length ?? 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const conversationText = sessionMessages
      .map((m: any) => `${m.role === "user" ? "USUÁRIO" : "AURA"}: ${String(m.content).substring(0, 600)}`)
      .join("\n");

    // 3) Chama o extrator
    console.log(`🧪 session-extractor: extraindo sessão ${sessionId} (${sessionMessages.length} msgs)`);
    const result = await callExtractor(conversationText, lovableApiKey);

    if (!result || !result.summary) {
      console.error(`❌ session-extractor: falha na extração para ${sessionId} — não persistindo (ciclo seguinte re-tenta)`);
      return new Response(
        JSON.stringify({ ok: false, error: "extraction_failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4) Persiste — sobrescreve sempre (idempotente)
    const { error: updateErr } = await supabase
      .from("sessions")
      .update({
        session_summary: result.summary,
        key_insights: result.key_insights,
        commitments: result.commitments,
        theme_label: result.theme_label,
        reframe_text: result.reframe_text,
        closure_type: result.closure_type,
        closure_text: result.closure_text,
        last_user_emotional_state: result.last_user_emotional_state,
        had_dated_bridge: result.had_dated_bridge,
        commitment_confirmed: result.commitment_confirmed,
      })
      .eq("id", sessionId);

    if (updateErr) {
      console.error(`❌ session-extractor: erro ao gravar sessão ${sessionId}:`, updateErr);
      return new Response(
        JSON.stringify({ ok: false, error: "persist_failed", details: updateErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5) Propaga closure_state pro profile — gate consolidado para outbounds automáticos
    //    (scheduled-checkin, scheduled-followup, periodic-content, reactivation-blast etc.).
    //    Não bloqueia o retorno — falha aqui não invalida a extração.
    if (result.closure_state) {
      try {
        await supabase
          .from('profiles')
          .update({
            last_interaction_closure_state: result.closure_state,
            last_interaction_closure_at: new Date().toISOString(),
          })
          .eq('user_id', session.user_id);
      } catch (propErr) {
        console.error(`⚠️ session-extractor: falha ao propagar closure_state pro profile ${session.user_id}:`, propErr);
      }
    }

    console.log(
      `✅ session-extractor: ${sessionId} → summary(${result.summary.length}c), insights(${result.key_insights.length}), commitments(${result.commitments.length}), closure(${result.closure_type ?? "null"})`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        session_id: sessionId,
        summary_length: result.summary.length,
        insights_count: result.key_insights.length,
        commitments_count: result.commitments.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ session-extractor: erro inesperado:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});