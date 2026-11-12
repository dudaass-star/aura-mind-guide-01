import { describe, it, expect } from "vitest";
import { pickEvolution, isFreshlySealed } from "./percurso-story";

const s = (id: string, date: string, before: string | null, change: string | null) => ({ id, snapshot_before: before, snapshot_change: change, evidence_date: date, period_end: null });

describe("pickEvolution", () => {
  it("usa o antes mais antigo e o agora mais recente", () => {
    const r = pickEvolution([s("b", "2026-10-20", null, "agora eu coloco limite"), s("a", "2026-06-01", "medo da cobrança", null)]);
    expect(r?.beforeText).toBe("medo da cobrança");
    expect(r?.nowText).toBe("agora eu coloco limite");
  });
  it("não mostra evolução com menos de 20 dias", () => {
    expect(pickEvolution([s("a", "2026-10-01", "x", null), s("b", "2026-10-10", null, "y")])).toBeNull();
  });
});

describe("isFreshlySealed", () => {
  it("anuncia o mês anterior até o dia 7", () => {
    expect(isFreshlySealed("2026-10-15T12:00:00", new Date(2026, 10, 7))).toBe(true);
    expect(isFreshlySealed("2026-10-15T12:00:00", new Date(2026, 10, 8))).toBe(false);
  });
});
