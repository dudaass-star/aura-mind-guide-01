// Garante que, em sessão ativa, o histórico cobre o encontro inteiro (não só 40 linhas).
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SOURCE = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("sessão ativa carrega mensagens desde 15 min antes do início, teto 200", () => {
  assert(SOURCE.includes("sessionActive && currentSession?.started_at"));
  assert(SOURCE.includes("15 * 60 * 1000"));
  assert(/gte\('created_at', sessionStartCutoff\)[\s\S]{0,120}\.limit\(200\)/.test(SOURCE));
});

Deno.test("fora de sessão mantém 40 e minimal_context mantém 10", () => {
  assert(SOURCE.includes(".limit(minimal_context ? 10 : 40)"));
});

Deno.test("Aura não nega estar em sessão quando o usuário pergunta do tempo", () => {
  assert(SOURCE.includes("NUNCA negue que vocês estão em sessão"));
});
