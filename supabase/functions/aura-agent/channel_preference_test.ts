// Regressão do caso Bruna: pedidos naturais de texto devem ser reconhecidos
// nos dois pontos que decidem e persistem a preferência de canal.
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const AGENT_SOURCE = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const WORKER_SOURCE = await Deno.readTextFile(
  new URL("../process-webhook-message/index.ts", import.meta.url),
);

const REQUIRED_PHRASES = [
  "não mande áudio",
  "não envie áudio",
  "prefiro ler",
  "por mensagem",
  "não quero ouvir áudio",
];

for (const phrase of REQUIRED_PHRASES) {
  Deno.test(`Preferência de texto: "${phrase}" está coberta nos dois detectores`, () => {
    assert(AGENT_SOURCE.includes(`'${phrase}'`), `aura-agent não cobre: ${phrase}`);
    assert(WORKER_SOURCE.includes(`'${phrase}'`), `process-webhook-message não cobre: ${phrase}`);
  });
}

Deno.test("Preferência de texto continua precedendo os gatilhos obrigatórios de áudio", () => {
  const decisionStart = AGENT_SOURCE.indexOf("function determineAudioMode");
  const decisionEnd = AGENT_SOURCE.indexOf("\nfunction ", decisionStart + 1);
  const decisionSource = AGENT_SOURCE.slice(decisionStart, decisionEnd);
  const textGuard = decisionSource.indexOf("reason: 'user_prefers_text'");
  const crisisRule = decisionSource.indexOf("reason: 'crisis'");
  const openingRule = decisionSource.indexOf("reason: 'session_opening'");
  const closingRule = decisionSource.indexOf("reason: 'session_closing'");

  assert(decisionStart >= 0, "determineAudioMode ausente");
  assert(textGuard >= 0, "bloqueio user_prefers_text ausente");
  assert(textGuard < crisisRule, "crise passou a preceder a preferência de texto");
  assert(textGuard < openingRule, "abertura passou a preceder a preferência de texto");
  assert(textGuard < closingRule, "fechamento passou a preceder a preferência de texto");
});

Deno.test("Pedidos explícitos de áudio continuam reconhecidos", () => {
  assert(AGENT_SOURCE.includes("'manda um áudio'"));
  assert(WORKER_SOURCE.includes("'manda um áudio'"));
  assert(AGENT_SOURCE.includes("reason: 'user_requested'"));
});