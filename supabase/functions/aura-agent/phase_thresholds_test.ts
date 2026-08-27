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
  // Forma atual: o freio foi extraído em `brakeByPairs` e combinado com brakeByDensity.
  assert(
    /const brakeByPairs = recentUserCount < 4 && !densitySaturated;/.test(SOURCE),
    "O freio de Presença por pares (recentUserCount < 4) sumiu — risco de avanço prematuro nas primeiras trocas."
  );
  assert(
    /if \(\(brakeByPairs \|\| brakeByDensity\) && detectedPhase !== 'presenca' && detectedPhase !== 'initial'\)/.test(SOURCE),
    "O freio deixou de ser aplicado antes de sair de presença/initial."
  );
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

Deno.test("Fase 2 — Postura Clínica: princípio mestre está no prompt geral", () => {
  assert(
    /POSTURA CL[IÍ]NICA \(princ[ií]pio mestre\)/.test(SOURCE),
    "Bloco 'POSTURA CLÍNICA (princípio mestre)' sumiu — princípio universal de ir contra a corrente foi removido."
  );
  assert(
    /Vá contra a corrente/.test(SOURCE),
    "Permissão 'Vá contra a corrente' sumiu do bloco POSTURA CLÍNICA."
  );
  assert(
    /Quando N[AÃ]O ir contra a corrente/.test(SOURCE),
    "Salvaguarda 'Quando NÃO ir contra a corrente' sumiu — risco de confronto sem propósito."
  );
});

// =============================================================================
// Fase 1 (rodada de "olhos do evaluator") — 5 cenários determinísticos
// =============================================================================

Deno.test("Fase 1 — extractor: schema declara information_density / user_reflection_mode / user_engaged_with_commitment", () => {
  assert(
    /"information_density":\s*"low\|medium\|saturated"/.test(SOURCE),
    "Campo information_density sumiu do schema do micro-agent extractor."
  );
  assert(
    /"user_reflection_mode":\s*true/.test(SOURCE),
    "Campo user_reflection_mode sumiu do schema do micro-agent extractor."
  );
  assert(
    /"user_engaged_with_commitment":\s*true/.test(SOURCE),
    "Campo user_engaged_with_commitment sumiu do schema do micro-agent extractor."
  );
});

Deno.test("Fase 1 — extractor: definição ESTRITA de information_density (3 elementos)", () => {
  // Sem os 3 elementos obrigatórios o Flash-lite classifica `saturated` por volume.
  assert(
    /CONTEXTO CONCRETO/.test(SOURCE) && /EMO[ÇC][ÃA]O NOMEADA/.test(SOURCE) && /CREN[ÇC]A\/ORIGEM/.test(SOURCE),
    "Os 3 elementos obrigatórios (CONTEXTO/EMOÇÃO/CRENÇA) sumiram da definição de information_density."
  );
  assert(
    /volume de texto N[ÃA]O conta/i.test(SOURCE),
    "Salvaguarda 'volume de texto NÃO conta' sumiu — risco de falso-positivo por verbosidade."
  );
});

Deno.test("Fase 1 — extractor: user_reflection_mode tem guarda anti concordância passiva", () => {
  assert(
    /Concordar com a assistente ≠ refletir/.test(SOURCE),
    "Guarda 'Concordar ≠ refletir' sumiu — risco de falso-positivo em 'ah faz sentido'."
  );
});

Deno.test("Cenário A — evaluator permite avanço com <4 pares se density=saturated", () => {
  // Bypass do freio rígido quando o conteúdo já está saturado.
  assert(
    /densitySaturated\s*=\s*lastUserContext\?\.information_density\s*===\s*['"]saturated['"]/.test(SOURCE),
    "Bypass densitySaturated no freio de pares sumiu — usuário denso voltaria a travar em presença."
  );
  assert(
    /const brakeByPairs = recentUserCount < 4 && !densitySaturated;/.test(SOURCE),
    "Condição do freio não incorpora !densitySaturated — bypass não está ativo."
  );
});

Deno.test("Cenário B — evaluator não avança por contagem se density!=saturated", () => {
  // O freio de pares continua armado quando não há saturação real (proteção contra avanço por clock puro).
  // Garantido pelo teste anterior + presença do freio original.
  assert(
    /const brakeByPairs = recentUserCount < 4 && !densitySaturated;/.test(SOURCE),
    "Freio de pares (<4) sumiu — risco de avanço prematuro por contagem cega."
  );
});

Deno.test("Cenário C — evaluator promove presenca→sentido quando user_reflection_mode=true", () => {
  assert(
    /user_reflection_mode\s*===\s*true\s*&&\s*detectedPhase\s*===\s*['"]presenca['"]/.test(SOURCE),
    "Upgrade por user_reflection_mode sumiu — usuário reflexivo continuaria preso em presença."
  );
});

Deno.test("Cenário D — rede de segurança permanece armada se user_engaged_with_commitment!=true", () => {
  // Disarm só por commitmentQuestionDetected era falso-positivo (Aura pergunta, usuário ignora, rede desarma).
  assert(
    /user_engaged_with_commitment\s*===\s*true/.test(SOURCE),
    "Checagem de user_engaged_with_commitment=true sumiu da rede de segurança."
  );
  assert(
    /userClosedLoop/.test(SOURCE),
    "Variável userClosedLoop sumiu — rede de segurança volta a desarmar por falso-positivo."
  );
});

Deno.test("Cenário E — sem sinal do extrator, a rede de segurança FICA armada (fail-closed)", () => {
  // Mudança deliberada: o fallback antigo ("auraAskedCommitment") desarmava a rede
  // sem fechamento real e era a raiz do arraste até 78min. Sem sinal → rede armada.
  assert(
    /const userClosedLoop = lastUserContext\?\.user_engaged_with_commitment === true;/.test(SOURCE),
    "A rede deve desarmar SOMENTE com user_engaged_with_commitment === true."
  );
  assert(
    !/const auraAskedCommitment|\|\| auraAskedCommitment/.test(SOURCE),
    "Resíduo: fallback auraAskedCommitment voltou e desarma a rede sem fechamento real."
  );
});

Deno.test("Nudge intermediário: só dispara com density=saturated (sem virar muleta de clock)", () => {
  assert(
    /sessionElapsedMin\s*>=\s*15[\s\S]{0,400}densitySaturated/.test(SOURCE),
    "Nudge intermediário (15min) sem gate de densitySaturated viraria muleta de clock — gate sumiu."
  );
  assert(
    /NOTA DE TIMING/.test(SOURCE),
    "Header 'NOTA DE TIMING' sumiu — nudge precisa ser descritivo, não AÇÃO OBRIGATÓRIA."
  );
});

// =============================================================================
// Higiene de Interpretação (Fase 2) — FREIO DE PRESENÇA estendido por density
// =============================================================================

Deno.test("Higiene de interpretação: freio dispara também por density=low, não só por contagem de pares", () => {
  assert(
    /densityLow\s*=\s*lastUserContext\?\.information_density\s*===\s*['"]low['"]/.test(SOURCE),
    "Variável densityLow sumiu — freio de presença voltaria a depender só de contagem de pares."
  );
  assert(
    /brakeByDensity\s*=\s*densityLow\s*&&\s*!userReflecting/.test(SOURCE),
    "brakeByDensity sumiu — Aura voltaria a interpretar em cima de material raso após 4+ pares."
  );
  assert(
    /brakeByPairs\s*\|\|\s*brakeByDensity/.test(SOURCE),
    "Condição combinada (brakeByPairs || brakeByDensity) sumiu do gatilho do freio."
  );
});

Deno.test("Higiene de interpretação: user_reflection_mode desarma o freio por density", () => {
  assert(
    /userReflecting\s*=\s*lastUserContext\?\.user_reflection_mode\s*===\s*true/.test(SOURCE),
    "Escape hatch por user_reflection_mode sumiu — usuário reflexivo ficaria travado em presença mesmo entregando material."
  );
});

Deno.test("Higiene de interpretação: bloco do freio nomeia o motivo real (material raso) e exige exploração ativa", () => {
  assert(
    /material ainda raso/.test(SOURCE),
    "Texto 'material ainda raso' sumiu — freio precisa explicar o motivo real para o modelo, não só citar contagem."
  );
  assert(
    /Explora[çc][ãa]o ativa, n[ãa]o sil[êe]ncio/.test(SOURCE),
    "Regra 'Exploração ativa, não silêncio' sumiu — risco de Aura ficar seca/curta no freio."
  );
});
// ===== Muleta do relógio: garantias de que o tempo é sinal, não condutor =====

Deno.test("Relógio: prompt não expõe tempo decorrido/restante ao modelo", () => {
  assert(
    !/Tempo decorrido: \$\{/.test(SOURCE),
    "Voltou a injetar 'Tempo decorrido: X min' no prompt — muleta do relógio."
  );
  assert(
    !/faltam \$\{timeRemaining\}/.test(SOURCE),
    "Voltou 'faltam ${timeRemaining} min' no prompt de sessão."
  );
});

Deno.test("Relógio: regra de ouro do tempo está no contexto de sessão", () => {
  assert(
    /REGRA DE OURO DO TEMPO/.test(SOURCE),
    "A 'REGRA DE OURO DO TEMPO' sumiu do contexto de sessão."
  );
});

Deno.test("Fechamento: aterrissagem exige consentimento do usuário", () => {
  assert(
    /ATERRISSAGEM \(com consentimento\)/.test(SOURCE),
    "O bloco de aterrissagem com consentimento sumiu do final_closing."
  );
  assert(
    /Inclua \[ENCERRAR_SESSAO\] SOMENTE na resposta em que você efetivamente se despedir/.test(SOURCE),
    "A trava de emitir [ENCERRAR_SESSAO] só após o aceite sumiu."
  );
});

Deno.test("Fechamento: teto operacional é 2x a duração prevista", () => {
  assert(
    /const hardCapMin = duration \* 2;/.test(SOURCE),
    "O teto operacional (2x duração) sumiu do cálculo de fases."
  );
  assert(
    /elapsedMinutes <= duration \+ 15/.test(SOURCE),
    "A janela de costura (duration + 15) sumiu do cálculo de fases."
  );
});
