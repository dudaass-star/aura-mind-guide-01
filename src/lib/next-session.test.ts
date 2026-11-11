import { describe, expect, it } from "bun:test";
import { planSessionLimit, suggestNextSession } from "./next-session";

// Quarta, 11/11/2026 16:00 BRT = 19:00 UTC
const LAST = "2026-11-11T19:00:00.000Z";
const NOW = new Date("2026-11-11T20:00:00.000Z");

describe("ritmo do próximo encontro", () => {
  it("Essencial tem 2 encontros por mês", () => expect(planSessionLimit("essencial")).toBe(2));
  it("Direção tem 4 e Transformação tem 8", () => {
    expect(planSessionLimit("direcao")).toBe(4);
    expect(planSessionLimit("transformacao")).toBe(8);
  });
  it("Essencial sugere 14 dias depois, mesmo horário", () =>
    expect(suggestNextSession("essencial", LAST, NOW).toISOString()).toBe("2026-11-25T19:00:00.000Z"));
  it("Direção sugere 7 dias depois", () =>
    expect(suggestNextSession("direcao", LAST, NOW).toISOString()).toBe("2026-11-18T19:00:00.000Z"));
  it("Transformação: quarta → sábado (+3)", () =>
    expect(suggestNextSession("transformacao", LAST, NOW).toISOString()).toBe("2026-11-14T19:00:00.000Z"));
  it("Transformação: quinta → segunda (+4)", () =>
    expect(suggestNextSession("transformacao", "2026-11-12T22:00:00.000Z", NOW).toISOString()).toBe("2026-11-16T22:00:00.000Z"));
});
