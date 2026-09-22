const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

export type PeriodMetrics = { messages: number; sessions: number; journeys: number; practices: number };
export type ReportEvidence = { message_id: string; quote: string; date: string };
export type ReportAnalysis = { title: string; observation: string; movement: string | null; continuation: string; evidence: ReportEvidence[]; confidence: "high" | "low" | "insufficient_data" };
type SourceMessage = { id: string; content: string; created_at: string };

function clean(value: unknown, max: number) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""; }

async function collectPeriodContext(db: any, userId: string, start: Date, end: Date) {
  const startIso = start.toISOString(), endIso = end.toISOString();
  const [messagesRes, sessionsRes, milestonesRes, insightsRes] = await Promise.all([
    db.from("messages").select("id,content,created_at").eq("user_id", userId).eq("role", "user").gte("created_at", startIso).lt("created_at", endIso).order("created_at", { ascending: false }).limit(160),
    db.from("sessions").select("focus_topic,session_summary,closure_text,reframe_text,ended_at").eq("user_id", userId).eq("status", "completed").gte("ended_at", startIso).lt("ended_at", endIso).order("ended_at", { ascending: false }).limit(8),
    db.from("user_milestones").select("milestone_text,context_excerpt,milestone_date").eq("user_id", userId).gte("milestone_date", startIso).lt("milestone_date", endIso).order("milestone_date", { ascending: false }).limit(8),
    db.from("user_insights").select("key,value,importance,last_mentioned_at").eq("user_id", userId).gte("last_mentioned_at", startIso).lt("last_mentioned_at", endIso).order("importance", { ascending: false }).limit(10),
  ]);
  const messages = ((messagesRes.data || []) as SourceMessage[]).filter((item) => clean(item.content, 400).length > 0).reverse();
  return { messages, sessions: sessionsRes.data || [], milestones: milestonesRes.data || [], insights: insightsRes.data || [] };
}

function selectMessages(messages: SourceMessage[]) {
  if (messages.length <= 60) return messages;
  return [...messages.slice(0, 20), ...messages.slice(-40)];
}

function factualFallback(kind: "weekly" | "monthly", firstName: string, current: PeriodMetrics): ReportAnalysis {
  const hasActivity = Object.values(current).some((value) => value > 0);
  return { title: kind === "weekly" ? `Sua semana, ${firstName}` : `Seu mês em perspectiva, ${firstName}`, observation: hasActivity ? "Este período deixou registros reais no seu Percurso. Eles mostram como você usou a Olá Aura, mas não permitem concluir sozinhos como você se sentiu." : "Este período foi mais silencioso por aqui. Seu Percurso continua guardado, sem conclusões prontas.", movement: null, continuation: hasActivity ? "O que deste período você gostaria de compreender melhor?" : "Quando fizer sentido, por onde você gostaria de retomar?", evidence: [], confidence: "insufficient_data" };
}

export async function generateReportAnalysis(db: any, input: { kind: "weekly" | "monthly"; userId: string; firstName: string; start: Date; end: Date; previousStart: Date; metrics: { current: PeriodMetrics; previous: PeriodMetrics } }): Promise<ReportAnalysis> {
  const [context, previousContext] = await Promise.all([
    collectPeriodContext(db, input.userId, input.start, input.end),
    collectPeriodContext(db, input.userId, input.previousStart, input.start),
  ]);
  if (context.messages.length < 10) return factualFallback(input.kind, input.firstName, input.metrics.current);
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return factualFallback(input.kind, input.firstName, input.metrics.current);
  const selectedMessages = selectMessages(context.messages);
  const previousMessages = selectMessages(previousContext.messages);
  const messageBlock = selectedMessages.map((message) => `[${message.id}] (${message.created_at.slice(0, 10)}) ${clean(message.content, 420)}`).join("\n");
  const previousMessageBlock = previousMessages.map((message) => `(${message.created_at.slice(0, 10)}) ${clean(message.content, 420)}`).join("\n");
  const sessionsBlock = context.sessions.map((session: any) => [session.focus_topic, session.session_summary, session.reframe_text, session.closure_text].map((value) => clean(value, 260)).filter(Boolean).join(" | ")).filter(Boolean).join("\n");
  const milestonesBlock = context.milestones.map((item: any) => clean(item.milestone_text, 220)).filter(Boolean).join(" | ");
  const insightsBlock = context.insights.map((item: any) => `${clean(item.key, 80)}: ${clean(item.value, 220)}`).filter((item: string) => item.length > 2).join(" | ");
  const confidence = context.messages.length >= 30 ? "high" : "low";
  const periodName = input.kind === "weekly" ? "semana" : "mês";
  const systemPrompt = `Você é a AURA e escreve uma leitura retrospectiva do ${periodName} para o próprio cliente. Use SOMENTE o material fornecido. Português brasileiro humano, direto, cuidadoso, sem emojis e sem clichês de coach.
REGRAS INEGOCIÁVEIS:
- Métricas de uso não provam melhora, piora, emoção ou estado psicológico.
- Toda leitura psicológica deve ser hipótese verificável: use "talvez", "parece" ou "pode indicar".
- Não diagnostique, não rotule, não dê nota e não invente arco de evolução.
- Não transforme redução de uso em regressão nem aumento de uso em progresso.
- movement nunca pode usar volume de mensagens, sessões, Jornadas ou práticas como prova de mudança. Compare o conteúdo literal dos dois períodos; sem evidência nos dois, retorne null.
- Escolha no máximo 2 citações. Cada quote deve ser substring EXATA de uma mensagem e usar o respectivo id.
- As citações e seus ids devem vir somente do período atual. Evite repetir palavrões ou trechos que possam constranger; prefira evidências igualmente fiéis e mais discretas.
- Não exponha detalhes íntimos no título. Não mencione crise, trauma ou risco no título.
- Se houver conteúdo delicado ou pouca base, seja neutra e reduza a interpretação.
- observation: 2 a 4 frases sobre o que realmente marcou o período.
- movement: 1 a 3 frases comparando apenas quando houver evidência temporal; caso contrário null.
- continuation: uma pergunta aberta, específica e útil para continuar na conversa.
Confiança disponível: ${confidence}.`;
  const userPrompt = `Cliente: ${input.firstName}\nPeríodo atual: ${input.start.toISOString()} até ${input.end.toISOString()}\nPeríodo anterior: ${input.previousStart.toISOString()} até ${input.start.toISOString()}\nMétricas atuais (somente contexto de uso): ${JSON.stringify(input.metrics.current)}\nMétricas anteriores (somente contexto de uso): ${JSON.stringify(input.metrics.previous)}\nSessões do período atual:\n${sessionsBlock || "nenhuma"}\nMarcos do período atual: ${milestonesBlock || "nenhum"}\nInsights registrados no período atual: ${insightsBlock || "nenhum"}\nMensagens literais do período anterior, apenas para comparação:\n${previousMessageBlock || "nenhuma"}\nMensagens literais do período atual, únicas permitidas como citação:\n${messageBlock}`;
  try {
    const response = await fetch(LOVABLE_AI_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], tools: [{ type: "function", function: { name: "emit_report", description: "Emite a leitura verificável do período.", parameters: { type: "object", properties: { title: { type: "string" }, observation: { type: "string" }, movement: { type: ["string", "null"] }, continuation: { type: "string" }, evidence: { type: "array", maxItems: 2, items: { type: "object", properties: { message_id: { type: "string" }, quote: { type: "string" } }, required: ["message_id", "quote"], additionalProperties: false } } }, required: ["title", "observation", "movement", "continuation", "evidence"], additionalProperties: false } } }], tool_choice: { type: "function", function: { name: "emit_report" } } }) });
    if (!response.ok) throw new Error(`AI Gateway ${response.status}`);
    const data = await response.json();
    const raw = JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments || "{}");
    const byId = new Map(context.messages.map((message) => [message.id, message]));
    const evidence: ReportEvidence[] = [];
    for (const item of Array.isArray(raw.evidence) ? raw.evidence.slice(0, 2) : []) { const source = byId.get(String(item.message_id)); const quote = clean(item.quote, 260); if (source && quote && source.content.includes(quote)) evidence.push({ message_id: source.id, quote, date: source.created_at }); }
    const observation = clean(raw.observation, input.kind === "weekly" ? 700 : 1100), continuation = clean(raw.continuation, 300);
    if (!observation || !continuation) return factualFallback(input.kind, input.firstName, input.metrics.current);
    const movementValue = clean(raw.movement, 650);
    const movement = !movementValue || /^null$/i.test(movementValue) || previousMessages.length < 10 ? null : movementValue;
    return { title: clean(raw.title, 120) || factualFallback(input.kind, input.firstName, input.metrics.current).title, observation, movement, continuation, evidence, confidence };
  } catch (error) { console.error("Falha na leitura qualitativa do relatório:", error); return factualFallback(input.kind, input.firstName, input.metrics.current); }
}

function activityLine(metrics: PeriodMetrics) {
  const items: string[] = [];
  if (metrics.messages) items.push("Você manteve seu espaço de conversa com a AURA");
  if (metrics.sessions) items.push(`${metrics.sessions} ${metrics.sessions === 1 ? "sessão concluída" : "sessões concluídas"}`);
  if (metrics.journeys) items.push(`${metrics.journeys} ${metrics.journeys === 1 ? "episódio de Jornada" : "episódios de Jornadas"}`);
  if (metrics.practices) items.push(`${metrics.practices} ${metrics.practices === 1 ? "prática" : "práticas"}`);
  return items.length ? items.join(" • ") : "Nenhuma atividade registrada na Olá Aura";
}

export function formatReport(analysis: ReportAnalysis, metrics: PeriodMetrics) {
  const sections = [analysis.title, analysis.observation];
  if (analysis.movement) sections.push(`Um possível movimento\n${analysis.movement}`);
  if (analysis.evidence.length) sections.push(`Nas suas palavras\n${analysis.evidence.map((item) => `“${item.quote}”`).join("\n")}`);
  sections.push(`Seu uso da Olá Aura\n${activityLine(metrics)}`);
  sections.push(`Um fio para continuar\n${analysis.continuation}`);
  sections.push("Esta é uma leitura da AURA, não uma conclusão sobre você. Você pode confirmar ou corrigir o que não fizer sentido.");
  return sections.join("\n\n");
}