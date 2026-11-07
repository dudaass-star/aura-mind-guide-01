import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildMessage, firstName } from "./messages.ts";

Deno.test("usa só o primeiro nome", () => {
  assertEquals(firstName("Cirlei Fátima de Andrade"), "Cirlei");
  assert(buildMessage("d3", "Jeane Aparecida Barbosa Bom", "x").startsWith("Oi, Jeane."));
});

Deno.test("nunca fala de pagamento, mesmo com falha", () => {
  for (const st of ["d3", "d14", "d30"] as const) {
    const m = buildMessage(st, "Ana", "x", true).toLowerCase();
    assert(!m.includes("pagamento"), st);
  }
});
