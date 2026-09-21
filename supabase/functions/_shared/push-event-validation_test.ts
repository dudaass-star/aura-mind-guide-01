import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canRecordPushEvent } from "./push-event-validation.ts";

Deno.test("abertura só pertence a uma entrega push enviada", () => {
  assertEquals(canRecordPushEvent("opened", { selected_channel: "push", status: "sent" }), true);
  assertEquals(canRecordPushEvent("opened", { selected_channel: "whatsapp", status: "sent" }), false);
  assertEquals(canRecordPushEvent("opened", { selected_channel: "push", status: "scheduled" }), false);
});

Deno.test("conversão exige abertura anterior da entrega push", () => {
  assertEquals(canRecordPushEvent("converted", { selected_channel: "push", status: "opened" }), true);
  assertEquals(canRecordPushEvent("converted", { selected_channel: "push", status: "sent" }), false);
  assertEquals(canRecordPushEvent("converted", { selected_channel: "none", status: "opened" }), false);
});

Deno.test("repetições de estados finais permanecem idempotentes", () => {
  assertEquals(canRecordPushEvent("opened", { selected_channel: "push", status: "converted" }), true);
  assertEquals(canRecordPushEvent("converted", { selected_channel: "push", status: "converted" }), true);
});