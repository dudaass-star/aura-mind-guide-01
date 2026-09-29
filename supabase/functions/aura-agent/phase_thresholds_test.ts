// Testes de garantia para os thresholds do Phase Evaluator (Fase 1).
// Estratégia: análise estática do arquivo index.ts.
// Motivo: evaluateTherapeuticPhase não é exportada e depende de muito contexto;
// validar via texto é o jeito mais confiável de garantir que os números corretos
// estão no código e que não voltaram resíduos antigos (>= 7 / >= 8).

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SOURCE_PATH = new URL("./index.ts", import.meta.url);
const SOURCE = await Deno.readTextFile(SOURCE_PATH);

Deno.test("Continuidade: fio independente de compromisso e abertura sem frase-modelo", () => {
  assert(SOURCE.includes("session.continuity_thread"), "Fio não chega ao contexto das sessões anteriores.");
  assert(SOURCE.includes("session_summary, continuity_thread, key_insights"), "Fio não é consultado no histórico.");
  assert(SOURCE.includes("Não copie um modelo de frase, não cobre um resultado"), "A abertura voltou a induzir frase ou cobrança mecânica.");
  assert(SOURCE.includes("Não confunda esse fio com compromisso aceito"), "Fio e compromisso voltaram a se misturar.");
});

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

Deno.test("Naturalidade: leituras não exigem ritual explícito de confirmação", () => {
  assert(
    /LEITURA SEM RITUAL DE CONFIRMAÇÃO/.test(SOURCE),
    "A regra central contra checagem mecânica de interpretações sumiu."
  );
  assert(
    /como isso bate\/pesa\/soa\/chega em você/.test(SOURCE),
    "A família de perguntas repetitivas deixou de estar explicitamente bloqueada."
  );
  assert(
    /a fala do usuário prevalece/i.test(SOURCE),
    "A proteção interna que dá primazia à correção do usuário sumiu."
  );
  assert(
    /leituras não confirmadas não viram fato ou memória/i.test(SOURCE),
    "A proteção contra salvar interpretação não confirmada sumiu."
  );
});

Deno.test("Naturalidade: instruções táticas não obrigam verbalizar correção ou discordância", () => {
  const bannedObligations = [
    "deixe explícito, com palavras suas, que é uma leitura que o usuário pode corrigir ou recusar",
    "sinalize, com palavras suas, que ele pode discordar",
    "abra espaço pra correção com palavras suas",
    "deixe claro, com palavras suas e formulação inédita nesta conversa, que ele pode recusar ou corrigir",
  ];

  for (const instruction of bannedObligations) {
    assert(!SOURCE.includes(instruction), `Obrigação antiga ainda presente: ${instruction}`);
  }
});

Deno.test("Naturalidade: não repete pergunta já respondida nem cria questionário em sequência", () => {
  assert(
    /Nunca repita uma pergunta que o usuário já respondeu/.test(SOURCE),
    "A proteção contra repetir perguntas já respondidas sumiu."
  );
  assert(
    /uma nova pergunta só entra quando abrir um ângulo realmente diferente/.test(SOURCE),
    "A pergunta voltou a ser obrigatória mesmo sem um ângulo novo."
  );
  assert(
    /não faça perguntas em duas respostas consecutivas/.test(SOURCE),
    "A proteção contra cadência de questionário em respostas consecutivas sumiu."
  );
  assert(
    /Uma resposta afirmativa, sem interrogação, também conduz/.test(SOURCE),
    "A orientação para conduzir sem transformar toda fala em pergunta sumiu."
  );
});

Deno.test("Naturalidade em sessão: exploração não obriga observação e pergunta no mesmo turno", () => {
  const bannedCadence = [
    "exploração normal — observação + pergunta",
    "1 observação perceptiva + 1 pergunta que abre. Por turno.",
    "EXPLORAÇÃO. Vá mais fundo. Uma observação + uma pergunta.",
  ];

  for (const instruction of bannedCadence) {
    assert(!SOURCE.includes(instruction), `Cadência obrigatória antiga ainda presente: ${instruction}`);
  }

  assert(
    /não combine observação e pergunta por padrão/.test(SOURCE),
    "A exploração deixou de orientar alternância sem fórmula obrigatória."
  );
  assert(
    /Se a resposta anterior da AURA terminou com pergunta, a próxima deve reagir/.test(SOURCE),
    "A proteção específica contra perguntas consecutivas sumiu da sessão."
  );
  assert(
    /Não termine com pergunta por hábito e não faça perguntas em respostas consecutivas/.test(SOURCE),
    "O reforço dinâmico da exploração voltou a induzir questionário."
  );
});

Deno.test("Encerramento: pedido explícito do usuário não é bloqueado pela fase da sessão", () => {
  assert(
    /assistantMessage\.includes\('\[ENCERRAR_SESSAO\]'\) && !shouldEndSession/.test(SOURCE),
    "A trava de encerramento precoce voltou a bloquear pedidos explícitos do usuário."
  );
  assert(
    /assistantMessage\.includes\('\[CONVERSA_CONCLUIDA\]'\) && !shouldEndSession/.test(SOURCE),
    "A conversão de conversa concluída voltou a apagar o pedido explícito do usuário."
  );
});

Deno.test("Naturalidade no encerramento: pedido explícito não reabre investigação", () => {
  assert(
    /depois de sintetizar e se despedir, termine ali/.test(SOURCE),
    "O encerramento voltou a permitir uma nova investigação depois da despedida."
  );
  assert(
    /NÃO faça outro convite nem termine com pergunta corporal, emocional ou reflexiva/.test(SOURCE),
    "A proteção dinâmica contra check-in artificial no fechamento sumiu."
  );
  assert(
    SOURCE.includes('"como você tá sentindo seu corpo agora?"'),
    "O exemplo real que reabriu a sessão deixou de estar explicitamente bloqueado."
  );
});

Deno.test("Naturalidade: não inventa sensação corporal nem troca a checagem por equivalente", () => {
  assert(
    SOURCE.includes('"como tá sendo sustentar isso?"'),
    "A variação observada de checagem ritual deixou de estar explicitamente bloqueada."
  );
  assert(
    /Não invente sensação corporal que a pessoa não relatou/.test(SOURCE),
    "A proteção contra atribuir sensação corporal ao usuário sumiu."
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

Deno.test("Fechamento: pedido explícito aceita linguagem natural com artigo ou pronome", () => {
  assert(
    /\(\?:encerrar\|terminar\|finalizar\|acabar\|parar\|fechar\)/.test(SOURCE),
    "O detector deixou de reconhecer os verbos explícitos de encerramento."
  );
  assert(
    /\(\?:sessao\|encontro\)/.test(SOURCE),
    "O detector deixou de vincular o encerramento à sessão ou encontro."
  );
  assert(
    /\(\?:\\s\+\\w\+\)\{0,3\}/.test(SOURCE),
    "O detector voltou a exigir verbo e sessão colados, sem aceitar 'a/nossa sessão'."
  );
});

// ============================================================
// UNIFICAÇÃO DOS JUÍZES DE RECUSA DE FECHAMENTO
// A rede de segurança pós-geração e o avaliador de fase precisam usar
// o MESMO detector (userDeclinedClosure), sem limiar próprio divergente.
// ============================================================
Deno.test("rede de segurança usa userDeclinedClosure (juiz único de recusa)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const netIdx = src.indexOf("Safety net suprimida");
  if (netIdx === -1) throw new Error("bloco da rede de segurança não encontrado");
  const block = src.slice(netIdx - 1800, netIdx + 400);
  if (!block.includes("userDeclinedClosure(messageHistory)")) {
    throw new Error("rede de segurança não chama userDeclinedClosure");
  }
  if (!block.includes("declinedClosure")) {
    throw new Error("recusa unificada não entra no cálculo de turno aberto");
  }
  // recusa explícita também protege no teto operacional
  if (!/currentPhase !== 'overtime' \|\| declinedClosure/.test(block)) {
    throw new Error("overtime ignora recusa explícita de fechamento");
  }
});
