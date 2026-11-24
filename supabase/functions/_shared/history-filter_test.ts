import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isConversationMessage } from "./history-filter.ts";
Deno.test("convite de migração do WhatsApp não entra em resumos", () => {
  assertEquals(isConversationMessage({ metadata: { kind: "app_migration_redirect" } }), false);
  assertEquals(isConversationMessage({ metadata: { kind: "whatsapp_access_notice" } }), false);
});
Deno.test("fala comum entra em resumos", () => {
  assert(isConversationMessage({ metadata: null }));
});
