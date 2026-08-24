// Testes da rota de descida de fase (TTL + dois votos) e do contrato do extrator.
// Estratégia: `isPhaseExpired` é exportada e pura → teste de comportamento.
// O resto (condição de descida dentro de evaluateTherapeuticPhase, texto do prompt)
// é validado por análise estática do index.ts, mesmo padrão de phase_thresholds_test.ts.

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SOURCE = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

// ---- isPhaseExpired: extraído da fonte para não subir o Deno.serve do index.ts ----
const ttl = SOURCE.match(/export const PHASE_TTL_MS = .*?;/s)!;
const dayKey = SOURCE.match(/function brtDayKey[\s\S]*?\n}/)!;
const expired = SOURCE.match(/export function isPhaseExpired[\s\S]*?\n}/)!;
assert(ttl && dayKey && expired, "TTL de fase não encontrado em index.ts");

const isPhaseExpired = new Function(
  `${ttl[0].replace("export const", "const")}
   ${dayKey[0].replace("(d: Date): string", "(d)")}
   ${expired[0]
     .replace("export function", "function")
     .replace("(updatedAt?: string | null, now: Date = new Date()): boolean", "(updatedAt, now = new Date())")}
   return isPhaseExpired;`
)() as (updatedAt?: string | null, now?: Date) => boolean;

Deno.test("TTL: fase de 10 min atrás continua válida", () => {
  const now = new Date("2026-08-24T18:00:00Z");
  const then = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  assert(isPhaseExpired(then, now) === false);
});

Deno.test("TTL: fase de 61 min atrás expira", () => {
  const now = new Date("2026-08-24T18:00:00Z");
  const then = new Date(now.getTime() - 61 * 60 * 1000).toISOString();
  assert(isPhaseExpired(then, now) === true);
});

Deno.test("TTL: virada de dia civil BRT expira mesmo com menos de 60 min", () => {
  // 02:50 UTC = 23:50 BRT (dia 23) | 03:10 UTC = 00:10 BRT (dia 24)
  const now = new Date("2026-08-24T03:10:00Z");
  const then = new Date("2026-08-24T02:50:00Z").toISOString();
  assert(isPhaseExpired(then, now) === true);
});

Deno.test("TTL: sem timestamp, trata como expirada (conversa começa sem fase)", () => {
  assert(isPhaseExpired(null) === true);
  assert(isPhaseExpired(undefined) === true);
  assert(isPhaseExpired("data-invalida") === true);
});

Deno.test("TTL só se aplica fora de sessão e limpa apenas a fase (memória fica)", () => {
  const block = SOURCE.match(/if \(!sessionActive && lastUserContext\?\.aura_phase && isPhaseExpired\(lastUserContextUpdatedAt\)\)[\s\S]*?\n  }/)!;
  assert(block, "Guarda de TTL da fase não encontrada no evaluator.");
  assert(block[0].includes("aura_phase: undefined"), "O TTL deve zerar somente aura_phase.");
});

// ---- Descida: dois votos ----
Deno.test("descida exige DOIS votos (turno leve + engagement != engaged)", () => {
  assert(
    /const lightVote = lastUserContext\?\.user_turn_weight === 'light' \|\| practicalTurn;/.test(SOURCE),
    "O voto de turno leve deve considerar user_turn_weight e pergunta prática."
  );
  assert(
    /notEngaged = lastUserContext\?\.engagement_level !== 'engaged'/.test(SOURCE),
    "Falta o segundo voto: engagement_level !== 'engaged'."
  );
  assert(
    /if \(lightVote && lightStreak >= 2 && notEngaged\)/.test(SOURCE),
    "A condição de descida deve exigir os dois votos e 2 turnos leves consecutivos."
  );
});

Deno.test("guarda que travava a descida com fase salva foi removida", () => {
  const stale = SOURCE.match(/if \(!lastUserContext\?\.aura_phase\) \{\s*\n\s*const hasEmotionalDepth/);
  assert(stale, "O check por keyword segue condicionado à ausência de fase (esperado).");
  assert(
    SOURCE.includes("ROTA DE DESCIDA (sempre ativa"),
    "Falta a rota de descida sempre ativa antes do check por keyword."
  );
  const iDescida = SOURCE.indexOf("ROTA DE DESCIDA (sempre ativa");
  const iKeyword = SOURCE.indexOf("Skip keyword depth check");
  assert(iDescida < iKeyword, "A rota de descida deve ser avaliada antes do check por keyword.");
});

Deno.test("desvio (<=2 turnos) mantém tema em espera; virada (3+) solta o tema", () => {
  assert(SOURCE.includes("TEMA ANTERIOR EM ESPERA"), "Falta guidance de tema em espera.");
  assert(SOURCE.includes("VIRADA DE ASSUNTO CONFIRMADA"), "Falta guidance de virada de assunto.");
  assert(/parkedTurns <= 2/.test(SOURCE) && /parkedTurns >= 3/.test(SOURCE),
    "Os limites de desvio (<=2) e virada (>=3) devem estar explícitos.");
});

Deno.test("freio de densidade: presença → sentido não avança com information_density baixa", () => {
  assert(
    /recentPairs >= 4 && detectedPhase === 'presenca' && lastUserContext\?\.information_density !== 'low'/.test(SOURCE),
    "O empurrão de presença → sentido deve exigir material concreto (density != low)."
  );
});

// ---- Contrato do extrator ----
Deno.test("extrator mede a fase no TURNO DO USUÁRIO, não na resposta da assistente", () => {
  assert(
    SOURCE.includes("classifique a fase que o TURNO DO USUÁRIO autoriza"),
    "O prompt do extrator deve medir a fase pelo turno do usuário."
  );
  assert(
    !SOURCE.includes("classifique a fase terapêutica da RESPOSTA DA ASSISTENTE"),
    "Resíduo: o extrator ainda classifica a própria resposta da assistente."
  );
});

Deno.test("extrator define user_turn_weight com tamanho NÃO decisivo e default loaded", () => {
  const rule = SOURCE.match(/- user_turn_weight:.*/)![0];
  assert(rule.includes("TAMANHO"), "A regra deve dizer que o tamanho não decide.");
  assert(rule.includes('Em dúvida, marque "loaded"'), "Em dúvida deve marcar loaded (não desce).");
  assert(rule.includes("mesmo em uma palavra"), "Resposta precisa a pergunta pesada é loaded.");
});

Deno.test("extrator pede topic_parked e o estado é persistido com contagem de turnos", () => {
  assert(/- topic_parked:/.test(SOURCE), "Falta a regra de topic_parked no prompt.");
  assert(/light_turn_streak: lightTurnStreak/.test(SOURCE), "Falta persistir light_turn_streak.");
  assert(/parked_turns: parkedTurns/.test(SOURCE), "Falta persistir parked_turns.");
});

// ---- Personalidade no registro leve ----
Deno.test("bloco de humor existe DENTRO do MODO PING-PONG", () => {
  const iPingPong = SOURCE.indexOf("## MODO PING-PONG");
  const iHumor = SOURCE.indexOf("### PERSONALIDADE NO REGISTRO LEVE");
  const iProfundo = SOURCE.indexOf("## MODO PROFUNDO");
  assert(iPingPong > -1 && iHumor > -1 && iProfundo > -1, "Blocos não encontrados.");
  assert(iPingPong < iHumor && iHumor < iProfundo, "O bloco de humor deve ficar dentro do MODO PING-PONG.");
});

Deno.test("bloco de humor autoriza brincar de volta, cobre zoação da própria Aura e alternância", () => {
  const start = SOURCE.indexOf("### PERSONALIDADE NO REGISTRO LEVE");
  const block = SOURCE.slice(start, SOURCE.indexOf("## MODO PROFUNDO", start));
  assert(block.includes("brincar de volta"), "Falta permissão explícita de brincar de volta.");
  assert(/zoa VOCÊ/.test(block), "Falta o caso do usuário zoando a própria Aura.");
  assert(/nunca se defenda|Nunca se defenda/.test(block), "A resposta à zoação não pode ser defensiva.");
  assert(block.includes("Alternar leve ↔ profundo"), "Falta dizer que alternar é esperado.");
  const exemplos = (block.match(/^• /gm) || []).length;
  assert(exemplos >= 2, `Esperava 2+ exemplos de fala com humor, encontrei ${exemplos}.`);
});
