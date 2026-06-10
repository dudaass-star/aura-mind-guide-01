// ============================================================================
// analyze-session-coverage — auditor de cobertura de sessão (sob demanda)
// ----------------------------------------------------------------------------
// Lê a transcrição de uma sessão encerrada e devolve um relatório estruturado
// dizendo se as 4 camadas investigativas (FATO/EMOÇÃO/CRENÇA/ORIGEM) e as 3
// fases (presença/sentido/movimento) foram cobertas, qualidade do reframe,
// formato de fechamento usado e red flags detectados.
//
// - Acesso: APENAS admin (valida via JWT claims + public.has_role).
// - Modelo: google/gemini-2.5-flash via Lovable AI Gateway (tool calling).
// - Cache: upsert em public.session_coverage_analyses por session_id.
// - Param `force: true` re-analisa e sobrescreve.
//
// Fonte das definições estritas: copiadas do micro-agent extractor da Fase 1
// (supabase/functions/aura-agent/index.ts ~L847-870) — qualquer mudança lá
// deve ser refletida aqui pra evitar drift de vocabulário.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash";

// Helper enxuto pra remover tags internas do conteúdo da Aura antes de mandar
// pro auditor — evita que [MODO_AUDIO], [AGENDAR_SESSAO], etc. confundam a
// análise. Versão simplificada do stripAllInternalTags do aura-agent.
function stripInternalTags(content: string): string {
  return String(content)
    .replace(/\[[A-Z_]+(?::[^\]]*)?\]/g, "")
    .replace(/\|\|\|/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SYSTEM_PROMPT = `Você é um auditor clínico de sessões de mentoria emocional (Logoterapia).
Sua tarefa: ler a transcrição de UMA sessão e avaliar com rigor se a metodologia foi cumprida.
Devolva APENAS os campos da ferramenta — sem inventar, sem inflar elogios.

============================================================
AS 4 CAMADAS INVESTIGATIVAS (que a Aura deveria explorar com o usuário):
============================================================

1. FATO — A situação concreta foi mapeada? Pessoas, contexto, o que aconteceu?
   Marque "coberta=true" SÓ se houver situação específica nomeada pelo usuário
   (ex.: "meu chefe me chamou ontem"), NÃO genéricos ("tenho problema no trabalho").

2. EMOÇÃO — A emoção foi nomeada/descrita pelo usuário (não só citada de passagem)?
   "Sentir raiva" / "ficou com vergonha" / "doeu" / etc. Citação superficial NÃO conta.

3. CRENÇA — Apareceu o que aquilo SIGNIFICA pro usuário? Uma crença sobre si,
   sobre o mundo, sobre o outro? ("Eu sempre fui assim", "não posso falhar",
   "se eu falar, perco respeito"). Se a Aura perguntou mas o usuário não entrou,
   marque false.

4. ORIGEM — Apareceu de ONDE vem essa crença/padrão? História, infância,
   primeira vez que sentiu, modelo familiar? Especulação da Aura sem o usuário
   confirmar NÃO conta.

REGRA DE OURO: cada camada exige EVIDÊNCIA literal (trecho curto, até 200 chars)
da fala do USUÁRIO ou de uma troca onde o usuário confirmou. Sem evidência → false.

============================================================
AS 3 FASES (arco da sessão):
============================================================

- PRESENÇA: acolhimento + exploração socrática + mapeamento. Aura faz perguntas
  abertas, valida, não corre pra interpretar.
- SENTIDO: reframe / nomeação de padrão / leitura crítica. Aura devolve uma
  observação como HIPÓTESE ABERTA ("o que tô vendo daqui é X. Faz sentido?").
- MOVIMENTO: compromisso / próximo passo / aterrissagem prática. Pode ser tese,
  encruzilhada, experimento, pergunta-pra-carregar, escolha-binária, leitura,
  ou (exceção) micro-passo. Fechamento emerge quando há material — não por clock.

============================================================
AVALIAÇÃO DO REFRAME:
============================================================
- "emergiu=true" se a Aura entregou uma leitura/observação não-óbvia em algum
  momento. Re-eco emocional ("isso é difícil mesmo") NÃO é reframe.
- "como_hipotese_aberta=true" se a Aura ofereceu como leitura ("o que tô vendo
  daqui é X, faz sentido?") em vez de impor como verdade.
- "qualidade_1_5": 1=ausente, 2=fraco/genérico, 3=ok, 4=preciso, 5=cirúrgico.

============================================================
RED FLAGS (lista FECHADA — use apenas estes códigos):
============================================================
- "dramatizacao" — Aura usa linguagem inflada/teatral sem material que sustente.
- "perguntas_socraticas_vazias" — Aura devolve perguntas em loop sem entregar
  leitura quando o usuário pediu direção ou já há material.
- "reframe_imposto_sem_hipotese" — Aura cravou interpretação sem oferecer recusa.
- "clock_muleta_acionado" — fechamento forçado por tempo, não por material
  (ex.: "estamos na metade da sessão...", "já se passaram X min").
- "fechamento_forcado_sem_material" — Aura amarrou em compromisso sem que
  houvesse reframe/sentido suficiente antes.
- "concordancia_passiva_tratada_como_reflexao" — Aura interpretou "faz sentido"
  / "é verdade" como insight do usuário, sem ele trazer conexão própria.
- "interrupcao_fase_presenca" — Aura pulou pra reframe nas primeiras trocas
  sem ouvir o suficiente.

Marque APENAS os red flags que apareceram com evidência clara. Não force.

============================================================
NOTA GERAL (overall_score 1–5):
============================================================
1=sessão ruim (cobertura mínima + red flags). 2=fraca. 3=ok. 4=boa.
5=sessão de elite (4 camadas cobertas, 3 fases naturais, reframe cirúrgico
como hipótese aberta, fechamento orgânico).

============================================================
DIAGNÓSTICO (diagnosis):
============================================================
3–5 linhas em português brasileiro, direto, sem elogio automático. Diga o que
funcionou e o que faltou. Cite evidência quando útil.`;

const ANALYSIS_TOOL = {
  type: "function" as const,
  function: {
    name: "report_session_coverage",
    description: "Devolve auditoria estruturada de cobertura de uma sessão de mentoria.",
    parameters: {
      type: "object",
      properties: {
        camadas: {
          type: "object",
          properties: {
            fato: layerSchema(),
            emocao: layerSchema(),
            crenca: layerSchema(),
            origem: layerSchema(),
          },
          required: ["fato", "emocao", "crenca", "origem"],
          additionalProperties: false,
        },
        fases: {
          type: "object",
          properties: {
            presenca: phaseSchema(),
            sentido: phaseSchema(),
            movimento: phaseSchema(),
          },
          required: ["presenca", "sentido", "movimento"],
          additionalProperties: false,
        },
        reframe: {
          type: "object",
          properties: {
            emergiu: { type: "boolean" },
            como_hipotese_aberta: { type: "boolean" },
            qualidade_1_5: { type: "integer", minimum: 1, maximum: 5 },
            trecho: { type: ["string", "null"], description: "Trecho literal do reframe (até 240 chars). null se não emergiu." },
          },
          required: ["emergiu", "como_hipotese_aberta", "qualidade_1_5", "trecho"],
          additionalProperties: false,
        },
        fechamento: {
          type: "object",
          properties: {
            formato_cardapio: {
              type: ["string", "null"],
              enum: [
                "tese", "encruzilhada", "leitura", "experimento",
                "pergunta-pra-carregar", "escolha-binaria", "micro-passo",
                "nenhum", null,
              ],
            },
            usuario_se_comprometeu: { type: "boolean" },
            trecho: { type: ["string", "null"], description: "Trecho literal do fechamento (até 240 chars). null se não houve." },
          },
          required: ["formato_cardapio", "usuario_se_comprometeu", "trecho"],
          additionalProperties: false,
        },
        red_flags: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "dramatizacao",
              "perguntas_socraticas_vazias",
              "reframe_imposto_sem_hipotese",
              "clock_muleta_acionado",
              "fechamento_forcado_sem_material",
              "concordancia_passiva_tratada_como_reflexao",
              "interrupcao_fase_presenca",
            ],
          },
          description: "Lista possivelmente vazia. Não force.",
        },
        overall_score: { type: "integer", minimum: 1, maximum: 5 },
        diagnosis: { type: "string", description: "3–5 linhas em PT-BR. Direto." },
      },
      required: ["camadas", "fases", "reframe", "fechamento", "red_flags", "overall_score", "diagnosis"],
      additionalProperties: false,
    },
  },
};

function layerSchema() {
  return {
    type: "object",
    properties: {
      coberta: { type: "boolean" },
      evidencia: { type: ["string", "null"], description: "Trecho literal (até 200 chars) que justifica. null se coberta=false." },
    },
    required: ["coberta", "evidencia"],
    additionalProperties: false,
  } as const;
}

function phaseSchema() {
  return {
    type: "object",
    properties: {
      coberta: { type: "boolean" },
      comentario: { type: "string", description: "1–2 linhas: como foi conduzida ou por que não foi." },
    },
    required: ["coberta", "comentario"],
    additionalProperties: false,
  } as const;
}

interface Coverage {
  camadas: Record<"fato" | "emocao" | "crenca" | "origem", { coberta: boolean; evidencia: string | null }>;
  fases: Record<"presenca" | "sentido" | "movimento", { coberta: boolean; comentario: string }>;
  reframe: { emergiu: boolean; como_hipotese_aberta: boolean; qualidade_1_5: number; trecho: string | null };
  fechamento: { formato_cardapio: string | null; usuario_se_comprometeu: boolean; trecho: string | null };
}

interface AnalysisResult extends Coverage {
  red_flags: string[];
  overall_score: number;
  diagnosis: string;
}

async function callAuditor(transcript: string, apiKey: string): Promise<AnalysisResult | null> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Transcrição completa da sessão para auditoria:\n\n${transcript}` },
      ],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "function", function: { name: "report_session_coverage" } },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`❌ analyze-session-coverage: AI gateway ${response.status}: ${body.slice(0, 400)}`);
    return null;
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    console.error("❌ analyze-session-coverage: tool_call ausente");
    return null;
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments) as AnalysisResult;
    return parsed;
  } catch (err) {
    console.error("❌ analyze-session-coverage: parse falhou:", err);
    return null;
  }
}

// Cap de transcrição: ~30k chars. Mantém os primeiros 18k e os últimos 12k.
function capTranscript(text: string, maxChars = 30000): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, 18000);
  const tail = text.slice(text.length - 12000);
  return `${head}\n\n[... TRECHO INTERMEDIÁRIO OMITIDO POR TAMANHO ...]\n\n${tail}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Auth — só admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: callerId, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Parse body
    const body = await req.json().catch(() => null);
    const sessionId: string | undefined = body?.session_id;
    const force = body?.force === true;
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "session_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Cache hit?
    if (!force) {
      const { data: existing } = await supabase
        .from("session_coverage_analyses")
        .select("*")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ ok: true, cached: true, analysis: existing }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 4) Carrega sessão + mensagens
    const { data: session, error: sessErr } = await supabase
      .from("sessions")
      .select("id, user_id, started_at, ended_at, status, focus_topic, duration_minutes")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessErr || !session) {
      return new Response(JSON.stringify({ error: "sessão não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!session.started_at) {
      return new Response(JSON.stringify({ error: "sessão ainda não foi iniciada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const upperBound = session.ended_at ?? new Date().toISOString();
    const { data: messages } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", session.user_id)
      .gte("created_at", session.started_at)
      .lte("created_at", upperBound)
      .order("created_at", { ascending: true })
      .limit(300);

    if (!messages || messages.length < 4) {
      return new Response(JSON.stringify({ error: "sessão com poucas mensagens para auditoria" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transcript = capTranscript(
      messages
        .map((m: any) => `${m.role === "user" ? "USUÁRIO" : "AURA"}: ${stripInternalTags(String(m.content))}`)
        .join("\n"),
    );

    // 5) Auditor
    console.log(`🔍 analyze-session-coverage: sessão=${sessionId} msgs=${messages.length} chars=${transcript.length}`);
    const result = await callAuditor(transcript, lovableApiKey);
    if (!result) {
      return new Response(JSON.stringify({ error: "falha na auditoria via LLM" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6) Upsert
    const coverage: Coverage = {
      camadas: result.camadas,
      fases: result.fases,
      reframe: result.reframe,
      fechamento: result.fechamento,
    };

    const { data: saved, error: upsertErr } = await supabase
      .from("session_coverage_analyses")
      .upsert(
        {
          session_id: sessionId,
          analyzed_at: new Date().toISOString(),
          model: MODEL,
          coverage,
          overall_score: result.overall_score,
          diagnosis: result.diagnosis,
          red_flags: result.red_flags ?? [],
        },
        { onConflict: "session_id" },
      )
      .select()
      .single();

    if (upsertErr) {
      console.error("❌ analyze-session-coverage: upsert falhou:", upsertErr);
      return new Response(JSON.stringify({ error: "falha ao salvar análise", details: upsertErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`✅ analyze-session-coverage: sessão=${sessionId} score=${result.overall_score} red_flags=${result.red_flags.length}`);
    return new Response(JSON.stringify({ ok: true, cached: false, analysis: saved }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ analyze-session-coverage: erro inesperado:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});