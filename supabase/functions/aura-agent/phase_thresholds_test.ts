// Testes de garantia para os thresholds do Phase Evaluator (Fase 1).
// Estratégia: análise estática do arquivo index.ts.
// Motivo: evaluateTherapeuticPhase não é exportada e depende de muito contexto;
// validar via texto é o jeito mais confiável de garantir que os números corretos
// estão no código e que não voltaram resíduos antigos (>= 7 / >= 8).

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SOURCE_PATH = new URL("./index.ts", import.meta.url);
const SOURCE = await Deno.readTextFile(SOURCE_PATH);

Deno.test("Phase Evaluator: gatilho de Presença → Sentido usa recentPairs >= 4", () => {
  const matches = SOURCE.match(/recentPairs\s*>=\s*4\s*&&\s*detectedPhase\s*===\s*['"]presenca['"]/g);
  assert(matches && matches.length === 1, `Esperava exatamente 1 ocorrência de "recentPairs >= 4 && detectedPhase === 'presenca'", encontrei ${matches?.length ?? 0}`);
});

Deno.test("Phase Evaluator: gatilho de Sentido → Movimento usa recentPairs >= 5", () => {
  const matches = SOURCE.match(/recentPairs\s*>=\s*5\s*&&\s*detectedPhase\s*===\s*['"]sentido['"]/g);
  assert(matches && matches.length === 1, `Esperava exatamente 1 ocorrência de "recentPairs >= 5 && detectedPhase === 'sentido'", encontrei ${matches?.length ?? 0}`);
});

Deno.test("Phase Evaluator: NÃO existem resíduos antigos (>= 7 ou >= 8) em condições do evaluator", () => {
  const stale7 = SOURCE.match(/recentPairs\s*>=\s*7/g);
  const stale8 = SOURCE.match(/recentPairs\s*>=\s*8/g);
  assertEquals(stale7, null, "Resíduo encontrado: recentPairs >= 7 ainda está no código.");
  assertEquals(stale8, null, "Resíduo encontrado: recentPairs >= 8 ainda está no código.");
});

Deno.test("Phase Evaluator: freio de Presença mínimo (recentUserCount < 4) permanece intacto", () => {
  const brake = SOURCE.match(/recentUserCount\s*<\s*4\s*&&\s*detectedPhase\s*!==\s*['"]presenca['"]/);
  assert(brake, "O freio de Presença (recentUserCount < 4) sumiu — risco de avanço prematuro nas primeiras trocas.");
});

Deno.test("Phase Evaluator: comentários documentam a Fase 1 (timing higiênico)", () => {
  // Garantia leve de que o motivo da mudança está documentado no código,
  // evitando que alguém reverta os números sem entender o contexto.
  assert(
    /Fase 1.*timing higi[eê]nico/i.test(SOURCE),
    "Comentário 'Fase 1: timing higiênico' sumiu — adicione contexto antes/depois dos thresholds."
  );
});

Deno.test("Confronto cirúrgico: técnica nº6 está no cardápio de Reframe", () => {
  assert(
    /6\.\s*\*\*CONFRONTO CIRÚRGICO\*\*/.test(SOURCE),
    "Técnica nº6 (CONFRONTO CIRÚRGICO) sumiu do cardápio de Reframe da sessão."
  );
});

Deno.test("Conexão longitudinal: bloco obrigatório no Reframe e na Abertura", () => {
  assert(
    /CONEX[ÃA]O LONGITUDINAL/.test(SOURCE),
    "Bloco 'CONEXÃO LONGITUDINAL' sumiu do prompt do Reframe."
  );
  assert(
    /ABERTURA OBRIGAT[ÓO]RIA COM FIO CONDUTOR/.test(SOURCE),
    "Bloco 'ABERTURA OBRIGATÓRIA COM FIO CONDUTOR' sumiu do prompt da fase opening."
  );
});

Deno.test("Modo PING-PONG: regra de tamanho contextual (300/600) está aplicada", () => {
  assert(
    /TAMANHO CONTEXTUAL/.test(SOURCE),
    "Substituição de 'MÁXIMO 300 CARACTERES' por 'TAMANHO CONTEXTUAL' sumiu do MODO PING-PONG."
  );
  assert(
    /600 caracteres/.test(SOURCE),
    "Limite expandido de 600 caracteres para carga emocional sumiu do MODO PING-PONG."
  );
});

Deno.test("Fase 1 — Presença: regra 'VALIDA + ENTREGA' está no prompt", () => {
  assert(
    /VALIDA \+ ENTREGA/.test(SOURCE),
    "Regra 'VALIDA + ENTREGA' sumiu do prompt da FASE 1 — PRESENÇA."
  );
});