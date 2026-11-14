import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { entitledAccessUntil } from "./woovi-access.ts";

Deno.test("mensalidade recusada com mandato vivo mantém 28 dias de carência", () => {
  const r = entitledAccessUntil("2026-10-10T12:00:00Z", "cycle", "monthly", true);
  assertEquals(r.entitledUntil.toISOString().slice(0, 10), "2026-12-08");
});

Deno.test("mandato cancelado não tem carência", () => {
  const r = entitledAccessUntil("2026-10-10T12:00:00Z", "cycle", "monthly", false);
  assertEquals(r.entitledUntil.toISOString().slice(0, 10), "2026-11-10");
});

Deno.test("entrada de teste não ganha carência", () => {
  const r = entitledAccessUntil("2026-11-01T12:00:00Z", "entry", "monthly", true);
  assertEquals(r.entitledUntil.toISOString().slice(0, 10), "2026-11-09");
});
