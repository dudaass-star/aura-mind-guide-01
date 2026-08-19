// Testes de comportamento da detecção de PERGUNTA PRÁTICA.
// Estratégia: extrai os 3 regex + a função do próprio index.ts e avalia num
// escopo isolado. Motivo: importar index.ts sobe o servidor Deno.serve; ler a
// fonte garante que estamos testando exatamente o código que roda em produção.

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SOURCE = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

function extract(pattern: RegExp, label: string): string {
  const m = SOURCE.match(pattern);
  assert(m, `Não encontrei ${label} em index.ts — a implementação mudou de forma.`);
  return m![0];
}

const emotional = extract(/export const EMOTIONAL_LOAD_REGEX = \/.*?\/i;/s, "EMOTIONAL_LOAD_REGEX");
const opener = extract(/const PRACTICAL_OPENER = \/.*?\/i;/s, "PRACTICAL_OPENER");
const reflexive = extract(/const REFLEXIVE_QUESTION = \/.*?\/i;/s, "REFLEXIVE_QUESTION");
const fn = extract(/export function isPracticalQuestion[\s\S]*?\n}/, "isPracticalQuestion");

const isPracticalQuestion = new Function(
  `${emotional.replace('export const', 'const')}
   ${opener}
   ${reflexive}
   ${fn
     .replace('export function', 'function')
     .replace('(msg?: string | null): boolean', '(msg)')}
   return isPracticalQuestion;`
)() as (msg?: string | null) => boolean;

const PRATICAS = [
  "pilates faz mais efeito que musculação?",
  "como faço arroz de forno?",
  "me indica um filme bom",
  "vale a pena trocar de celular?",
  "tem como agendar isso pra sexta?",
];

// Provam que não há limitação de escopo: fora de qualquer lista, com erro de digitação
const PRATICAS_FORA_DA_LISTA = [
  "kual o melhor horario pra treinar?",
  "faz mal tomar café a noite?",
  "quanto tempo dura tinta de parede?",
];

// Provam que remover pode|posso|dá pra da lista não perdeu cobertura
const PRATICAS_COM_MODAL = [
  "pode tomar café a noite?",
  "dá pra congelar arroz cozido?",
];

const NAO_PRATICAS = [
  "oi",
  "cadê você?",
  "por que eu sou assim?",
  "por que isso sempre acontece comigo?",
  "onde foi que eu errei?",
  "cadê você quando eu preciso?",
  "tô muito ansiosa hoje",
  "você ainda gosta de mim?",
  "será que eu mereço isso?",
];

// Adversariais: modal genérico abrindo frase de sofrimento (não é pergunta)
const ADVERSARIAIS_MODAL = [
  "posso não aguentar mais isso",
  "pode ser que ele nunca volte",
  "dá pra ver que eu não sirvo pra isso",
  "posso estar exagerando mas ele me ignorou",
];

Deno.test("perguntas práticas retornam true", () => {
  for (const msg of [...PRATICAS, ...PRATICAS_FORA_DA_LISTA, ...PRATICAS_COM_MODAL]) {
    assert(isPracticalQuestion(msg) === true, `Esperava true para "${msg}"`);
  }
});

Deno.test("vazio/nulo retorna false", () => {
  assert(isPracticalQuestion(undefined) === false);
  assert(isPracticalQuestion(null) === false);
  assert(isPracticalQuestion('') === false);
});

Deno.test("desabafo, saudação e pergunta reflexiva retornam false", () => {
  for (const msg of NAO_PRATICAS) {
    assert(isPracticalQuestion(msg) === false, `Esperava false para "${msg}"`);
  }
});

Deno.test("adversariais com modal genérico (pode/posso/dá pra) retornam false", () => {
  for (const msg of ADVERSARIAIS_MODAL) {
    assert(isPracticalQuestion(msg) === false, `Esperava false para "${msg}"`);
  }
});

Deno.test("PRACTICAL_OPENER não contém modais genéricos", () => {
  for (const termo of ["pode", "posso", "d[áa] pra", "da pra"]) {
    assert(!opener.includes(`|${termo}|`) && !opener.includes(`|${termo})`),
      `"${termo}" não pode estar em PRACTICAL_OPENER — inicia frase afirmativa de desabafo.`);
  }
});

Deno.test("exclusões rodam antes de qualquer return true (ordem no código)", () => {
  const iEmotional = fn.indexOf("EMOTIONAL_LOAD_REGEX.test");
  const iReflexive = fn.indexOf("REFLEXIVE_QUESTION.test");
  const iOpener = fn.indexOf("PRACTICAL_OPENER.test");
  const iEndsWith = fn.indexOf("endsWith('?')");
  assert(iEmotional > -1 && iReflexive > -1 && iOpener > -1 && iEndsWith > -1);
  assert(iEmotional < iOpener && iReflexive < iOpener, "Exclusões devem preceder PRACTICAL_OPENER");
  assert(iOpener < iEndsWith, "endsWith('?') deve ser o último recurso");
});

Deno.test("gate de crise precede a saída de pergunta prática no evaluator", () => {
  const iCrisis = SOURCE.indexOf("PRIORIDADE ABSOLUTA: Acolhimento");
  const iPractical = SOURCE.indexOf("pergunta prática detectada → ping-pong");
  assert(iCrisis > -1 && iPractical > -1);
  assert(iCrisis < iPractical, "A saída de pergunta prática não pode vir antes do protocolo de crise.");
  assert(
    /!crisisOrVulnerable && !disengaged && isPracticalQuestion/.test(SOURCE),
    "As guardas explícitas de crise/resistência devem estar na condição da saída de pergunta prática."
  );
});