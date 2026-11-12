import { describe, it, expect } from "bun:test";
import { hasMonthlySubstance } from "./monthly-report-eligibility";
describe("hasMonthlySubstance", () => {
  it("mês silencioso não gera aviso", () => expect(hasMonthlySubstance({ sessions: 0, messages: 9 })).toBe(false));
  it("1 sessão concluída basta", () => expect(hasMonthlySubstance({ sessions: 1, messages: 0 })).toBe(true));
  it("10 mensagens bastam", () => expect(hasMonthlySubstance({ sessions: 0, messages: 10 })).toBe(true));
});
