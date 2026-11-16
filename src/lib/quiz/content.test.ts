// @ts-ignore -- executado com bun test, fora do typecheck do app
import { describe, it, expect } from "bun:test";
import { THEMES, BARRIERS, STARTS, composeReading } from "./content";

describe("quiz", () => {
  it("todo caminho tem 4 opções", () => {
    expect(THEMES).toHaveLength(4); expect(BARRIERS).toHaveLength(4); expect(STARTS).toHaveLength(4);
    for (const t of THEMES) expect(t.patterns).toHaveLength(4);
  });
  it("toda combinação gera uma leitura", () => {
    for (const t of THEMES) for (const p of t.patterns) for (const b of BARRIERS) for (const s of STARTS)
      expect(composeReading({ theme: t.id, pattern: p.id, barrier: b.id, start: s.id })).not.toBeNull();
  });
  it("combinação inválida não gera leitura", () => {
    expect(composeReading({ theme: "relacoes", pattern: "sim", barrier: "guarda", start: "encontro" })).toBeNull();
  });
});
