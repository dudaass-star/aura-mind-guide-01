import { describe, it, expect } from "vitest";
import { isWhatsAppOnlyNotice } from "@/components/portal/ConversarTab";

describe("avisos só do WhatsApp", () => {
  it("esconde o convite de migração ao App", () => {
    expect(isWhatsAppOnlyNotice({ role: "assistant", metadata: { kind: "app_migration_redirect" } })).toBe(true);
  });
  it("mantém respostas normais da Aura", () => {
    expect(isWhatsAppOnlyNotice({ role: "assistant", metadata: {} })).toBe(false);
  });
  it("mantém falas do cliente vindas do WhatsApp", () => {
    expect(isWhatsAppOnlyNotice({ role: "user", metadata: { kind: "app_migration_redirect" } })).toBe(false);
  });
});
