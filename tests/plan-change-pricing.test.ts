import { test, expect } from "bun:test";
import { PLAN_CHANGE_CYCLES, planChangeInitialCycle, annualPlanSavings } from "../src/lib/plan-pricing";

test("troca de plano oferece somente mensal e anual", () => {
  expect(PLAN_CHANGE_CYCLES).toEqual(["monthly", "yearly"]);
});
test("ciclos antigos não deixam uma opção invisível selecionada", () => {
  expect(planChangeInitialCycle("quarterly")).toBe("monthly");
  expect(planChangeInitialCycle("semiannual")).toBe("monthly");
  expect(planChangeInitialCycle("yearly")).toBe("yearly");
});
test("economia anual usa os preços existentes de cada plano", () => {
  expect(annualPlanSavings("essencial")).toEqual({ total: 118.8, savings: 240, percent: 67 });
  expect(annualPlanSavings("direcao")).toEqual({ total: 202.8, savings: 396, percent: 66 });
  expect(annualPlanSavings("transformacao")).toEqual({ total: 322.8, savings: 636, percent: 66 });
});