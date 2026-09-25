import {
  buildPortalWelcome,
  isRecentCustomer,
  portalWelcomeSource,
  resolveEntryContext,
} from "./onboarding-policy.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("cliente recente recebe recepção de novo cliente", () => {
  const now = new Date("2026-09-25T14:00:00.000Z");
  assert(isRecentCustomer({ created_at: "2026-09-25T13:00:00.000Z" }, now), "deveria ser recente");
  assert(resolveEntryContext("regular", { created_at: "2026-09-25T13:00:00.000Z" }, now) === "new", "deveria resolver como novo");
  assert(buildPortalWelcome("Eduardo", "new")?.includes("o que fez você chegar até mim hoje?"), "deveria abrir com pergunta simples");
});

Deno.test("cliente antigo sem indicação não recebe boas-vindas repetidas", () => {
  const now = new Date("2026-09-25T14:00:00.000Z");
  const context = resolveEntryContext("regular", { created_at: "2026-07-01T13:00:00.000Z" }, now);
  assert(context === "regular", "deveria permanecer regular");
  assert(buildPortalWelcome("Eduardo", context) === null, "não deveria criar saudação");
});

Deno.test("migração tem texto próprio mesmo para cadastro antigo", () => {
  const now = new Date("2026-09-25T14:00:00.000Z");
  const context = resolveEntryContext("migration", { created_at: "2025-01-01T00:00:00.000Z" }, now);
  const message = buildPortalWelcome("Eduardo", context);
  assert(context === "migration", "deveria preservar migração");
  assert(message?.includes("Sua história continua aqui"), "deveria reconhecer continuidade");
  assert(!message?.includes("o que fez você chegar"), "não deveria usar abertura de novo cliente");
});

Deno.test("fonte da saudação é estável para impedir duplicidade", () => {
  assert(portalWelcomeSource("new") === "portal-welcome-v1:new", "fonte nova deveria ser estável");
  assert(portalWelcomeSource("migration") === "portal-welcome-v1:migration", "fonte de migração deveria ser estável");
});